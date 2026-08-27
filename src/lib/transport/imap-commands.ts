import type { CoreSocket } from "edgeport/core";
import type { MailAuth } from "./credentials";
import { imapMailboxArg } from "./imap-mailbox-names";
import {
  imapQuote,
  parseCopyUid,
  parseListAttributes,
  parseListDelimiter,
  parseListMailbox,
  parseNamespacePersonal,
  type MailboxNamespace,
} from "./imap-uid-set";
import { connectImapSocket } from "./oauth-connect";

const decoder = new TextDecoder();
const CR = 0x0d;
const LF = 0x0a;

function endsWithCrlf(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[bytes.length - 2] === CR && bytes[bytes.length - 1] === LF;
}

function concatCrlf(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength + 2);
  out.set(bytes, 0);
  out.set([CR, LF], bytes.byteLength);
  return out;
}

/** One `* LIST` reply: the mailbox path and its attributes, SPECIAL-USE included. */
export type MailboxEntry = { path: string; attributes: string[] };

export type MailboxListing = {
  entries: MailboxEntry[];
  paths: string[];
  delimiter: string | null;
};

export class ImapCommandError extends Error {
  constructor(
    readonly status: "NO" | "BAD",
    readonly text: string,
  ) {
    super(`IMAP ${status}: ${text}`);
    this.name = "ImapCommandError";
  }
}

type ImapResponse = {
  status: "OK" | "NO" | "BAD";
  text: string;
  untagged: string[];
};

/**
 * A tagged IMAP connection that can STORE/COPY/MOVE — edgeport's session is read-only.
 */
export class ImapMutator {
  #socket: CoreSocket;
  #timeoutMs: number;
  #tag = 0;
  #selected: string | null = null;

  private constructor(socket: CoreSocket, timeoutMs: number) {
    this.#socket = socket;
    this.#timeoutMs = timeoutMs;
  }

  static async open(credentials: MailAuth, timeoutMs = 30_000): Promise<ImapMutator> {
    const socket = await connectImapSocket(credentials);
    const mutator = new ImapMutator(socket, timeoutMs);
    try {
      await mutator.#handshake(credentials);
      return mutator;
    } catch (error) {
      await socket.close().catch(() => undefined);
      throw error;
    }
  }

  async select(mailbox: string): Promise<void> {
    if (this.#selected === mailbox) return;
    await this.command(`SELECT ${imapMailboxArg(mailbox)}`);
    this.#selected = mailbox;
  }

  async storeFlags(uids: number[], flags: string[], add: boolean): Promise<void> {
    if (uids.length === 0) return;
    const op = add ? "+FLAGS.SILENT" : "-FLAGS.SILENT";
    await this.command(`UID STORE ${uids.join(",")} ${op} (${flags.join(" ")})`);
  }

  async createMailbox(name: string): Promise<void> {
    await this.command(`CREATE ${imapMailboxArg(name)}`);
    // Subscribing is what makes the folder appear in other clients' folder lists.
    await this.subscribe(name).catch(() => undefined);
  }

  async renameMailbox(from: string, to: string): Promise<void> {
    await this.command(`RENAME ${imapMailboxArg(from)} ${imapMailboxArg(to)}`);
    await this.subscribe(to).catch(() => undefined);
  }

  async deleteMailbox(name: string): Promise<void> {
    // A selected mailbox cannot be deleted, so step off it first.
    if (this.#selected) {
      await this.command("CLOSE").catch(() => undefined);
      this.#selected = null;
    }
    await this.command(`UNSUBSCRIBE ${imapMailboxArg(name)}`).catch(() => undefined);
    await this.command(`DELETE ${imapMailboxArg(name)}`);
  }

  async subscribe(name: string): Promise<void> {
    await this.command(`SUBSCRIBE ${imapMailboxArg(name)}`);
  }

  async listMailboxes(): Promise<string[]> {
    return (await this.listMailboxListing()).paths;
  }

  async listMailboxListing(): Promise<MailboxListing> {
    const result = await this.command('LIST "" "*"');
    const entries: MailboxEntry[] = [];
    let delimiter: string | null = null;
    for (const line of result.untagged) {
      const delim = parseListDelimiter(line);
      if (delim && delimiter == null) delimiter = delim;
      const mailbox = parseListMailbox(line);
      if (mailbox) entries.push({ path: mailbox, attributes: parseListAttributes(line) });
    }
    return { entries, paths: entries.map((entry) => entry.path), delimiter };
  }

  async personalNamespace(): Promise<MailboxNamespace | null> {
    try {
      const result = await this.command("NAMESPACE");
      for (const line of result.untagged) {
        const parsed = parseNamespacePersonal(line);
        if (parsed) return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  async move(uids: number[], destination: string): Promise<Map<number, number>> {
    if (uids.length === 0) return new Map();
    const dest = imapMailboxArg(destination);
    const set = uids.join(",");
    try {
      return parseCopyUid(await this.command(`UID MOVE ${set} ${dest}`));
    } catch (error) {
      if (!(error instanceof ImapCommandError)) throw error;
      const copied = parseCopyUid(await this.command(`UID COPY ${set} ${dest}`));
      await this.storeFlags(uids, ["\\Deleted"], true);
      try {
        await this.command(`UID EXPUNGE ${set}`);
      } catch {
        await this.command("EXPUNGE");
      }
      return copied;
    }
  }

  async expungeUids(uids: number[]): Promise<void> {
    if (uids.length === 0) return;
    await this.storeFlags(uids, ["\\Deleted"], true);
    const set = uids.join(",");
    try {
      await this.command(`UID EXPUNGE ${set}`);
    } catch {
      await this.command("EXPUNGE");
    }
  }

  async close(): Promise<void> {
    try {
      await this.command("LOGOUT");
    } catch {
      // Closing is best-effort; the socket drop is what matters.
    }
    this.#selected = null;
    await this.#socket.close();
  }

  /**
   * Uploads a message into a mailbox. APPEND cannot go through `command` because the
   * body is sent as a literal: the server answers `+` to say it is ready, and only
   * then are the raw octets written.
   */
  async appendMessage(mailbox: string, raw: Uint8Array, flags: string[] = []): Promise<void> {
    // The literal length counts octets exactly, and the message must end CRLF.
    const body = endsWithCrlf(raw) ? raw : concatCrlf(raw);
    const tag = this.#nextTag();
    const flagPart = flags.length > 0 ? ` (${flags.join(" ")})` : "";

    await this.#socket.writer.writeLine(
      `${tag} APPEND ${imapMailboxArg(mailbox)}${flagPart} {${body.byteLength}}`,
    );

    const ready = await this.#socket.reader.readLine(this.#timeoutMs);
    if (!ready.startsWith("+")) throw new ImapCommandError("NO", ready.trim());

    await this.#socket.writer.write(body);
    await this.#socket.writer.writeLine("");

    const result = await this.#readResponse(tag);
    if (result.status !== "OK") throw new ImapCommandError(result.status, result.text);
  }

  async command(line: string): Promise<ImapResponse> {
    const tag = this.#nextTag();
    await this.#socket.writer.writeLine(`${tag} ${line}`);
    const result = await this.#readResponse(tag);
    if (result.status !== "OK") {
      throw new ImapCommandError(result.status, result.text);
    }
    return result;
  }

  async #handshake(credentials: MailAuth): Promise<void> {
    const greeting = await this.#socket.reader.readLine(this.#timeoutMs);
    if (!greeting.startsWith("* ")) {
      throw new Error(`Unexpected IMAP greeting: ${greeting}`);
    }
    if (credentials.tls === "starttls") {
      await this.command("STARTTLS");
      this.#socket = this.#socket.startTls({ expectedServerHostname: credentials.hostname });
    }
    const user = imapQuote(credentials.username);
    const pass = imapQuote(
      credentials.mechanism === "xoauth2" ? "xoauth2" : credentials.password,
    );
    await this.command(`LOGIN ${user} ${pass}`);
  }

  #nextTag(): string {
    this.#tag += 1;
    return `m${String(this.#tag).padStart(3, "0")}`;
  }

  async #readResponse(tag: string): Promise<ImapResponse> {
    const untagged: string[] = [];
    const prefix = `${tag} `;
    for (;;) {
      const line = await this.#readLogicalLine();
      if (line.startsWith(prefix)) {
        const rest = line.slice(prefix.length);
        const space = rest.indexOf(" ");
        const word = space === -1 ? rest : rest.slice(0, space);
        const text = space === -1 ? "" : rest.slice(space + 1);
        if (word !== "OK" && word !== "NO" && word !== "BAD") {
          throw new Error(`Unexpected IMAP status: ${line}`);
        }
        return { untagged, status: word, text };
      }
      if (!line.startsWith("+ ")) untagged.push(line);
    }
  }

  async #readLogicalLine(): Promise<string> {
    let line = await this.#socket.reader.readLine(this.#timeoutMs);
    for (;;) {
      const literal = /\{(\d+)\}$/.exec(line);
      if (!literal?.[1]) return line;
      const bytes = await this.#socket.reader.readN(Number(literal[1]), this.#timeoutMs);
      const next = await this.#socket.reader.readLine(this.#timeoutMs);
      line = `${line}${decoder.decode(bytes)}${next}`;
    }
  }
}

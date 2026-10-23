import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Emptying the trash is driven against a scripted server, because the whole point of the
 * command sequence is that it addresses mail this app has never indexed: there are no
 * local UIDs to assert on, only the lines that go down the socket.
 */
const lines: string[] = [];
let script: string[] = [];

vi.mock("@/lib/transport/oauth-connect", () => ({
  connectImapSocket: async () => ({
    reader: {
      readLine: async () => script.shift() ?? "",
      readN: async () => new Uint8Array(),
      peek: async () => new Uint8Array(),
      cancel: async () => undefined,
    },
    writer: {
      write: async () => undefined,
      writeLine: async (line: string) => {
        lines.push(line);
      },
      close: async () => undefined,
    },
    closed: Promise.resolve(),
    close: async () => undefined,
    startTls: () => {
      throw new Error("not used");
    },
    [Symbol.asyncDispose]: async () => undefined,
  }),
}));

const { ImapMutator } = await import("@/lib/transport/imap-commands");

const credentials = {
  hostname: "imap.one.com",
  port: 993,
  tls: "implicit" as const,
  username: "support@mena-speakers.com",
  password: "secret",
  mechanism: "password" as const,
};

/** The command part of each tagged line, without the tag. */
const sent = () => lines.map((line) => line.replace(/^m\d+ /, ""));

/** One SELECT reply reporting a count, as a server sends it. */
const selectReply = (tag: number, exists: number) => [
  `* ${exists} EXISTS`,
  "* OK [UIDVALIDITY 1]",
  `m${String(tag).padStart(3, "0")} OK [READ-WRITE] SELECT done`,
];

const ok = (tag: number) => `m${String(tag).padStart(3, "0")} OK done`;

async function open() {
  lines.length = 0;
  script = ["* OK ready", "m001 OK LOGIN done"];
  return ImapMutator.open(credentials);
}

beforeEach(() => {
  lines.length = 0;
  script = [];
});

describe("purgeMailbox", () => {
  it("deletes every message in the mailbox, not the ones this app holds", async () => {
    /*
     * The folder behind this had 602 messages and 119 indexed rows. Emptying it by UID
     * cleared the 119, and the next sync pass pulled another batch of the remaining 483
     * straight back into the list that was supposed to be empty.
     */
    const session = await open();
    script.push(...selectReply(2, 602), ok(3), ok(4), ...selectReply(5, 0));

    expect(await session.purgeMailbox("INBOX.Trash")).toBe(602);
    expect(sent()).toEqual([
      'LOGIN "support@mena-speakers.com" "secret"',
      'SELECT "INBOX.Trash"',
      "STORE 1:602 +FLAGS.SILENT (\\Deleted)",
      "EXPUNGE",
      'SELECT "INBOX.Trash"',
    ]);
  });

  it("goes round again when the server only removed part of the folder", async () => {
    // Gmail caps what one EXPUNGE takes; the count coming back is what settles it.
    const session = await open();
    script.push(
      ...selectReply(2, 900),
      ok(3),
      ok(4),
      ...selectReply(5, 400),
      ok(6),
      ok(7),
      ...selectReply(8, 0),
    );

    expect(await session.purgeMailbox("[Gmail]/Bin")).toBe(900);
    expect(sent().filter((line) => line.startsWith("STORE"))).toEqual([
      "STORE 1:900 +FLAGS.SILENT (\\Deleted)",
      "STORE 1:400 +FLAGS.SILENT (\\Deleted)",
    ]);
  });

  it("stops instead of spinning when a round changes nothing", async () => {
    const session = await open();
    script.push(...selectReply(2, 50), ok(3), ok(4), ...selectReply(5, 50));

    expect(await session.purgeMailbox("INBOX.Trash")).toBe(0);
    expect(sent().filter((line) => line.startsWith("EXPUNGE"))).toHaveLength(1);
  });

  it("gives up after a bounded number of rounds", async () => {
    // A server that keeps handing back a smaller count must not hold the request open.
    const session = await open();
    let tag = 2;
    for (const left of [100, 80, 60, 40, 20]) {
      script.push(...selectReply(tag, left), ok(tag + 1), ok(tag + 2));
      tag += 3;
    }

    await session.purgeMailbox("INBOX.Trash");
    expect(sent().filter((line) => line.startsWith("EXPUNGE"))).toHaveLength(4);
  });

  it("does nothing to an empty mailbox", async () => {
    // `STORE 1:0` is not a sequence a server will accept, and there is nothing to delete.
    const session = await open();
    script.push(...selectReply(2, 0));

    expect(await session.purgeMailbox("INBOX.Trash")).toBe(0);
    expect(sent().some((line) => line.startsWith("STORE"))).toBe(false);
    expect(sent().some((line) => line.startsWith("EXPUNGE"))).toBe(false);
  });

  it("encodes a mailbox name the way the server named it", async () => {
    const session = await open();
    script.push(...selectReply(2, 0));
    await session.purgeMailbox("INBOX.Søppel");
    expect(sent()).toContain('SELECT "INBOX.S&APg-ppel"');
  });

  it("reports a refusal rather than claiming the trash was emptied", async () => {
    const session = await open();
    script.push(...selectReply(2, 10), "m003 NO permission denied");
    await expect(session.purgeMailbox("INBOX.Trash")).rejects.toThrow(/permission denied/);
  });
});

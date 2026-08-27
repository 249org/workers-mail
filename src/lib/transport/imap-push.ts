import type { Database } from "@/lib/db";
import { upsertRemoteFolder, type Folder, type Mailbox } from "@/lib/mail/mailboxes";
import { imapAuth, type MailAuth } from "./credentials";
import { folderCreateRejected } from "./imap-error";
import { ImapCommandError, ImapMutator } from "./imap-commands";
import type { ImapMessageRef } from "./imap-remote";
import { createMailboxCandidates, matchMailboxPath } from "./imap-uid-set";

export type { ImapMessageRef };

export type ImapPush =
  | { action: "flags"; seen?: boolean; flagged?: boolean }
  | { action: "move"; destination: Folder }
  | { action: "delete" };

/*
 * A folder only has a remote path once a LIST has matched it to something on the server.
 * Falling back to the display name addressed mailboxes that were never there — the seeded
 * Trash sent `UID MOVE ... Trash` at a Gmail whose trash is `[Gmail]/Bin` — so a delete
 * went nowhere while reporting success. Only INBOX is safe to name without having seen it.
 */
function remoteMailbox(folder: Folder): string {
  if (folder.remotePath) return folder.remotePath;
  if (folder.role === "inbox") return "INBOX";
  throw new UnmappedFolderError(folder.name);
}

export class UnmappedFolderError extends Error {
  constructor(readonly folderName: string) {
    super(`${folderName} does not exist on the mail server yet.`);
    this.name = "UnmappedFolderError";
  }
}

function groupedUids(refs: ImapMessageRef[]): Map<string, { ids: string[]; uids: number[] }> {
  const groups = new Map<string, { ids: string[]; uids: number[] }>();
  for (const ref of refs) {
    if (ref.remoteUid == null) continue;
    const group = groups.get(ref.folderId) ?? { ids: [], uids: [] };
    group.ids.push(ref.id);
    group.uids.push(ref.remoteUid);
    groups.set(ref.folderId, group);
  }
  return groups;
}

/**
 * Mirrors a local mutation onto the IMAP server so other clients see the same change.
 * Returns new destination UIDs keyed by message id after a move.
 */
export async function pushImapChanges(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  folders: Folder[],
  refs: ImapMessageRef[],
  change: ImapPush,
): Promise<Map<string, number | null>> {
  const nextUids = new Map<string, number | null>();
  if (mailbox.type !== "external_imap") return nextUids;

  const groups = groupedUids(refs);
  if (groups.size === 0) return nextUids;

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const credentials = await imapAuth(mailbox, env, db);

  /*
   * Each mutation dials its own connection, so deleting a run of messages from the
   * keyboard opens one per keystroke and hosts start refusing them. A refused
   * connection surfaced as a failed move, the row reappeared, and nothing said why.
   * One short retry rides out that throttling.
   */
  const session = await openWithRetry(credentials);
  try {
    for (const [folderId, group] of groups) {
      const source = folderById.get(folderId);
      if (!source) continue;
      await session.select(remoteMailbox(source));

      if (change.action === "flags") {
        if (change.seen !== undefined) {
          await session.storeFlags(group.uids, ["\\Seen"], change.seen);
        }
        if (change.flagged !== undefined) {
          await session.storeFlags(group.uids, ["\\Flagged"], change.flagged);
        }
        continue;
      }

      if (change.action === "delete") {
        await session.expungeUids(group.uids);
        continue;
      }

      const mapped = await session.move(group.uids, remoteMailbox(change.destination));
      for (let i = 0; i < group.ids.length; i += 1) {
        const id = group.ids[i];
        const uid = group.uids[i];
        if (!id || uid == null) continue;
        nextUids.set(id, mapped.get(uid) ?? null);
      }
    }
    return nextUids;
  } finally {
    await session.close();
  }
}

const RETRY_DELAY_MS = 700;

async function openWithRetry(credentials: MailAuth): Promise<ImapMutator> {
  try {
    return await ImapMutator.open(credentials);
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return ImapMutator.open(credentials);
  }
}

/** Throttling and dropped sockets are worth one more try; a bad password is not. */
export function isTransientConnectionError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  if (/login rejected|authenticationfailed|invalid credentials/i.test(text)) return false;
  return /too many|throttl|rate|timed out|timeout|connection|socket|closed|reset|unavailable|try again/i.test(
    text,
  );
}

/** CREATE on the IMAP server, then persist the folder with the LIST path. */
export async function createImapMailbox(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  name: string,
): Promise<Folder> {
  const credentials = await imapAuth(mailbox, env, db);
  const session = await ImapMutator.open(credentials);
  try {
    const listing = await session.listMailboxListing();
    const existing = matchMailboxPath(listing.paths, name);
    if (existing) {
      return await upsertRemoteFolder(db, mailbox.id, name, existing, "custom");
    }

    const namespace =
      (await session.personalNamespace()) ??
      (listing.delimiter ? { prefix: "", delimiter: listing.delimiter } : null);
    const candidates = createMailboxCandidates(name, namespace, listing.paths);
    let createdPath: string | null = null;
    let lastNo: string | undefined;
    for (const candidate of candidates) {
      try {
        await session.createMailbox(candidate);
        createdPath = candidate;
        break;
      } catch (error) {
        if (!(error instanceof ImapCommandError) || error.status !== "NO") throw error;
        lastNo = error.text;
        if (/already exist/i.test(error.text)) {
          createdPath = candidate;
          break;
        }
      }
    }

    const paths = createdPath ? (await session.listMailboxListing()).paths : listing.paths;
    const path = matchMailboxPath(paths, name) ?? createdPath;
    if (!path) {
      throw new Error(folderCreateRejected(lastNo));
    }
    return await upsertRemoteFolder(db, mailbox.id, name, path, "custom");
  } finally {
    await session.close();
  }
}

/** RENAME on the server, keeping the stored remote path in step. */
export async function renameImapMailbox(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  folder: Folder,
  name: string,
): Promise<string> {
  const from = remoteMailbox(folder);
  const delimiter = from.includes("/") ? "/" : from.includes(".") ? "." : null;
  const parent = delimiter ? from.slice(0, from.lastIndexOf(delimiter) + 1) : "";
  const to = `${parent}${name}`;
  if (to === from) return from;

  const credentials = await imapAuth(mailbox, env, db);
  const session = await ImapMutator.open(credentials);
  try {
    await session.renameMailbox(from, to);
    return to;
  } finally {
    await session.close();
  }
}

/** DELETE on the server so every other client drops the folder too. */
export async function deleteImapMailbox(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  folder: Folder,
): Promise<void> {
  const credentials = await imapAuth(mailbox, env, db);
  const session = await ImapMutator.open(credentials);
  try {
    await session.deleteMailbox(remoteMailbox(folder));
  } finally {
    await session.close();
  }
}

/**
 * Uploads a copy of an outgoing message to the server's Sent mailbox.
 *
 * SMTP only hands a message to the next hop — it never files it. Without this the
 * message exists only in this app's own index, which is why other clients on the same
 * account show an empty Sent folder.
 */
export async function appendToSentMailbox(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  sent: Folder,
  raw: Uint8Array,
): Promise<void> {
  const credentials = await imapAuth(mailbox, env, db);
  const session = await ImapMutator.open(credentials);
  try {
    await session.appendMessage(remoteMailbox(sent), raw, ["\\Seen"]);
  } finally {
    await session.close();
  }
}

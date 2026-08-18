import { type ImapSession } from "edgeport/imap";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { folders, mailboxes, messages } from "@/lib/db/schema";
import { parseMime } from "@/lib/mail/mime";
import { storeMessage } from "@/lib/mail/store";
import { upsertRemoteFolder, folderByRole, type Folder, type Mailbox } from "@/lib/mail/mailboxes";
import { imapAuth, type MailAuth } from "./credentials";
import { openImap } from "./oauth-connect";
import { imapUidSet } from "./imap-uid-set";

const INCREMENTAL_BATCH = 40;
const BACKFILL_BATCH = 12;
/** Leave the isolate before a hung IMAP fetch can kill the whole pass. */
const PASS_BUDGET_MS = 20_000;
const SPECIAL_FOLDERS: Array<{ match: RegExp; role: Folder["role"]; name: string }> = [
  { match: /^inbox$/i, role: "inbox", name: "Inbox" },
  { match: /sent/i, role: "sent", name: "Sent" },
  { match: /draft/i, role: "drafts", name: "Drafts" },
  { match: /(trash|deleted)/i, role: "trash", name: "Trash" },
  { match: /(archive|all mail)/i, role: "archive", name: "Archive" },
];

export type SyncDeps = {
  db: Database;
  bucket: R2Bucket;
  env: CloudflareEnv;
};

export type SyncSummary = {
  stored: number;
  scanned: number;
  folders: number;
  backfillComplete: boolean;
  errors: string[];
};

export type SyncOptions = {
  /** Walk older messages instead of only picking up new UIDs. */
  backfill?: boolean;
  /** Cap the number of folders touched in one pass so a run fits inside a DO alarm. */
  maxFolders?: number;
  /** Skip LIST and only check Inbox — used while a client is watching. */
  inboxOnly?: boolean;
};

export async function testImapConnection(
  credentials: MailAuth | Omit<MailAuth, "mechanism">,
): Promise<string[]> {
  const session = await openImap(
    "mechanism" in credentials ? credentials : { ...credentials, mechanism: "password" },
  );
  try {
    return await session.listMailboxes();
  } finally {
    await session.close();
  }
}

export async function syncMailbox(
  deps: SyncDeps,
  mailbox: Mailbox,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    stored: 0,
    scanned: 0,
    folders: 0,
    backfillComplete: mailbox.backfillComplete,
    errors: [],
  };

  const credentials = await imapAuth(mailbox, deps.env, deps.db);
  const session = await openImap(credentials);

  try {
    if (options.inboxOnly) {
      const inbox = await folderByRole(deps.db, mailbox.id, "inbox");
      if (!inbox) return summary;
      try {
        const result = await syncFolder(deps, session, mailbox, inbox, false);
        summary.stored = result.stored;
        summary.scanned = result.scanned;
        summary.folders = 1;
      } catch (error) {
        summary.errors.push(`Inbox: ${describe(error)}`);
      }
      return summary;
    }

    const remotePaths = await session.listMailboxes();
    const tracked = await trackFolders(deps.db, mailbox.id, remotePaths);
    const selected = tracked.slice(0, options.maxFolders ?? tracked.length);

    let allCaughtUp = true;
    const deadline = Date.now() + PASS_BUDGET_MS;
    for (const folder of selected) {
      if (Date.now() > deadline) {
        allCaughtUp = false;
        break;
      }
      try {
        const result = await syncFolder(deps, session, mailbox, folder, options.backfill ?? false);
        summary.stored += result.stored;
        summary.scanned += result.scanned;
        summary.folders += 1;
        if (!result.caughtUp) allCaughtUp = false;
      } catch (error) {
        summary.errors.push(`${folder.name}: ${describe(error)}`);
        allCaughtUp = false;
      }
    }

    summary.backfillComplete = allCaughtUp && selected.length === tracked.length;
    return summary;
  } finally {
    await session.close();
  }
}

async function syncFolder(
  deps: SyncDeps,
  session: ImapSession,
  mailbox: Mailbox,
  folder: Folder,
  backfill: boolean,
): Promise<{ stored: number; scanned: number; caughtUp: boolean }> {
  const path = folder.remotePath ?? (folder.role === "inbox" ? "INBOX" : folder.name);
  const status = await session.select(path);

  // A changed UIDVALIDITY invalidates every stored UID for the folder; restart both cursors.
  let lastUid = folder.lastUid ?? 0;
  let oldestUid = folder.oldestUid ?? 0;
  let uidValidityReset = false;
  if (folder.uidValidity !== null && folder.uidValidity !== status.uidValidity) {
    lastUid = 0;
    oldestUid = 0;
    uidValidityReset = true;
    await deps.db
      .update(folders)
      .set({ uidValidity: status.uidValidity, lastUid: null, oldestUid: null })
      .where(eq(folders.id, folder.id));
  } else if (folder.uidValidity === null) {
    await deps.db
      .update(folders)
      .set({ uidValidity: status.uidValidity })
      .where(eq(folders.id, folder.id));
  }

  if (status.exists === 0) return { stored: 0, scanned: 0, caughtUp: true };

  const preferRecent = !backfill || folder.role === "inbox";
  const uids = await discoverUids(session, { lastUid, preferRecent });
  const knownUids = uidValidityReset ? new Set<number>() : await remoteUidsFor(deps.db, folder.id);
  const missing = uids.filter((uid) => !knownUids.has(uid)).sort((a, b) => a - b);
  if (missing.length === 0) {
    const caughtUp = backfill || knownUids.size >= status.exists;
    return { stored: 0, scanned: 0, caughtUp };
  }

  // Newest missing first so the open inbox is current. Backfill walks the rest later.
  const batchSize = backfill ? BACKFILL_BATCH : INCREMENTAL_BATCH;
  const batch = backfill ? missing.slice(0, batchSize) : missing.slice(-batchSize);
  const fetched = await session.fetch(batch, { flags: true, body: true, size: true });

  let stored = 0;
  let highest = lastUid;
  let lowest = oldestUid;
  for (const message of fetched) {
    if (!message.body) continue;
    const parsed = await parseMime(message.body);
    const result = await storeMessage(deps.db, deps.bucket, parsed, {
      mailboxId: mailbox.id,
      folderId: folder.id,
      ownerId: mailbox.ownerId,
      raw: message.body,
      size: message.size ?? message.body.byteLength,
      seen: message.flags.includes("\\Seen"),
      remoteUid: message.uid,
    });
    if (result.created) stored += 1;
    if (message.uid > highest) highest = message.uid;
    if (lowest === 0 || message.uid < lowest) lowest = message.uid;
  }

  const cursor: Partial<Folder> = {};
  if (highest > lastUid) cursor.lastUid = highest;
  if (lowest !== oldestUid) cursor.oldestUid = lowest;
  if (Object.keys(cursor).length > 0) {
    await deps.db.update(folders).set(cursor).where(eq(folders.id, folder.id));
  }

  return {
    stored,
    scanned: fetched.length,
    caughtUp: batch.length === missing.length,
  };
}

async function newestUid(session: ImapSession): Promise<number> {
  const fetched = await session.fetch(imapUidSet("*"), { flags: true });
  const high = fetched.reduce((max, message) => (message.uid > max ? message.uid : max), 0);
  if (high === 0) throw new Error("IMAP FETCH * returned no UID");
  return high;
}

async function uidsAfter(session: ImapSession, lastUid: number): Promise<number[]> {
  const high = await newestUid(session);
  if (high <= lastUid) return [];

  // A huge FLAGS range is as bad as SEARCH ALL on a 7k-message inbox; use a short SINCE window.
  if (high - lastUid > 200) {
    const recent = await session.search({ since: new Date(Date.now() - 2 * 86_400_000) });
    const unseen = await session.search({ unseen: true });
    return [...new Set([...recent, ...unseen, high])].filter((uid) => uid > lastUid);
  }

  const range = await session.fetch(imapUidSet(`${lastUid + 1}:${high}`), { flags: true });
  const uids = range.map((message) => message.uid).filter((uid) => uid > lastUid);
  return uids.length > 0 ? uids : [high];
}

async function discoverUids(
  session: ImapSession,
  options: { lastUid: number; preferRecent: boolean },
): Promise<number[]> {
  const found = new Set<number>();

  function add(uids: number[]) {
    for (const uid of uids) found.add(uid);
  }

  // Incremental: never SEARCH ALL. one.com truncates that result oldest-first, so a mailbox
  // whose cursor is already at 9166 will never see 9167, and the full scan can hang the poll.
  if (options.preferRecent && options.lastUid > 0) {
    try {
      return await uidsAfter(session, options.lastUid);
    } catch {
      add(await session.search({ since: new Date(Date.now() - 2 * 86_400_000) }));
      add(await session.search({ unseen: true }));
      return [...found].filter((uid) => uid > options.lastUid);
    }
  }

  if (options.preferRecent) {
    for (const days of [2, 14, 90]) {
      add(await session.search({ since: new Date(Date.now() - days * 86_400_000) }));
      if (found.size > 0) break;
    }
    add(await session.search({ unseen: true }));
    if (found.size > 0) return [...found];
  }

  add(await session.search({ all: true }));
  return [...found];
}

async function trackFolders(
  db: Database,
  mailboxId: string,
  remotePaths: string[],
): Promise<Folder[]> {
  const tracked: Folder[] = [];
  for (const path of remotePaths) {
    const leaf = path.split(/[/.]/).pop() ?? path;
    const special = SPECIAL_FOLDERS.find(
      (entry) => entry.match.test(path) || entry.match.test(leaf),
    );
    const folder = await upsertRemoteFolder(
      db,
      mailboxId,
      special?.name ?? leaf,
      path,
      special?.role ?? "custom",
    );
    tracked.push(folder);
  }
  // Inbox first, then the rest, so a truncated pass still refreshes what users look at.
  return tracked.sort((a, b) => rank(a) - rank(b));
}

async function remoteUidsFor(db: Database, folderId: string): Promise<Set<number>> {
  const rows = await db
    .select({ uid: messages.remoteUid })
    .from(messages)
    .where(and(eq(messages.folderId, folderId), isNotNull(messages.remoteUid)));
  const uids = new Set<number>();
  for (const row of rows) {
    if (row.uid != null) uids.add(row.uid);
  }
  return uids;
}

function rank(folder: Folder): number {
  if (folder.role === "inbox") return 0;
  if (folder.role === "sent") return 1;
  if (folder.role === "archive") return 2;
  return 3;
}

export async function markSyncState(
  db: Database,
  mailboxId: string,
  state: "idle" | "syncing" | "error",
  detail?: string,
): Promise<void> {
  await db
    .update(mailboxes)
    .set({
      syncState: state,
      syncError: state === "error" ? (detail ?? "Sync failed") : null,
      ...(state === "idle" ? { lastSyncedAt: Math.floor(Date.now() / 1000) } : {}),
    })
    .where(eq(mailboxes.id, mailboxId));
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

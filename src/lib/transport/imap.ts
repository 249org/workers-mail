import type { ImapSession } from "edgeport/imap";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { folders, mailboxes, messages } from "@/lib/db/schema";
import { parseMime } from "@/lib/mail/mime";
import { storeMessage } from "@/lib/mail/store";
import { upsertRemoteFolder, folderByRole, listFolders, type Folder, type Mailbox } from "@/lib/mail/mailboxes";
import { imapAuth, type MailAuth } from "./credentials";
import { openImap } from "./oauth-connect";
import { imapUidSet } from "./imap-uid-set";
import { ImapMutator, type MailboxListing } from "./imap-commands";
import { mailboxLeaf, roleForMailbox } from "./imap-folder-roles";
import { describeImapError, isImapTimeout } from "./imap-error";

const INCREMENTAL_BATCH = 8;
const BACKFILL_BATCH = 24;
/** How far below the cursor one backfill pass looks for candidates. */
const BACKFILL_SPAN = 400;
/** Full RFC822 bodies in one UID FETCH; keep this small so a slow host cannot stall the poll. */
const BODY_CHUNK = 3;
/** Leave the isolate before a hung IMAP fetch can kill the whole pass. */
const PASS_BUDGET_MS = 20_000;
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
  /** Sync this folder only, including a backfill of its messages. */
  folderId?: string;
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

    if (options.folderId) {
      const folder = (await listFolders(deps.db, mailbox.id)).find(
        (entry) => entry.id === options.folderId,
      );
      if (!folder) return summary;
      try {
        const result = await syncFolder(deps, session, mailbox, folder, options.backfill ?? true);
        summary.stored = result.stored;
        summary.scanned = result.scanned;
        summary.folders = 1;
      } catch (error) {
        if (!isMissingMailbox(error)) {
          summary.errors.push(`${folder.name}: ${describe(error)}`);
        }
      }
      return summary;
    }

    const tracked = await trackFolders(
      deps.db,
      mailbox.id,
      await listRemoteMailboxes(session, mailbox, deps.env, deps.db),
    );
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
        if (isMissingMailbox(error)) {
          // Deleted or renamed on the server; the next LIST decides its fate.
          continue;
        }
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

  const uids = await discoverUids(session, {
    lastUid,
    oldestUid,
    backfill,
    // Only a first pass, with no cursor yet, needs the recent-mail shortcut.
    preferRecent: !backfill,
  });
  const knownUids = uidValidityReset ? new Set<number>() : await remoteUidsFor(deps.db, folder.id);
  const missing = uids.filter((uid) => !knownUids.has(uid)).sort((a, b) => a - b);
  if (missing.length === 0) {
    const caughtUp = backfill || knownUids.size >= status.exists;
    return { stored: 0, scanned: 0, caughtUp };
  }

  // Newest missing first so the open inbox is current. Backfill walks the rest later.
  const batchSize = backfill ? BACKFILL_BATCH : INCREMENTAL_BATCH;
  const selected = backfill ? missing.slice(0, batchSize) : missing.slice(-batchSize);
  const chunks = bodyChunks(selected, BODY_CHUNK, !backfill);
  const deadline = Date.now() + PASS_BUDGET_MS;

  let stored = 0;
  let scanned = 0;
  let highest = lastUid;
  let lowest = oldestUid;

  for (const chunk of chunks) {
    if (Date.now() > deadline) break;
    let fetched: Awaited<ReturnType<ImapSession["fetch"]>>;
    try {
      fetched = await session.fetch(chunk, { flags: true, body: true, size: true });
    } catch (error) {
      if (stored > 0 && isImapTimeout(error)) break;
      throw error;
    }
    scanned += fetched.length;
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
      lastUid = highest;
      oldestUid = lowest;
    }
  }

  return {
    stored,
    scanned,
    caughtUp: scanned === missing.length || (selected.length === missing.length && scanned === selected.length),
  };
}

async function newestUid(session: ImapSession): Promise<number> {
  const fetched = await session.fetch(imapUidSet("*"), { flags: true });
  const high = fetched.reduce((max, message) => (message.uid > max ? message.uid : max), 0);
  if (high === 0) throw new Error("IMAP FETCH * returned no UID");
  return high;
}

/** UIDs immediately below a cursor, as a bounded range rather than a SEARCH ALL. */
async function uidsBefore(
  session: ImapSession,
  oldestUid: number,
  span: number,
): Promise<number[]> {
  const low = Math.max(1, oldestUid - span);
  if (low >= oldestUid) return [];
  const range = await session.fetch(imapUidSet(`${low}:${oldestUid - 1}`), { flags: true });
  return range.map((message) => message.uid).filter((uid) => uid < oldestUid);
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

export async function discoverUids(
  session: ImapSession,
  options: { lastUid: number; oldestUid: number; backfill: boolean; preferRecent: boolean },
): Promise<number[]> {
  const found = new Set<number>();

  function add(uids: number[]) {
    for (const uid of uids) found.add(uid);
  }

  /*
   * Backfill walks down from the oldest message already held. Sharing the incremental
   * path here is what pinned the inbox to its first batch: that path asks only for
   * UIDs above the cursor, and the cursor sits at the newest message from the very
   * first pass, so no older mail was ever reachable.
   */
  if (options.backfill && options.oldestUid > 0) {
    // A cursor of 1 means the first message in the mailbox is already held.
    if (options.oldestUid <= 1) return [];
    return uidsBefore(session, options.oldestUid, BACKFILL_SPAN);
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

/** A SELECT the server refuses because the mailbox is gone. */
export function isMissingMailbox(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /nonexistent|unknown mailbox|no such mailbox/i.test(text);
}

async function trackFolders(
  db: Database,
  mailboxId: string,
  listing: MailboxListing,
): Promise<Folder[]> {
  const tracked: Folder[] = [];
  for (const entry of listing.entries) {
    // `\Noselect` marks a container the server refuses to open — Gmail's bare `[Gmail]`
    // is one. Tracking it added a folder to the rail that could only ever fail to load.
    if (entry.attributes.includes("noselect") || entry.attributes.includes("nonexistent")) {
      continue;
    }
    const special = roleForMailbox(entry, listing.delimiter);
    const folder = await upsertRemoteFolder(
      db,
      mailboxId,
      special?.name ?? mailboxLeaf(entry.path, listing.delimiter),
      entry.path,
      special?.role ?? "custom",
    );
    tracked.push(folder);
  }
  // Inbox first, then the rest, so a truncated pass still refreshes what users look at.
  return tracked.sort((a, b) => rank(a) - rank(b));
}

/*
 * edgeport's LIST returns names only, and the SPECIAL-USE attributes are the whole point
 * of the lookup, so it goes over a raw connection. This runs once per full pass — not per
 * folder — and closes immediately, which is a far cry from the per-mutation dialling that
 * gets a busy host to start refusing connections.
 */
async function listRemoteMailboxes(
  session: ImapSession,
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
): Promise<MailboxListing> {
  let mutator: ImapMutator | null = null;
  try {
    mutator = await ImapMutator.open(await imapAuth(mailbox, env, db));
    return await mutator.listMailboxListing();
  } catch (error) {
    // Losing the attributes costs accuracy on localised folder names, not the sync.
    console.warn("special-use LIST failed", { mailboxId: mailbox.id, error: describe(error) });
    const paths = await session.listMailboxes();
    return {
      entries: paths.map((path) => ({ path, attributes: [] })),
      paths,
      delimiter: null,
    };
  } finally {
    await mutator?.close();
  }
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
  if (folder.lastUid == null) return 3;
  return 4;
}

/** Newest-first for live mail; oldest-first when backfilling. */
function bodyChunks(uids: number[], size: number, newestFirst: boolean): number[][] {
  const chunks: number[][] = [];
  if (newestFirst) {
    for (let end = uids.length; end > 0; end -= size) {
      chunks.push(uids.slice(Math.max(0, end - size), end));
    }
  } else {
    for (let start = 0; start < uids.length; start += size) {
      chunks.push(uids.slice(start, start + size));
    }
  }
  return chunks;
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

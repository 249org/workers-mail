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
        const result = await syncFolder(deps, session, mailbox, inbox, false, { repairs: 1 });
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
        const result = await syncFolder(deps, session, mailbox, folder, options.backfill ?? true, {
          repairs: 1,
        });
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
    const budget: PassBudget = { repairs: 1 };
    const deadline = Date.now() + PASS_BUDGET_MS;
    for (const folder of selected) {
      if (Date.now() > deadline) {
        allCaughtUp = false;
        break;
      }
      try {
        const result = await syncFolder(
          deps,
          session,
          mailbox,
          folder,
          options.backfill ?? false,
          budget,
        );
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
  budget: PassBudget,
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

  const knownUids = uidValidityReset ? new Set<number>() : await remoteUidsFor(deps.db, folder.id);

  /*
   * Three jobs in priority order, one of them per pass.
   *
   * New mail first, whatever kind of pass this is — it must never wait behind older
   * work. Then the holes an earlier pass skipped, because finishing what is already in
   * range beats reaching further back. Reaching further back comes last.
   *
   * The order matters more than it looks: with nobody watching, every scheduled pass is
   * a backfill turn, so anything reachable only on the other kind of turn would simply
   * never run.
   */
  const forward = await discoverUids(session, {
    lastUid,
    oldestUid,
    backfill: false,
    preferRecent: true,
  });
  let scannedTo = forward.scannedTo;
  let missing = forward.uids.filter((uid) => !knownUids.has(uid)).sort((a, b) => a - b);
  let mode: "forward" | "repair" | "backfill" = "forward";

  if (missing.length === 0) {
    if (scannedTo > lastUid) {
      await deps.db.update(folders).set({ lastUid: scannedTo }).where(eq(folders.id, folder.id));
      lastUid = scannedTo;
    }

    const repaired = await repairWindow(
      deps,
      session,
      folder,
      lastUid,
      oldestUid,
      knownUids,
      budget,
    );
    if (repaired.length > 0) {
      missing = repaired;
      mode = "repair";
    } else if (backfill) {
      const older = await discoverUids(session, {
        lastUid,
        oldestUid,
        backfill: true,
        preferRecent: false,
      });
      missing = older.uids.filter((uid) => !knownUids.has(uid)).sort((a, b) => a - b);
      scannedTo = lastUid;
      mode = "backfill";
    }
  }

  if (missing.length === 0) {
    const caughtUp = backfill || knownUids.size >= status.exists;
    return { stored: 0, scanned: 0, caughtUp };
  }

  // Newest missing first so the open inbox is current. Backfill walks the rest later.
  const olderFirst = mode === "backfill";
  const batchSize = olderFirst ? BACKFILL_BATCH : INCREMENTAL_BATCH;
  const selected = olderFirst ? missing.slice(0, batchSize) : missing.slice(-batchSize);
  const chunks = bodyChunks(selected, BODY_CHUNK, !olderFirst);
  const deadline = Date.now() + PASS_BUDGET_MS;

  let stored = 0;
  let scanned = 0;
  let lowest = oldestUid;
  /*
   * The cursor is a watermark, not a high score. It used to be the newest UID this pass
   * happened to store, which stepped straight over everything the batch had left for
   * later — and discovery never looks below the cursor, so those were gone for good.
   * Only UIDs the server was actually asked about may be crossed.
   */
  const fetchedUids = new Set<number>();

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
    for (const uid of chunk) fetchedUids.add(uid);
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
      if (lowest === 0 || message.uid < lowest) lowest = message.uid;
    }

    const cursor: Partial<Folder> = {};
    // Only the forward pass owns the cursor; the other two work below it.
    const watermark =
      mode === "forward" ? contiguousWatermark(lastUid, scannedTo, missing, fetchedUids) : lastUid;
    if (watermark > lastUid) cursor.lastUid = watermark;
    if (lowest !== oldestUid) cursor.oldestUid = lowest;
    if (Object.keys(cursor).length > 0) {
      await deps.db.update(folders).set(cursor).where(eq(folders.id, folder.id));
      if (cursor.lastUid != null) lastUid = cursor.lastUid;
      oldestUid = lowest;
    }
  }

  return {
    stored,
    scanned,
    caughtUp: scanned === missing.length || (selected.length === missing.length && scanned === selected.length),
  };
}

/*
 * Deliberately small, and one folder gets it per pass. Listing flags is cheap per UID
 * and not free: sweeping every folder on every pass, on top of looking forward and then
 * backward, spent more CPU than a Durable Object is given and got the whole sync killed
 * and restarted instead of moving it along.
 */
const REPAIR_WINDOW = 150;

/** One sweep per pass, handed to whichever folder asks first. */
type PassBudget = { repairs: number };

/**
 * One downward pass over a window below the cursor, returning the UIDs the server still
 * holds that this folder does not. Cheap because it asks for flags, not bodies.
 *
 * Needed because a cursor that has already jumped a gap cannot discover what it skipped:
 * everything it looks at is above itself. The sweep is the only way back to those.
 */
async function repairWindow(
  deps: SyncDeps,
  session: ImapSession,
  folder: Folder,
  lastUid: number,
  oldestUid: number,
  knownUids: Set<number>,
  budget: PassBudget,
): Promise<number[]> {
  if (budget.repairs <= 0) return [];
  const floor = Math.max(oldestUid, 1);
  const from = folder.repairUid ?? lastUid;
  if (from <= floor) return [];

  budget.repairs -= 1;
  const low = Math.max(floor, from - REPAIR_WINDOW);
  const present = await session.fetch(imapUidSet(`${low}:${from}`), { flags: true });
  const gaps = present
    .map((message) => message.uid)
    .filter((uid) => uid >= low && uid <= from && !knownUids.has(uid));

  /*
   * The window is only left behind once it is empty. A pass fetches a handful at a time,
   * so moving on while gaps remained would strand them exactly the way the forward cursor
   * used to — the bug this sweep exists to undo.
   */
  if (gaps.length === 0) {
    await deps.db
      .update(folders)
      .set({ repairUid: low <= floor ? floor : low })
      .where(eq(folders.id, folder.id));
  }

  return gaps.sort((a, b) => a - b);
}

/**
 * How far the cursor may move: up to the window that was scanned, but never past a UID
 * this pass decided not to ask about. Anything left behind stays above the cursor and is
 * picked up by the next pass.
 */
export function contiguousWatermark(
  lastUid: number,
  scannedTo: number,
  missing: number[],
  fetched: Set<number>,
): number {
  const skipped = missing.filter((uid) => !fetched.has(uid));
  const ceiling = Math.max(lastUid, scannedTo);
  if (skipped.length === 0) return ceiling;
  // Never below where it already was: a hole under the cursor belongs to the repair
  // sweep, and dragging the cursor back would refetch the whole mailbox instead.
  return Math.max(lastUid, Math.min(ceiling, Math.min(...skipped) - 1));
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

/*
 * A window immediately above the cursor, never the whole gap: a FLAGS range across a
 * seven-thousand-message inbox is as punishing as SEARCH ALL.
 *
 * It walks the gap instead of jumping it. The previous answer to a wide gap was "recent
 * mail, unread mail, and the newest UID", which moved the cursor to the newest and left
 * everything it had not asked for stranded below — unreachable, because discovery only
 * ever looks upward. That is how five hundred messages went missing from one inbox.
 */
const FORWARD_WINDOW = 150;

async function uidsAfter(
  session: ImapSession,
  lastUid: number,
): Promise<{ uids: number[]; scannedTo: number }> {
  const high = await newestUid(session);
  if (high <= lastUid) return { uids: [], scannedTo: lastUid };

  const ceiling = Math.min(high, lastUid + FORWARD_WINDOW);
  const range = await session.fetch(imapUidSet(`${lastUid + 1}:${ceiling}`), { flags: true });
  const uids = range
    .map((message) => message.uid)
    .filter((uid) => uid > lastUid && uid <= ceiling);
  // `scannedTo` is what lets the cursor cross a window the server answered as empty,
  // which is what every UID in it having been expunged looks like.
  return { uids, scannedTo: ceiling };
}

export type UidPlan = {
  uids: number[];
  /** The highest UID this pass actually looked at, examined or not. */
  scannedTo: number;
};

export async function discoverUids(
  session: ImapSession,
  options: { lastUid: number; oldestUid: number; backfill: boolean; preferRecent: boolean },
): Promise<UidPlan> {
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
    if (options.oldestUid <= 1) return { uids: [], scannedTo: options.lastUid };
    return {
      uids: await uidsBefore(session, options.oldestUid, BACKFILL_SPAN),
      scannedTo: options.lastUid,
    };
  }

  // Incremental: never SEARCH ALL. one.com truncates that result oldest-first, so a mailbox
  // whose cursor is already at 9166 will never see 9167, and the full scan can hang the poll.
  if (options.preferRecent && options.lastUid > 0) {
    try {
      return await uidsAfter(session, options.lastUid);
    } catch {
      add(await session.search({ since: new Date(Date.now() - 2 * 86_400_000) }));
      add(await session.search({ unseen: true }));
      // A fallback cannot claim to have scanned anything, or the cursor would step over
      // whatever the failed window held.
      return {
        uids: [...found].filter((uid) => uid > options.lastUid),
        scannedTo: options.lastUid,
      };
    }
  }

  if (options.preferRecent) {
    for (const days of [2, 14, 90]) {
      add(await session.search({ since: new Date(Date.now() - days * 86_400_000) }));
      if (found.size > 0) break;
    }
    add(await session.search({ unseen: true }));
    if (found.size > 0) return { uids: [...found], scannedTo: options.lastUid };
  }

  add(await session.search({ all: true }));
  return { uids: [...found], scannedTo: options.lastUid };
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

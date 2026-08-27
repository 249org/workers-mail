import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { folders, mailboxes, messages, type DnsRecord } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { bimiRecordName, bimiRecordValue, type BimiConfig } from "./bimi";
import { normalizeAddress } from "./address";

export type Mailbox = typeof mailboxes.$inferSelect;
export type Folder = typeof folders.$inferSelect;

export const DEFAULT_FOLDERS: Array<{ name: string; role: Folder["role"]; position: number }> = [
  { name: "Inbox", role: "inbox", position: 0 },
  { name: "Sent", role: "sent", position: 1 },
  { name: "Drafts", role: "drafts", position: 2 },
  { name: "Archive", role: "archive", position: 3 },
  { name: "Trash", role: "trash", position: 4 },
];

export async function listMailboxes(db: Database, ownerId: string): Promise<Mailbox[]> {
  return db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.ownerId, ownerId))
    .orderBy(asc(mailboxes.createdAt));
}

/** Loads a mailbox, enforcing that the caller owns it. */
export async function getOwnedMailbox(
  db: Database,
  ownerId: string,
  mailboxId: string,
): Promise<Mailbox | null> {
  const rows = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFolders(db: Database, mailboxId: string): Promise<Folder[]> {
  return db
    .select()
    .from(folders)
    .where(eq(folders.mailboxId, mailboxId))
    .orderBy(asc(folders.position), asc(folders.name));
}

export async function ensureDefaultFolders(db: Database, mailboxId: string): Promise<Folder[]> {
  const existing = await listFolders(db, mailboxId);
  const missing = DEFAULT_FOLDERS.filter(
    (candidate) => !existing.some((folder) => folder.role === candidate.role),
  );

  if (missing.length > 0) {
    await db.insert(folders).values(
      missing.map((folder) => ({
        id: newId("fld"),
        mailboxId,
        name: folder.name,
        role: folder.role,
        position: folder.position,
      })),
    );
    return listFolders(db, mailboxId);
  }

  return existing;
}

export async function mailboxByAddress(db: Database, address: string): Promise<Mailbox | null> {
  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.address, normalizeAddress(address)))
    .limit(1);
  return rows[0] ?? null;
}

export async function folderByRole(
  db: Database,
  mailboxId: string,
  role: Folder["role"],
): Promise<Folder | null> {
  const rows = await db
    .select()
    .from(folders)
    .where(and(eq(folders.mailboxId, mailboxId), eq(folders.role, role)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertRemoteFolder(
  db: Database,
  mailboxId: string,
  name: string,
  remotePath: string,
  role: Folder["role"] = "custom",
): Promise<Folder> {
  const all = await listFolders(db, mailboxId);

  /*
   * The remote path is the folder's identity on the server; the display name is only
   * derived from it. Matching on the name instead let two paths that share a leaf —
   * `Work/Reports` and `Personal/Reports` — collide on one row and overwrite each
   * other's path, and made a rename look like a brand new folder.
   */
  const found =
    all.find((folder) => folder.remotePath === remotePath) ??
    all.find((folder) => folder.remotePath === null && folder.name === name);

  if (found) {
    /*
     * A mailbox is seeded with the five system folders before anything is known about the
     * server, so a role can already be held by a placeholder that points nowhere. Once the
     * real one is identified it has to take the role over — otherwise a UK Gmail keeps an
     * empty Trash beside a `Bin` filed as an ordinary folder, and deleting for good, which
     * only offers itself inside the trash, can never be reached.
     */
    if (role !== "custom" && found.role !== role) {
      await absorbPlaceholderFolder(db, mailboxId, role, found.id);
    }

    const patch: Partial<Folder> = {};
    if (found.remotePath !== remotePath) patch.remotePath = remotePath;
    if (role !== "custom" && found.role !== role) patch.role = role;
    const others = await listFolders(db, mailboxId);
    if (found.name !== name && !others.some((f) => f.id !== found.id && f.name === name)) {
      patch.name = name;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(folders).set(patch).where(eq(folders.id, found.id));
    }
    return { ...found, ...patch };
  }

  // Names are unique per mailbox, so a leaf already in use falls back to the full path.
  if (all.some((folder) => folder.name === name)) name = remotePath;

  const folder: Folder = {
    id: newId("fld"),
    mailboxId,
    name,
    role,
    remotePath,
    icon: null,
    color: null,
    uidValidity: null,
    lastUid: null,
    oldestUid: null,
    position: role === "custom" ? await nextCustomPosition(db, mailboxId) : 0,
  };
  await db.insert(folders).values(folder);
  return folder;
}

/**
 * Hands `role` to `keepId`, moving anything filed under the placeholder that held it and
 * then dropping it. Only a folder with no remote path is treated as a placeholder — two
 * real server folders claiming one role is not something to resolve by deleting either.
 */
async function absorbPlaceholderFolder(
  db: Database,
  mailboxId: string,
  role: Folder["role"],
  keepId: string,
): Promise<void> {
  const stale = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.mailboxId, mailboxId), eq(folders.role, role), isNull(folders.remotePath)));

  for (const row of stale) {
    if (row.id === keepId) continue;
    await db.update(messages).set({ folderId: keepId }).where(eq(messages.folderId, row.id));
    await db.delete(folders).where(eq(folders.id, row.id));
  }
}

export async function insertCustomFolder(
  db: Database,
  mailboxId: string,
  name: string,
  remotePath: string | null = null,
): Promise<Folder> {
  const existing = await listFolders(db, mailboxId);
  if (existing.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
    throw new FolderExistsError(name);
  }

  const folder: Folder = {
    id: newId("fld"),
    mailboxId,
    name,
    role: "custom",
    remotePath,
    icon: null,
    color: null,
    uidValidity: null,
    lastUid: null,
    oldestUid: null,
    position: await nextCustomPosition(db, mailboxId),
  };
  await db.insert(folders).values(folder);
  return folder;
}

export class FolderExistsError extends Error {
  constructor(readonly folderName: string) {
    super(`A folder named ${folderName} already exists.`);
    this.name = "FolderExistsError";
  }
}

async function nextCustomPosition(db: Database, mailboxId: string): Promise<number> {
  const existing = await listFolders(db, mailboxId);
  const highest = existing.reduce((max, folder) => Math.max(max, folder.position), 99);
  return Math.max(100, highest + 1);
}

/** Strips credentials before a mailbox row crosses into the client bundle. */
export function publicMailbox(mailbox: Mailbox) {
  return {
    id: mailbox.id,
    type: mailbox.type,
    address: mailbox.address,
    displayName: mailbox.displayName,
    domainId: mailbox.domainId,
    syncState: mailbox.syncState,
    syncError: mailbox.syncError,
    lastSyncedAt: mailbox.lastSyncedAt,
    backfillComplete: mailbox.backfillComplete,
    imapHost: mailbox.imapHost,
    smtpHost: mailbox.smtpHost,
  };
}

export type PublicMailbox = ReturnType<typeof publicMailbox>;

export function dnsRecordsFor(domain: string, bimi?: BimiConfig): DnsRecord[] {
  const records: DnsRecord[] = [
    {
      type: "MX",
      name: domain,
      content: "route1.mx.cloudflare.net",
      priority: 12,
      purpose: "Deliver inbound mail to Cloudflare Email Routing",
      present: false,
    },
    {
      type: "MX",
      name: domain,
      content: "route2.mx.cloudflare.net",
      priority: 51,
      purpose: "Deliver inbound mail to Cloudflare Email Routing",
      present: false,
    },
    {
      type: "MX",
      name: domain,
      content: "route3.mx.cloudflare.net",
      priority: 93,
      purpose: "Deliver inbound mail to Cloudflare Email Routing",
      present: false,
    },
    {
      type: "TXT",
      name: domain,
      content: "v=spf1 include:_spf.mx.cloudflare.net ~all",
      purpose: "Authorise Cloudflare to send on behalf of this domain",
      present: false,
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      content: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      purpose: "Receive DMARC aggregate reports",
      present: false,
    },
  ];

  // Only advertised once a logo is configured; an empty BIMI record is worse than none.
  const bimiValue = bimi ? bimiRecordValue(bimi) : null;
  if (bimiValue) {
    records.push({
      type: "TXT",
      name: bimiRecordName(domain),
      content: bimiValue,
      purpose: "Show your logo beside your name in Gmail and Apple Mail",
      present: false,
    });
  }

  return records;
}

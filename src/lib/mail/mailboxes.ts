import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { folders, mailboxes, type DnsRecord } from "@/lib/db/schema";
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
  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.mailboxId, mailboxId), eq(folders.name, name)))
    .limit(1);

  const found = existing[0];
  if (found) {
    if (found.remotePath !== remotePath) {
      await db.update(folders).set({ remotePath }).where(eq(folders.id, found.id));
    }
    return { ...found, remotePath };
  }

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

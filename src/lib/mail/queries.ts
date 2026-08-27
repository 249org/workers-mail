import { and, desc, eq, gte, inArray, lt, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { attachments, folders, messages, type Addr } from "@/lib/db/schema";
import { parseSearch } from "./search";
import { repairOrphanedEncoding } from "./repair-encoding";
import { decodeEntities } from "./text";

export type MessageSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: Addr;
  to: Addr[];
  snippet: string;
  sentAt: number;
  seen: boolean;
  flagged: boolean;
  draft: boolean;
  hasAttachments: boolean;
  folderId: string;
  threadCount: number;
};

export type MessageDetail = MessageSummary & {
  cc: Addr[];
  messageId: string | null;
  inReplyTo: string | null;
  size: number;
  rawKey: string | null;
  mailboxId: string;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    inline: boolean;
    contentId: string | null;
  }>;
};

export type ListOptions = {
  folderId?: string;
  search?: string;
  unreadOnly?: boolean;
  flaggedOnly?: boolean;
  limit?: number;
  /** `sentAt` of the last row from the previous page. */
  before?: number;
};

const DEFAULT_LIMIT = 50;

export async function listMessages(
  db: Database,
  mailboxId: string,
  options: ListOptions = {},
): Promise<{ items: MessageSummary[]; nextCursor: number | null }> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, 200);
  const filters: SQL[] = [eq(messages.mailboxId, mailboxId)];

  if (options.folderId) filters.push(eq(messages.folderId, options.folderId));
  if (options.unreadOnly) filters.push(eq(messages.seen, false));
  if (options.flaggedOnly) filters.push(eq(messages.flagged, true));
  if (options.before) filters.push(lt(messages.sentAt, options.before));
  if (options.search) filters.push(...searchFilters(options.search));

  const rows = await db
    .select()
    .from(messages)
    .where(and(...filters))
    .orderBy(desc(messages.sentAt))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const counts = await threadCounts(db, mailboxId, page.map((row) => row.threadId));

  return {
    items: page.map((row) => toSummary(row, counts.get(row.threadId) ?? 1)),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.sentAt ?? null) : null,
  };
}

export async function getMessage(
  db: Database,
  mailboxId: string,
  messageId: string,
): Promise<MessageDetail | null> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.mailboxId, mailboxId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const files = await db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, row.id));

  return {
    ...toSummary(row, 1),
    cc: row.ccAddresses ?? [],
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    size: row.size,
    rawKey: row.rawKey,
    mailboxId: row.mailboxId,
    attachments: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      inline: file.inline,
      contentId: file.contentId,
    })),
  };
}

export async function listThread(
  db: Database,
  mailboxId: string,
  threadId: string,
): Promise<MessageSummary[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.mailboxId, mailboxId), eq(messages.threadId, threadId)))
    .orderBy(messages.sentAt);
  return rows.map((row) => toSummary(row, rows.length));
}

export type FolderCount = { unread: number; total: number };

export async function folderCounts(
  db: Database,
  mailboxId: string,
): Promise<Map<string, FolderCount>> {
  const rows = await db
    .select({
      folderId: messages.folderId,
      total: sql<number>`count(*)`,
      unread: sql<number>`sum(case when ${messages.seen} then 0 else 1 end)`,
    })
    .from(messages)
    .where(eq(messages.mailboxId, mailboxId))
    .groupBy(messages.folderId);
  return new Map(
    rows.map((row) => [row.folderId, { unread: Number(row.unread), total: Number(row.total) }]),
  );
}

/*
 * Unread is the wrong number for a folder nothing arrives in. Trash held fourteen
 * messages and showed 2, because two of them happened to be unread — what anyone wants
 * to know there is how much is in it. Drafts is the same.
 */
const COUNT_BY_TOTAL = new Set(["trash", "drafts"]);

export function folderBadge(role: string, count: FolderCount | undefined): number {
  if (!count) return 0;
  return COUNT_BY_TOTAL.has(role) ? count.total : count.unread;
}

export async function mailboxUsage(
  db: Database,
  mailboxId: string,
): Promise<{ messages: number; bytes: number; attachments: number }> {
  const totals = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${messages.size}), 0)`,
    })
    .from(messages)
    .where(eq(messages.mailboxId, mailboxId));

  const files = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${attachments.size}), 0)`,
    })
    .from(attachments)
    .innerJoin(messages, eq(attachments.messageId, messages.id))
    .where(eq(messages.mailboxId, mailboxId));

  return {
    messages: Number(totals[0]?.count ?? 0),
    bytes: Number(totals[0]?.bytes ?? 0) + Number(files[0]?.bytes ?? 0),
    attachments: Number(files[0]?.count ?? 0),
  };
}

/** Confirms every id belongs to the mailbox before a bulk mutation touches them. */
export async function ownedMessageIds(
  db: Database,
  mailboxId: string,
  ids: string[],
): Promise<string[]> {
  return (await ownedMessageRefs(db, mailboxId, ids)).map((row) => row.id);
}

export type MessageImapRef = {
  id: string;
  folderId: string;
  remoteUid: number | null;
};

export async function ownedMessageRefs(
  db: Database,
  mailboxId: string,
  ids: string[],
): Promise<MessageImapRef[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: messages.id, folderId: messages.folderId, remoteUid: messages.remoteUid })
    .from(messages)
    .where(and(eq(messages.mailboxId, mailboxId), inArray(messages.id, ids)));
}

export async function folderInMailbox(
  db: Database,
  mailboxId: string,
  folderId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.mailboxId, mailboxId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Turns a search string into filters. Operators narrow on their own column; bare
 * terms keep the original broad match across subject, sender and snippet.
 */
function searchFilters(input: string): SQL[] {
  const query = parseSearch(input);
  const filters: SQL[] = [];

  if (query.from) {
    const match = or(
      contains(messages.fromAddress, query.from),
      contains(messages.fromName, query.from),
    );
    if (match) filters.push(match);
  }

  if (query.to) filters.push(contains(messages.toAddresses, query.to));
  if (query.subject) filters.push(contains(messages.subject, query.subject));
  if (query.hasAttachment !== undefined) {
    filters.push(eq(messages.hasAttachments, query.hasAttachment));
  }
  if (query.seen !== undefined) filters.push(eq(messages.seen, query.seen));
  if (query.flagged !== undefined) filters.push(eq(messages.flagged, query.flagged));
  if (query.after !== undefined) filters.push(gte(messages.sentAt, query.after));
  if (query.before !== undefined) filters.push(lte(messages.sentAt, query.before));

  for (const term of query.terms) {
    const match = or(
      contains(messages.subject, term),
      contains(messages.fromAddress, term),
      contains(messages.fromName, term),
      contains(messages.snippet, term),
    );
    if (match) filters.push(match);
  }

  return filters;
}

/**
 * Case-insensitive substring match. LIKE wildcards in the needle are escaped and
 * declared with ESCAPE, so a literal % or _ typed into search stays literal.
 */
function contains(column: AnyColumn, value: string): SQL {
  const needle = `%${value.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  return sql`lower(${column}) LIKE ${needle} ESCAPE '\\'`;
}

async function threadCounts(
  db: Database,
  mailboxId: string,
  threadIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(threadIds)];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({ threadId: messages.threadId, count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.mailboxId, mailboxId), inArray(messages.threadId, unique)))
    .groupBy(messages.threadId);

  return new Map(rows.map((row) => [row.threadId, Number(row.count)]));
}

function toSummary(row: typeof messages.$inferSelect, threadCount: number): MessageSummary {
  return {
    id: row.id,
    threadId: row.threadId,
    subject: decodeEntities(row.subject),
    from: row.fromName ? { name: row.fromName, address: row.fromAddress } : { address: row.fromAddress },
    to: row.toAddresses ?? [],
    snippet: decodeEntities(repairOrphanedEncoding(row.snippet)),
    sentAt: row.sentAt,
    seen: row.seen,
    flagged: row.flagged,
    draft: row.draft,
    hasAttachments: row.hasAttachments,
    folderId: row.folderId,
    threadCount,
  };
}

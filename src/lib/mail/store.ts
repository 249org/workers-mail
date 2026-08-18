import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { attachments, contacts, messages } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { ParsedMessage } from "./mime";
import { resolveThreadId } from "./thread";

export type StoreOptions = {
  mailboxId: string;
  folderId: string;
  ownerId: string;
  raw?: Uint8Array;
  rawKey?: string;
  size: number;
  seen?: boolean;
  draft?: boolean;
  remoteUid?: number;
};

export type StoredMessage = {
  id: string;
  threadId: string;
  created: boolean;
};

export function rawKeyFor(mailboxId: string, messageId: string): string {
  return `mail/${mailboxId}/raw/${messageId}.eml`;
}

export function attachmentKeyFor(
  mailboxId: string,
  messageId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
  return `mail/${mailboxId}/att/${messageId}/${safe}`;
}

/**
 * Writes a parsed message into the index, its raw MIME and attachment bytes into R2.
 * Returns the existing row when the same Message-ID already landed in the folder, so
 * queue retries and overlapping IMAP polls stay idempotent.
 */
export async function storeMessage(
  db: Database,
  bucket: R2Bucket,
  parsed: ParsedMessage,
  options: StoreOptions,
): Promise<StoredMessage> {
  if (parsed.messageId) {
    const existing = await db
      .select({ id: messages.id, threadId: messages.threadId })
      .from(messages)
      .where(
        and(
          eq(messages.mailboxId, options.mailboxId),
          eq(messages.folderId, options.folderId),
          eq(messages.messageId, parsed.messageId),
        ),
      )
      .limit(1);
    const found = existing[0];
    if (found) {
      // Local delivery lands first; IMAP later attaches the server UID without duplicating.
      if (options.remoteUid != null) {
        await db.update(messages).set({ remoteUid: options.remoteUid }).where(eq(messages.id, found.id));
      }
      return { ...found, created: false };
    }
  }

  const id = newId("msg");
  const threadId = await resolveThreadId(db, options.mailboxId, {
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    messageId: parsed.messageId,
  });

  let rawKey = options.rawKey ?? null;
  if (options.raw) {
    rawKey = rawKeyFor(options.mailboxId, id);
    await bucket.put(rawKey, options.raw, {
      httpMetadata: { contentType: "message/rfc822" },
    });
  }

  await db.insert(messages).values({
    id,
    mailboxId: options.mailboxId,
    folderId: options.folderId,
    messageId: parsed.messageId ?? null,
    threadId,
    inReplyTo: parsed.inReplyTo ?? null,
    subject: parsed.subject,
    fromName: parsed.from.name ?? null,
    fromAddress: parsed.from.address,
    toAddresses: parsed.to,
    ccAddresses: parsed.cc.length ? parsed.cc : null,
    snippet: parsed.snippet,
    sentAt: parsed.date,
    receivedAt: Math.floor(Date.now() / 1000),
    seen: options.seen ?? false,
    draft: options.draft ?? false,
    hasAttachments: parsed.attachments.some((item) => !item.inline),
    size: options.size,
    rawKey,
    remoteUid: options.remoteUid ?? null,
  });

  for (const attachment of parsed.attachments) {
    const key = attachmentKeyFor(options.mailboxId, id, attachment.filename);
    await bucket.put(key, attachment.content, {
      httpMetadata: { contentType: attachment.mimeType },
    });
    await db.insert(attachments).values({
      id: newId("att"),
      messageId: id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.content.byteLength,
      contentId: attachment.contentId ?? null,
      inline: attachment.inline,
      r2Key: key,
    });
  }

  await rememberContacts(db, options.ownerId, parsed);

  return { id, threadId, created: true };
}

async function rememberContacts(
  db: Database,
  ownerId: string,
  parsed: ParsedMessage,
): Promise<void> {
  const seen = new Map<string, string | undefined>();
  for (const addr of [parsed.from, ...parsed.to, ...parsed.cc]) {
    if (addr.address && !seen.has(addr.address)) seen.set(addr.address, addr.name);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  for (const [email, name] of seen) {
    await db
      .insert(contacts)
      .values({
        id: newId("con"),
        ownerId,
        email,
        name: name ?? null,
        lastSeenAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [contacts.ownerId, contacts.email],
        set: { lastSeenAt: timestamp },
      });
  }
}

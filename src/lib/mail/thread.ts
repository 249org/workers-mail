import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

/**
 * Resolves the thread a message belongs to by walking its In-Reply-To/References
 * chain against messages already indexed for the mailbox, falling back to a new id.
 */
export async function resolveThreadId(
  db: Database,
  mailboxId: string,
  refs: { inReplyTo?: string; references?: string[]; messageId?: string },
): Promise<string> {
  const candidates = [refs.inReplyTo, ...(refs.references ?? [])].filter(
    (value): value is string => Boolean(value),
  );

  if (candidates.length > 0) {
    const parents = await db
      .select({ threadId: messages.threadId })
      .from(messages)
      .where(and(eq(messages.mailboxId, mailboxId), inArray(messages.messageId, candidates)))
      .limit(1);
    const parent = parents[0];
    if (parent) return parent.threadId;
  }

  if (refs.messageId) {
    const children = await db
      .select({ threadId: messages.threadId })
      .from(messages)
      .where(
        and(
          eq(messages.mailboxId, mailboxId),
          eq(messages.inReplyTo, refs.messageId),
          isNotNull(messages.threadId),
        ),
      )
      .limit(1);
    const child = children[0];
    if (child) return child.threadId;
  }

  return newId("thr");
}

/** Strips reply/forward prefixes so subjects group consistently in the list view. */
export function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*((re|fwd?|aw|sv|vs|antw)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
}

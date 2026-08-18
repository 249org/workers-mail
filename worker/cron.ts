import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { withTimeout } from "@/lib/timeout";

const POKE_TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;

/**
 * Nudges every external IMAP mailbox on a schedule. Each poke is bounded and run in
 * bounded parallel so one unreachable host cannot consume the whole cron invocation.
 */
export async function pollExternalMailboxes(env: CloudflareEnv): Promise<void> {
  const db = createDb(env.DB);
  const rows = await db
    .select({ id: mailboxes.id, backfillComplete: mailboxes.backfillComplete })
    .from(mailboxes)
    .where(eq(mailboxes.type, "external_imap"));

  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    const slice = rows.slice(index, index + CONCURRENCY);
    await Promise.all(
      slice.map(async (mailbox) => {
        const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailbox.id));
        try {
          await withTimeout(
            stub.poke({ backfill: !mailbox.backfillComplete, mailboxId: mailbox.id }),
            POKE_TIMEOUT_MS,
          );
        } catch (error) {
          console.warn("scheduled poke failed", {
            mailboxId: mailbox.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }
}

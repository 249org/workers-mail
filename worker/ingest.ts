import { createDb, type Database } from "@/lib/db";
import { parseMime } from "@/lib/mail/mime";
import { folderByRole } from "@/lib/mail/mailboxes";
import { storeMessage } from "@/lib/mail/store";
import { withTimeout } from "@/lib/timeout";
import type { MailboxEvent } from "@/lib/mail/events";
import type { IngestJob } from "./types";

const NOTIFY_TIMEOUT_MS = 3_000;

export async function handleIngestBatch(
  batch: MessageBatch<IngestJob>,
  env: CloudflareEnv,
): Promise<void> {
  const db = createDb(env.DB);

  for (const item of batch.messages) {
    try {
      await ingestOne(item.body, db, env);
      item.ack();
    } catch (error) {
      console.error("ingest failed", { key: item.body.inboundKey, error: describe(error) });
      item.retry();
    }
  }
}

async function ingestOne(job: IngestJob, db: Database, env: CloudflareEnv): Promise<void> {
  const object = await env.MAIL_BUCKET.get(job.inboundKey);
  if (!object) {
    console.warn("inbound object missing, dropping job", { key: job.inboundKey });
    return;
  }

  const inbox = await folderByRole(db, job.mailboxId, "inbox");
  if (!inbox) throw new Error(`Mailbox ${job.mailboxId} has no inbox folder`);

  const raw = new Uint8Array(await object.arrayBuffer());
  const parsed = await parseMime(raw);
  const stored = await storeMessage(db, env.MAIL_BUCKET, parsed, {
    mailboxId: job.mailboxId,
    folderId: inbox.id,
    ownerId: job.ownerId,
    raw,
    size: job.size || raw.byteLength,
  });

  await env.MAIL_BUCKET.delete(job.inboundKey);
  if (!stored.created) return;

  const event: MailboxEvent = {
    type: "new",
    messageId: stored.id,
    folderId: inbox.id,
    subject: parsed.subject,
    from: parsed.from.address,
  };

  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(job.mailboxId));
  await withTimeout(stub.notify(event), NOTIFY_TIMEOUT_MS).catch((error) => {
    console.warn("mailbox notify failed", { mailboxId: job.mailboxId, error: describe(error) });
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

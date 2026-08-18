import { EmailMessage } from "cloudflare:email";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { deliveryLog, messages, type Addr } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { buildRawMessage, generateMessageId, type OutboundAttachment } from "./build";
import { domainOf } from "./address";
import { buildSnippet, parseMime } from "./mime";
import { folderByRole, type Mailbox } from "./mailboxes";
import { canSendAs } from "./routing";
import { storeMessage } from "./store";
import { smtpCredentials } from "@/lib/transport/credentials";
import { sendViaSmtp } from "@/lib/transport/smtp";

export class SendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendError";
  }
}

export type SendRequest = {
  to: Addr[];
  cc?: Addr[];
  bcc?: Addr[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: OutboundAttachment[];
  /** Draft to replace with the Sent copy once delivery succeeds. */
  draftId?: string;
};

export type SendDeps = {
  db: Database;
  bucket: R2Bucket;
  email: SendEmail;
  encryptionKey: string | undefined;
};

export type SendResult = {
  messageId: string;
  storedMessageId: string | null;
  transport: "send_email" | "smtp";
};

export async function sendMessage(
  deps: SendDeps,
  mailbox: Mailbox,
  request: SendRequest,
): Promise<SendResult> {
  const recipients = [...request.to, ...(request.cc ?? []), ...(request.bcc ?? [])];
  if (recipients.length === 0) throw new SendError("Add at least one recipient.");
  if (!(await canSendAs(deps.db, mailbox.ownerId, mailbox.address))) {
    throw new SendError(
      `${mailbox.address} is not cleared for sending. Verify the domain first.`,
    );
  }

  const from: Addr = mailbox.displayName
    ? { name: mailbox.displayName, address: mailbox.address }
    : { address: mailbox.address };

  const messageId = generateMessageId(domainOf(mailbox.address));
  const raw = buildRawMessage({
    from,
    to: request.to,
    cc: request.cc,
    bcc: request.bcc,
    subject: request.subject,
    text: request.text,
    html: request.html,
    inReplyTo: request.inReplyTo,
    references: request.references,
    attachments: request.attachments,
    messageId,
  });
  const rawBytes = new TextEncoder().encode(raw);

  const transport: SendResult["transport"] =
    mailbox.type === "external_imap" ? "smtp" : "send_email";

  try {
    if (transport === "smtp") {
      const credentials = await smtpCredentials(mailbox, deps.encryptionKey);
      await sendViaSmtp(credentials, {
        from: mailbox.address,
        to: request.to.map((addr) => addr.address),
        cc: request.cc?.map((addr) => addr.address),
        bcc: request.bcc?.map((addr) => addr.address),
        subject: request.subject,
        raw: rawBytes,
      });
    } else {
      for (const recipient of recipients) {
        await deps.email.send(new EmailMessage(mailbox.address, recipient.address, raw));
      }
    }
  } catch (error) {
    await logDelivery(deps.db, mailbox.id, recipients, transport, "failed", describe(error));
    throw new SendError(`Delivery failed: ${describe(error)}`);
  }

  await logDelivery(deps.db, mailbox.id, recipients, transport, "sent");

  const storedMessageId = await writeSentCopy(deps, mailbox, rawBytes, request.draftId);
  return { messageId, storedMessageId, transport };
}

async function writeSentCopy(
  deps: SendDeps,
  mailbox: Mailbox,
  rawBytes: Uint8Array,
  draftId?: string,
): Promise<string | null> {
  const sent = await folderByRole(deps.db, mailbox.id, "sent");
  if (!sent) return null;

  const parsed = await parseMime(rawBytes);
  const stored = await storeMessage(deps.db, deps.bucket, parsed, {
    mailboxId: mailbox.id,
    folderId: sent.id,
    ownerId: mailbox.ownerId,
    raw: rawBytes,
    size: rawBytes.byteLength,
    seen: true,
  });

  if (draftId) {
    await deps.db.delete(messages).where(eq(messages.id, draftId));
  }

  return stored.id;
}

async function logDelivery(
  db: Database,
  mailboxId: string,
  recipients: Addr[],
  transport: SendResult["transport"],
  status: "queued" | "sent" | "failed",
  detail?: string,
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  await db.insert(deliveryLog).values(
    recipients.map((recipient) => ({
      id: newId("dlv"),
      mailboxId,
      transport,
      recipient: recipient.address,
      status,
      detail: detail ? buildSnippet(detail, 400) : null,
      createdAt: timestamp,
    })),
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

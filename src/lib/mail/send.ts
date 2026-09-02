import { EmailMessage } from "cloudflare:email";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { deliveryLog, messages, type Addr } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { buildRawMessage, generateMessageId, type OutboundAttachment } from "./build";
import { domainOf, normalizeAddress } from "./address";
import { buildSnippet, parseMime } from "./mime";
import { folderByRole, mailboxByAddress, type Mailbox } from "./mailboxes";
import { canSendAs } from "./routing";
import { storeMessage } from "./store";
import { smtpAuth } from "@/lib/transport/credentials";
import { sendViaSmtp } from "@/lib/transport/smtp";
import { appendToSentMailbox } from "@/lib/transport/imap-push";
import { smtpSavesToSentFolder } from "@/lib/transport/presets";
import { plainTextToHtml } from "./sanitize";

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
  env: CloudflareEnv;
};

export type LocalDelivery = {
  mailboxId: string;
  messageId: string;
  folderId: string;
  subject: string;
  from: string;
};

export type SendResult = {
  messageId: string;
  storedMessageId: string | null;
  transport: "send_email" | "smtp";
  localDeliveries: LocalDelivery[];
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
      const credentials = await smtpAuth(mailbox, deps.env, deps.db);
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
  await fileOnServer(deps, mailbox, rawBytes);
  const localDeliveries = await deliverLocalCopies(deps, recipients, rawBytes);
  return { messageId, storedMessageId, transport, localDeliveries };
}

/**
 * Files the sent copy in the IMAP account's own Sent mailbox so other clients on the
 * same account see it. Delivery already succeeded by this point, so a failure here is
 * logged rather than surfaced as a send error.
 */
async function fileOnServer(
  deps: SendDeps,
  mailbox: Mailbox,
  rawBytes: Uint8Array,
): Promise<void> {
  if (mailbox.type !== "external_imap") return;
  if (smtpSavesToSentFolder(mailbox.smtpHost)) return;

  const sent = await folderByRole(deps.db, mailbox.id, "sent");
  if (!sent) return;

  try {
    await appendToSentMailbox(mailbox, deps.env, deps.db, sent, rawBytes);
  } catch (error) {
    console.warn("could not file the sent copy on the server", {
      mailboxId: mailbox.id,
      error: describe(error),
    });
  }
}

/** Puts a copy in any in-app inbox that matches a recipient, so the open mailbox does not wait on IMAP. */
async function deliverLocalCopies(
  deps: SendDeps,
  recipients: Addr[],
  rawBytes: Uint8Array,
): Promise<LocalDelivery[]> {
  const deliveries: LocalDelivery[] = [];
  const seen = new Set<string>();

  for (const recipient of recipients) {
    const address = normalizeAddress(recipient.address);
    if (seen.has(address)) continue;
    seen.add(address);

    const target = await mailboxByAddress(deps.db, address);
    if (!target) continue;

    const inbox = await folderByRole(deps.db, target.id, "inbox");
    if (!inbox) continue;

    const parsed = await parseMime(rawBytes);
    const stored = await storeMessage(deps.db, deps.bucket, parsed, {
      mailboxId: target.id,
      folderId: inbox.id,
      ownerId: target.ownerId,
      raw: rawBytes,
      size: rawBytes.byteLength,
      seen: false,
    });
    if (!stored.created) continue;

    deliveries.push({
      mailboxId: target.id,
      messageId: stored.id,
      folderId: inbox.id,
      subject: parsed.subject,
      from: parsed.from.address,
    });
  }

  return deliveries;
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
    /*
     * Scoped to the sending mailbox and to rows that are actually drafts. The id arrives
     * in the request body, so an unscoped delete here let any signed-in account destroy
     * a message in someone else's mailbox by naming it.
     */
    await deps.db
      .delete(messages)
      .where(
        and(
          eq(messages.id, draftId),
          eq(messages.mailboxId, mailbox.id),
          eq(messages.draft, true),
        ),
      );
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


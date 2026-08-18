import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { parseAddressList } from "@/lib/mail/address";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { sendMessage, SendError } from "@/lib/mail/send";
import { rateLimit } from "@/lib/rate-limit";
import { testImapConnection } from "@/lib/transport/imap";
import { testSmtpConnection } from "@/lib/transport/smtp";
import {
  TransportConfigError,
  validateImapSettings,
  validateSmtpSettings,
} from "@/lib/transport/validate";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const SEND_LIMIT_PER_HOUR = 60;

type TransportInput = {
  host?: string;
  port?: number;
  tls?: "implicit" | "starttls";
  username?: string;
  password?: string;
};

type SendBody = {
  mailboxId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  draftId?: string;
  attachments?: Array<{ filename: string; mimeType: string; contentBase64: string }>;
};

type TestBody = { address?: string; imap?: TransportInput; smtp?: TransportInput };
type Check = { ok: boolean; detail: string; folders?: string[] };

/**
 * Outbound delivery lives in the Worker entry rather than a Next route handler because
 * both transports need modules that only resolve inside workerd: `cloudflare:email` for
 * native mailboxes and `cloudflare:sockets` for SMTP.
 */
export async function handleSend(request: Request, env: CloudflareEnv): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, env);
    const body = await readJson<SendBody>(request);

    const limit = await rateLimit(env.SESSION_STORE, `send:${user.id}`, SEND_LIMIT_PER_HOUR, 3600);
    if (!limit.allowed) throw new ApiError(429, "Send limit reached for this hour.");

    if (!body.mailboxId) throw new ApiError(400, "mailboxId is required");
    const mailbox = await getOwnedMailbox(db, user.id, body.mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const to = parseAddressList(body.to ?? "");
    if (to.length === 0) throw new ApiError(400, "Add at least one valid recipient.");

    const attachments = (body.attachments ?? []).map((attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType || "application/octet-stream",
      content: decodeBase64(attachment.contentBase64),
    }));
    const total = attachments.reduce((sum, file) => sum + file.content.byteLength, 0);
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(413, "Attachments exceed the 15 MB limit.");
    }

    const result = await sendMessage(
      { db, bucket: env.MAIL_BUCKET, email: env.EMAIL, encryptionKey: env.MAIL_ENCRYPTION_KEY },
      mailbox,
      {
        to,
        cc: parseAddressList(body.cc ?? ""),
        bcc: parseAddressList(body.bcc ?? ""),
        subject: body.subject?.trim() ?? "",
        text: body.text ?? "",
        html: body.html,
        inReplyTo: body.inReplyTo,
        references: body.references,
        attachments,
        draftId: body.draftId,
      },
    );

    const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailbox.id));
    await stub
      .notify({ type: "sent", messageId: result.storedMessageId ?? result.messageId })
      .catch(() => undefined);

    return Response.json(result);
  } catch (error) {
    if (error instanceof SendError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    return errorResponse(error);
  }
}

/** Probes a prospective IMAP/SMTP account before its credentials are stored. */
export async function handleTestConnection(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  try {
    await authenticate(request, env);
    const body = await readJson<TestBody>(request);
    const password = body.imap?.password ?? "";

    const imap = validateImapSettings({
      host: body.imap?.host,
      port: body.imap?.port,
      tls: body.imap?.tls,
      username: body.imap?.username || body.address,
    });
    const smtp = validateSmtpSettings({
      host: body.smtp?.host,
      port: body.smtp?.port,
      tls: body.smtp?.tls,
      username: body.smtp?.username || imap.username,
    });

    const imapCheck = await runCheck(async () => {
      const folders = await testImapConnection({
        hostname: imap.host,
        port: imap.port,
        tls: imap.tls,
        username: imap.username,
        password,
      });
      return { detail: `Signed in and listed ${folders.length} folders.`, folders };
    });

    const smtpCheck = await runCheck(async () => {
      await testSmtpConnection({
        hostname: smtp.host,
        port: smtp.port,
        tls: smtp.tls,
        username: smtp.username,
        password: body.smtp?.password || password,
      });
      return { detail: "Handshake and authentication succeeded." };
    });

    return Response.json({ imap: imapCheck, smtp: smtpCheck });
  } catch (error) {
    if (error instanceof TransportConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}

async function runCheck(
  probe: () => Promise<{ detail: string; folders?: string[] }>,
): Promise<Check> {
  try {
    return { ok: true, ...(await probe()) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.includes(",") ? (value.split(",")[1] ?? "") : value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

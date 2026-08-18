import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { createSession, hasAnyUser, sessionCookie } from "@/lib/auth/session";
import { encryptSecret, hashPassword } from "@/lib/crypto";
import { createDb } from "@/lib/db";
import { mailboxes, users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { isEmailAddress, normalizeAddress, parseAddressList } from "@/lib/mail/address";
import { ensureDefaultFolders, getOwnedMailbox } from "@/lib/mail/mailboxes";
import { sendMessage, SendError } from "@/lib/mail/send";
import { clientKey, rateLimit } from "@/lib/rate-limit";
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

    await Promise.all(
      result.localDeliveries.map((delivery) => {
        const recipient = env.MAILBOX.get(env.MAILBOX.idFromName(delivery.mailboxId));
        return recipient
          .notify({
            type: "new",
            messageId: delivery.messageId,
            folderId: delivery.folderId,
            subject: delivery.subject,
            from: delivery.from,
          })
          .catch(() => undefined);
      }),
    );

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

type SetupBody = {
  name?: string;
  address?: string;
  password?: string;
  loginPassword?: string;
  imap?: TransportInput;
  smtp?: TransportInput;
};

/**
 * First-run onboarding: verify a real IMAP/SMTP account, then create the workspace
 * owner and their first mailbox together. Sign-in uses the mailbox password unless
 * a separate loginPassword is supplied. It lives in the Worker because the
 * verification opens sockets, which only resolve inside workerd.
 *
 * The `hasAnyUser` check here is the security boundary, not the UI that hides the
 * form: once an account exists this endpoint is closed for good.
 */
export async function handleSetup(request: Request, env: CloudflareEnv): Promise<Response> {
  try {
    const limit = await rateLimit(env.SESSION_STORE, clientKey(request, "setup"), 5, 900);
    if (!limit.allowed) throw new ApiError(429, "Too many attempts. Try again shortly.");

    const db = createDb(env.DB);
    if (await hasAnyUser(db)) {
      throw new ApiError(403, "This workspace is already set up.");
    }

    const body = await readJson<SetupBody>(request);
    const address = normalizeAddress(body.address ?? "");
    const password = body.password ?? "";
    const loginPassword = body.loginPassword ?? "";

    if (!isEmailAddress(address)) throw new ApiError(400, "Enter a valid email address.");
    if (!password) throw new ApiError(400, "Enter the account password.");
    const workspacePassword = loginPassword || password;
    if (!env.MAIL_ENCRYPTION_KEY) {
      throw new ApiError(503, "Set the MAIL_ENCRYPTION_KEY secret before connecting a mailbox.");
    }

    const imap = validateImapSettings({
      host: body.imap?.host,
      port: body.imap?.port,
      tls: body.imap?.tls,
      username: body.imap?.username || address,
    });
    const smtp = validateSmtpSettings({
      host: body.smtp?.host,
      port: body.smtp?.port,
      tls: body.smtp?.tls,
      username: body.smtp?.username || imap.username,
    });

    // Prove the credentials work before anything is persisted.
    const folders = await testImapConnection({
      hostname: imap.host,
      port: imap.port,
      tls: imap.tls,
      username: imap.username,
      password,
    }).catch((error: unknown) => {
      throw new ApiError(502, `IMAP sign-in failed: ${describeError(error)}`);
    });

    await testSmtpConnection({
      hostname: smtp.host,
      port: smtp.port,
      tls: smtp.tls,
      username: smtp.username,
      password: body.smtp?.password || password,
    }).catch((error: unknown) => {
      throw new ApiError(502, `SMTP sign-in failed: ${describeError(error)}`);
    });

    const userId = newId("usr");
    await db.insert(users).values({
      id: userId,
      email: address,
      name: body.name?.trim() || null,
      passwordHash: await hashPassword(workspacePassword),
      role: "admin",
    });

    const mailboxId = newId("mbx");
    await db.insert(mailboxes).values({
      id: mailboxId,
      ownerId: userId,
      type: "external_imap",
      address,
      displayName: body.name?.trim() || null,
      imapHost: imap.host,
      imapPort: imap.port,
      imapTls: imap.tls,
      imapUser: imap.username,
      imapPassword: await encryptSecret(password, env.MAIL_ENCRYPTION_KEY),
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpTls: smtp.tls,
      smtpUser: smtp.username,
      smtpPassword: await encryptSecret(
        body.smtp?.password || password,
        env.MAIL_ENCRYPTION_KEY,
      ),
    });
    await ensureDefaultFolders(db, mailboxId);

    // Start the first sync in the background so the inbox is filling on arrival.
    const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
    void stub.poke({ backfill: true, mailboxId }).catch((error) => {
      console.error("initial mailbox poke failed", {
        mailboxId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const session = await createSession(env.SESSION_STORE, userId);
    return Response.json(
      { mailboxId, folders: folders.length },
      {
        status: 201,
        headers: {
          "set-cookie": sessionCookie(
            session.token,
            session.maxAge,
            new URL(request.url).protocol === "https:",
          ),
        },
      },
    );
  } catch (error) {
    if (error instanceof TransportConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

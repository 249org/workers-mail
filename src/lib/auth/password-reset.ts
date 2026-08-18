import { EmailMessage } from "cloudflare:email";
import type { Database } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";
import { randomToken } from "@/lib/ids";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { smtpCredentials } from "@/lib/transport/credentials";
import { sendViaSmtp } from "@/lib/transport/smtp";
import { buildRawMessage, generateMessageId } from "@/lib/mail/build";
import { domainOf } from "@/lib/mail/address";

const RESET_TTL_SECONDS = 60 * 60;

type ResetRecord = { userId: string };

export async function issuePasswordReset(
  store: KVNamespace,
  userId: string,
): Promise<string> {
  const token = randomToken(32);
  await store.put(resetKey(await sha256Hex(token)), JSON.stringify({ userId } satisfies ResetRecord), {
    expirationTtl: RESET_TTL_SECONDS,
  });
  return token;
}

export async function consumePasswordReset(
  store: KVNamespace,
  token: string,
): Promise<string | null> {
  const key = resetKey(await sha256Hex(token));
  const raw = await store.get(key);
  if (!raw) return null;
  await store.delete(key);
  try {
    const record = JSON.parse(raw) as ResetRecord;
    return record.userId || null;
  } catch {
    return null;
  }
}

export async function sendResetEmail(
  env: CloudflareEnv,
  db: Database,
  userId: string,
  to: string,
  resetUrl: string,
): Promise<boolean> {
  const owned = await listMailboxes(db, userId);
  const mailbox =
    owned.find((item) => item.address.toLowerCase() === to.toLowerCase()) ?? owned[0];
  if (!mailbox) return false;

  const raw = buildRawMessage({
    from: { address: mailbox.address, name: "Workers Mail" },
    to: [{ address: to }],
    subject: "Reset your Workers Mail password",
    text: [
      "A password reset was requested for this Workers Mail account.",
      "",
      "Open this link within an hour to choose a new password:",
      resetUrl,
      "",
      "If you did not ask for this, you can ignore the message.",
    ].join("\n"),
    messageId: generateMessageId(domainOf(mailbox.address)),
  });
  const bytes = new TextEncoder().encode(raw);

  try {
    if (mailbox.type === "external_imap") {
      const credentials = await smtpCredentials(mailbox, env.MAIL_ENCRYPTION_KEY);
      await sendViaSmtp(credentials, {
        from: mailbox.address,
        to: [to],
        subject: "Reset your Workers Mail password",
        raw: bytes,
      });
    } else {
      await env.EMAIL.send(new EmailMessage(mailbox.address, to, raw));
    }
    return true;
  } catch (error) {
    console.error("password reset mail failed", error);
    return false;
  }
}

function resetKey(hash: string): string {
  return `pw-reset:${hash}`;
}

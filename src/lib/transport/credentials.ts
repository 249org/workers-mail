import { decryptSecret } from "@/lib/crypto";
import type { Database } from "@/lib/db";
import type { Mailbox } from "@/lib/mail/mailboxes";
import { accessTokenForMailbox, isOauthMailbox } from "@/lib/oauth/tokens";
import type { TlsMode } from "./validate";

export type ImapCredentials = {
  hostname: string;
  port: number;
  tls: TlsMode;
  username: string;
  password: string;
};

export type SmtpCredentials = ImapCredentials;

export type MailAuth = ImapCredentials & { mechanism: "password" | "xoauth2" };

export class MissingCredentialsError extends Error {
  constructor(kind: string) {
    super(`Mailbox has no ${kind} credentials configured`);
    this.name = "MissingCredentialsError";
  }
}

export async function imapAuth(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db?: Database,
): Promise<MailAuth> {
  if (isOauthMailbox(mailbox)) {
    if (!mailbox.imapHost || !mailbox.imapUser) throw new MissingCredentialsError("IMAP");
    return {
      hostname: mailbox.imapHost,
      port: mailbox.imapPort ?? 993,
      tls: mailbox.imapTls ?? "implicit",
      username: mailbox.imapUser,
      password: await accessTokenForMailbox(mailbox, env, db),
      mechanism: "xoauth2",
    };
  }
  const password = await passwordAuth(mailbox, env.MAIL_ENCRYPTION_KEY, "IMAP");
  return { ...password, mechanism: "password" };
}

export async function smtpAuth(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db?: Database,
): Promise<MailAuth> {
  if (isOauthMailbox(mailbox)) {
    if (!mailbox.smtpHost || !mailbox.smtpUser) throw new MissingCredentialsError("SMTP");
    return {
      hostname: mailbox.smtpHost,
      port: mailbox.smtpPort ?? 587,
      tls: mailbox.smtpTls ?? "starttls",
      username: mailbox.smtpUser,
      password: await accessTokenForMailbox(mailbox, env, db),
      mechanism: "xoauth2",
    };
  }
  if (!mailbox.smtpHost || !mailbox.smtpUser || !mailbox.smtpPassword) {
    throw new MissingCredentialsError("SMTP");
  }
  return {
    hostname: mailbox.smtpHost,
    port: mailbox.smtpPort ?? 587,
    tls: mailbox.smtpTls ?? "starttls",
    username: mailbox.smtpUser,
    password: await decryptSecret(mailbox.smtpPassword, env.MAIL_ENCRYPTION_KEY),
    mechanism: "password",
  };
}

/** @deprecated Prefer {@link imapAuth} which understands one-click OAuth mailboxes. */
export async function imapCredentials(
  mailbox: Mailbox,
  encryptionKey: string | undefined,
): Promise<ImapCredentials> {
  const password = await passwordAuth(mailbox, encryptionKey, "IMAP");
  const { mechanism: _mechanism, ...rest } = { ...password, mechanism: "password" as const };
  return rest;
}

/** @deprecated Prefer {@link smtpAuth}. */
export async function smtpCredentials(
  mailbox: Mailbox,
  encryptionKey: string | undefined,
): Promise<SmtpCredentials> {
  if (!mailbox.smtpHost || !mailbox.smtpUser || !mailbox.smtpPassword) {
    throw new MissingCredentialsError("SMTP");
  }
  return {
    hostname: mailbox.smtpHost,
    port: mailbox.smtpPort ?? 587,
    tls: mailbox.smtpTls ?? "starttls",
    username: mailbox.smtpUser,
    password: await decryptSecret(mailbox.smtpPassword, encryptionKey),
  };
}

async function passwordAuth(
  mailbox: Mailbox,
  encryptionKey: string | undefined,
  kind: "IMAP" | "SMTP",
): Promise<ImapCredentials> {
  if (!mailbox.imapHost || !mailbox.imapUser || !mailbox.imapPassword) {
    throw new MissingCredentialsError(kind);
  }
  return {
    hostname: mailbox.imapHost,
    port: mailbox.imapPort ?? 993,
    tls: mailbox.imapTls ?? "implicit",
    username: mailbox.imapUser,
    password: await decryptSecret(mailbox.imapPassword, encryptionKey),
  };
}

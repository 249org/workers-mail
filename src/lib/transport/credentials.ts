import { decryptSecret } from "@/lib/crypto";
import type { Mailbox } from "@/lib/mail/mailboxes";
import type { TlsMode } from "./validate";

export type ImapCredentials = {
  hostname: string;
  port: number;
  tls: TlsMode;
  username: string;
  password: string;
};

export type SmtpCredentials = ImapCredentials;

export class MissingCredentialsError extends Error {
  constructor(kind: string) {
    super(`Mailbox has no ${kind} credentials configured`);
    this.name = "MissingCredentialsError";
  }
}

export async function imapCredentials(
  mailbox: Mailbox,
  encryptionKey: string | undefined,
): Promise<ImapCredentials> {
  if (!mailbox.imapHost || !mailbox.imapUser || !mailbox.imapPassword) {
    throw new MissingCredentialsError("IMAP");
  }
  return {
    hostname: mailbox.imapHost,
    port: mailbox.imapPort ?? 993,
    tls: mailbox.imapTls ?? "implicit",
    username: mailbox.imapUser,
    password: await decryptSecret(mailbox.imapPassword, encryptionKey),
  };
}

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

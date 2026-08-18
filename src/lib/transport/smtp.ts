import { type MailAuth, type SmtpCredentials } from "./credentials";
import { openSmtp } from "./oauth-connect";

export type SmtpSendInput = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  raw: Uint8Array;
};

export async function sendViaSmtp(
  credentials: MailAuth | SmtpCredentials,
  input: SmtpSendInput,
): Promise<{ accepted: string[]; response: string }> {
  const session = await openSmtp(withMechanism(credentials));

  try {
    return await session.send({
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      raw: input.raw,
    });
  } finally {
    await session.close();
  }
}

export async function testSmtpConnection(credentials: MailAuth | SmtpCredentials): Promise<void> {
  const session = await openSmtp(withMechanism(credentials));
  await session.close();
}

function withMechanism(credentials: MailAuth | SmtpCredentials): MailAuth {
  if ("mechanism" in credentials) return credentials;
  return { ...credentials, mechanism: "password" };
}

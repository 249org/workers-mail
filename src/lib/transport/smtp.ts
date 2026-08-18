import { connect } from "edgeport/smtp";
import type { SmtpCredentials } from "./credentials";

export type SmtpSendInput = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  raw: Uint8Array;
};

export async function sendViaSmtp(
  credentials: SmtpCredentials,
  input: SmtpSendInput,
): Promise<{ accepted: string[]; response: string }> {
  const session = await connect({
    hostname: credentials.hostname,
    port: credentials.port,
    tls: credentials.tls,
    auth: { username: credentials.username, password: credentials.password },
    timeoutMs: 20_000,
  });

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

export async function testSmtpConnection(credentials: SmtpCredentials): Promise<void> {
  const session = await connect({
    hostname: credentials.hostname,
    port: credentials.port,
    tls: credentials.tls,
    auth: { username: credentials.username, password: credentials.password },
    timeoutMs: 15_000,
  });
  await session.close();
}

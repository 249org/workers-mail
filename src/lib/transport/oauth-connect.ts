import { connect as coreConnect, type CoreSocket } from "edgeport/core";
import { connect as imapPasswordConnect, _imapSessionFromSocket, type ImapSession } from "edgeport/imap";
import { connect as smtpPasswordConnect, _sessionFromSocket, type SmtpSession } from "edgeport/smtp";
import { encodeXoauth2, rewriteImapLogin, rewriteSmtpAuth } from "@/lib/oauth/xoauth2";
import type { MailAuth } from "./credentials";

function rewriteWrites(socket: CoreSocket, rewrite: (line: string) => string): CoreSocket {
  return {
    reader: socket.reader,
    writer: {
      write: (chunk) => socket.writer.write(chunk),
      writeLine: (line) => socket.writer.writeLine(rewrite(line)),
      close: () => socket.writer.close(),
    },
    closed: socket.closed,
    close: () => socket.close(),
    startTls: (opts) => rewriteWrites(socket.startTls(opts), rewrite),
    [Symbol.asyncDispose]: () => socket.close(),
  };
}

export async function openImap(credentials: MailAuth): Promise<ImapSession> {
  if (credentials.mechanism !== "xoauth2") {
    return imapPasswordConnect({
      hostname: credentials.hostname,
      port: credentials.port,
      tls: credentials.tls,
      auth: { username: credentials.username, password: credentials.password },
      timeoutMs: 15_000,
    });
  }

  const sasl = encodeXoauth2(credentials.username, credentials.password);
  const socket = rewriteWrites(
    await coreConnect({
      hostname: credentials.hostname,
      port: credentials.port,
      tls: credentials.tls === "starttls" ? "starttls" : credentials.tls === "implicit" ? "on" : "off",
      connectTimeoutMs: 15_000,
    }),
    (line) => rewriteImapLogin(line, sasl),
  );

  try {
    return await _imapSessionFromSocket(socket, {
      hostname: credentials.hostname,
      port: credentials.port,
      tls: credentials.tls,
      auth: { username: credentials.username, password: "xoauth2" },
      timeoutMs: 15_000,
    });
  } catch (error) {
    await socket.close().catch(() => undefined);
    throw error;
  }
}

export async function openSmtp(credentials: MailAuth): Promise<SmtpSession> {
  if (credentials.mechanism !== "xoauth2") {
    return smtpPasswordConnect({
      hostname: credentials.hostname,
      port: credentials.port,
      tls: credentials.tls,
      auth: { username: credentials.username, password: credentials.password },
      timeoutMs: 20_000,
    });
  }

  const sasl = encodeXoauth2(credentials.username, credentials.password);
  const socket = rewriteWrites(
    await coreConnect({
      hostname: credentials.hostname,
      port: credentials.port,
      tls: credentials.tls === "implicit" ? "on" : credentials.tls === "starttls" ? "starttls" : "off",
      connectTimeoutMs: 20_000,
    }),
    (line) => rewriteSmtpAuth(line, sasl),
  );

  try {
    return await _sessionFromSocket(socket, {
      hostname: credentials.hostname,
      port: credentials.port,
      tls: credentials.tls,
      auth: { username: credentials.username, password: "xoauth2", mechanism: "PLAIN" },
      timeoutMs: 20_000,
    });
  } catch (error) {
    await socket.close().catch(() => undefined);
    throw error;
  }
}

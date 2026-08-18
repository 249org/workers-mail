import type { Addr } from "@/lib/db/schema";
import { formatAddress, formatAddressList } from "./address";

export type OutboundAttachment = {
  filename: string;
  mimeType: string;
  content: Uint8Array;
};

export type OutboundMessage = {
  from: Addr;
  to: Addr[];
  cc?: Addr[];
  bcc?: Addr[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: OutboundAttachment[];
  messageId: string;
  date?: Date;
};

const CRLF = "\r\n";

export function buildRawMessage(message: OutboundMessage): string {
  const boundaryMixed = `mixed_${randomBoundary()}`;
  const boundaryAlt = `alt_${randomBoundary()}`;
  const attachments = message.attachments ?? [];

  const headers: string[] = [
    `From: ${formatAddress(message.from)}`,
    `To: ${formatAddressList(message.to)}`,
  ];
  if (message.cc?.length) headers.push(`Cc: ${formatAddressList(message.cc)}`);
  headers.push(`Subject: ${encodeHeaderValue(message.subject)}`);
  headers.push(`Date: ${(message.date ?? new Date()).toUTCString()}`);
  headers.push(`Message-ID: <${message.messageId}>`);
  if (message.inReplyTo) headers.push(`In-Reply-To: <${message.inReplyTo}>`);
  if (message.references?.length) {
    headers.push(`References: ${message.references.map((ref) => `<${ref}>`).join(" ")}`);
  }
  headers.push("MIME-Version: 1.0");

  const body = attachments.length
    ? multipartMixed(message, boundaryMixed, boundaryAlt, attachments)
    : bodyPart(message, boundaryAlt);

  headers.push(
    attachments.length
      ? `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`
      : contentTypeForBody(message, boundaryAlt),
  );

  return `${headers.join(CRLF)}${CRLF}${CRLF}${body}`;
}

function contentTypeForBody(message: OutboundMessage, boundaryAlt: string): string {
  if (message.html) return `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`;
  return 'Content-Type: text/plain; charset="utf-8"';
}

function bodyPart(message: OutboundMessage, boundaryAlt: string): string {
  if (!message.html) {
    return `Content-Transfer-Encoding: base64${CRLF}${CRLF}${base64Lines(encodeText(message.text))}`;
  }
  return alternativeBody(message, boundaryAlt);
}

function alternativeBody(message: OutboundMessage, boundary: string): string {
  const parts = [
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(encodeText(message.text)),
    ].join(CRLF),
    [
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(encodeText(message.html ?? "")),
    ].join(CRLF),
  ];
  return `${parts.join(CRLF)}${CRLF}--${boundary}--${CRLF}`;
}

function multipartMixed(
  message: OutboundMessage,
  boundaryMixed: string,
  boundaryAlt: string,
  attachments: OutboundAttachment[],
): string {
  const inner = message.html
    ? [
        `--${boundaryMixed}`,
        `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
        "",
        alternativeBody(message, boundaryAlt),
      ].join(CRLF)
    : [
        `--${boundaryMixed}`,
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: base64",
        "",
        base64Lines(encodeText(message.text)),
      ].join(CRLF);

  const files = attachments.map((attachment) =>
    [
      `--${boundaryMixed}`,
      `Content-Type: ${attachment.mimeType}; name="${sanitizeFilename(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${sanitizeFilename(attachment.filename)}"`,
      "",
      base64Lines(attachment.content),
    ].join(CRLF),
  );

  return `${[inner, ...files].join(CRLF)}${CRLF}--${boundaryMixed}--${CRLF}`;
}

export function generateMessageId(domain: string): string {
  const random = crypto.randomUUID().replace(/-/g, "");
  return `${random}@${domain || "localhost"}`;
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function base64Lines(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += 76) lines.push(encoded.slice(i, i + 76));
  return lines.join(CRLF);
}

/** RFC 2047 encodes a header value when it carries anything outside printable ASCII. */
function encodeHeaderValue(value: string): string {
  if (!/[^\x20-\x7E]/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n\\]/g, "_");
}

function randomBoundary(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

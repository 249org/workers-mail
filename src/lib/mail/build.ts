import type { Addr } from "@/lib/db/schema";
import { formatAddress, formatAddressList } from "./address";

export type OutboundAttachment = {
  filename: string;
  mimeType: string;
  content: Uint8Array;
  contentId?: string;
  inline?: boolean;
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
  const attachments = message.attachments ?? [];
  const inline = attachments.filter((item) => item.inline && item.contentId);
  const files = attachments.filter((item) => !item.inline);
  const boundaryMixed = `mixed_${randomBoundary()}`;
  const boundaryRelated = `rel_${randomBoundary()}`;
  const boundaryAlt = `alt_${randomBoundary()}`;

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

  const stack = bodyStack(message, boundaryAlt, boundaryRelated, inline);
  const body = files.length > 0 ? wrapMixed(stack, files, boundaryMixed) : stack.body;
  headers.push(
    files.length > 0 ? `Content-Type: multipart/mixed; boundary="${boundaryMixed}"` : stack.contentType,
  );

  return `${headers.join(CRLF)}${CRLF}${CRLF}${body}`;
}

function bodyStack(
  message: OutboundMessage,
  boundaryAlt: string,
  boundaryRelated: string,
  inline: OutboundAttachment[],
): { contentType: string; body: string } {
  const alternative = Boolean(message.html);
  const innerType = alternative
    ? `multipart/alternative; boundary="${boundaryAlt}"`
    : 'text/plain; charset="utf-8"';
  const innerBody = alternative
    ? alternativeBody(message, boundaryAlt)
    : `Content-Transfer-Encoding: base64${CRLF}${CRLF}${base64Lines(encodeText(message.text))}`;

  if (inline.length === 0) {
    return {
      contentType: alternative
        ? `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`
        : 'Content-Type: text/plain; charset="utf-8"',
      body: alternative ? alternativeBody(message, boundaryAlt) : innerBody,
    };
  }

  const start = alternative
    ? [`--${boundaryRelated}`, `Content-Type: ${innerType}`, "", innerBody].join(CRLF)
    : [`--${boundaryRelated}`, `Content-Type: ${innerType}`, innerBody].join(CRLF);
  const parts = [start, ...inline.map((item) => inlinePart(boundaryRelated, item))];
  return {
    contentType: `Content-Type: multipart/related; type="${innerType.split(";")[0]}"; boundary="${boundaryRelated}"`,
    body: `${parts.join(CRLF)}${CRLF}--${boundaryRelated}--${CRLF}`,
  };
}

function wrapMixed(
  stack: { contentType: string; body: string },
  files: OutboundAttachment[],
  boundary: string,
): string {
  const inner = [`--${boundary}`, stack.contentType, "", stack.body].join(CRLF);
  const attached = files.map((file) =>
    [
      `--${boundary}`,
      `Content-Type: ${file.mimeType}; name="${sanitizeFilename(file.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${sanitizeFilename(file.filename)}"`,
      "",
      base64Lines(file.content),
    ].join(CRLF),
  );
  return `${[inner, ...attached].join(CRLF)}${CRLF}--${boundary}--${CRLF}`;
}

function inlinePart(boundary: string, attachment: OutboundAttachment): string {
  return [
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${sanitizeFilename(attachment.filename)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: inline; filename="${sanitizeFilename(attachment.filename)}"`,
    `Content-ID: <${attachment.contentId}>`,
    "",
    base64Lines(attachment.content),
  ].join(CRLF);
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

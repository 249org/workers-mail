import PostalMime, { type Address, type Attachment } from "postal-mime";
import type { Addr } from "@/lib/db/schema";

export type ParsedAttachment = {
  filename: string;
  mimeType: string;
  content: Uint8Array;
  contentId?: string;
  inline: boolean;
};

export type ParsedMessage = {
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  subject: string;
  from: Addr;
  to: Addr[];
  cc: Addr[];
  date: number;
  text: string;
  html?: string;
  snippet: string;
  attachments: ParsedAttachment[];
};

export async function parseMime(raw: ArrayBuffer | Uint8Array | string): Promise<ParsedMessage> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
  const from = toAddr(email.from) ?? { address: "" };
  const text = email.text ?? (email.html ? stripHtml(email.html) : "");

  return {
    messageId: cleanMessageId(email.messageId),
    inReplyTo: cleanMessageId(email.inReplyTo),
    references: parseReferences(email.references),
    subject: email.subject?.trim() ?? "",
    from,
    to: toAddrList(email.to),
    cc: toAddrList(email.cc),
    date: parseDate(email.date),
    text,
    html: email.html ?? undefined,
    snippet: buildSnippet(text),
    attachments: (email.attachments ?? []).map(toAttachment),
  };
}

export function buildSnippet(text: string, limit = 220): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanMessageId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^</, "").replace(/>$/, "");
  return trimmed || undefined;
}

function parseReferences(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((entry) => cleanMessageId(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function parseDate(value: string | null | undefined): number {
  if (!value) return Math.floor(Date.now() / 1000);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
}

function toAddr(value: Address | null | undefined): Addr | undefined {
  if (!value) return undefined;
  if (!value.address) return toAddrList(value.group)[0];
  const name = value.name?.trim();
  return name
    ? { name, address: value.address.toLowerCase() }
    : { address: value.address.toLowerCase() };
}

function toAddrList(value: Address[] | null | undefined): Addr[] {
  if (!value) return [];
  return value.flatMap((entry) => {
    if (entry.address) {
      const addr = toAddr(entry);
      return addr ? [addr] : [];
    }
    return toAddrList(entry.group ?? []);
  });
}

function toAttachment(attachment: Attachment): ParsedAttachment {
  const content =
    typeof attachment.content === "string"
      ? new TextEncoder().encode(attachment.content)
      : new Uint8Array(attachment.content);

  return {
    filename: attachment.filename?.trim() || "attachment",
    mimeType: attachment.mimeType || "application/octet-stream",
    content,
    contentId: cleanMessageId(attachment.contentId),
    inline: attachment.disposition === "inline",
  };
}

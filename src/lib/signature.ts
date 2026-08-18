export const MAX_SIGNATURE_CHARS = 4_000;

export type SignaturePrefs = {
  enabled: boolean;
  includeOnNew: boolean;
  includeOnReplies: boolean;
  includeOnForwards: boolean;
  text: string;
  byMailbox: Record<string, string>;
};

export const DEFAULT_SIGNATURE: SignaturePrefs = {
  enabled: true,
  includeOnNew: true,
  includeOnReplies: false,
  includeOnForwards: false,
  text: "",
  byMailbox: {},
};

const DELIM = "-- ";

export function parseSignature(value: unknown): SignaturePrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_SIGNATURE, byMailbox: {} };
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled !== false,
    includeOnNew: record.includeOnNew !== false,
    includeOnReplies: record.includeOnReplies === true,
    includeOnForwards: record.includeOnForwards === true,
    text: cleanSignatureText(record.text),
    byMailbox: parseByMailbox(record.byMailbox),
  };
}

export function cleanSignatureText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/\0/g, "").slice(0, MAX_SIGNATURE_CHARS);
}

export function signatureText(prefs: SignaturePrefs, mailboxId: string): string {
  if (!prefs.enabled) return "";
  const override = prefs.byMailbox[mailboxId];
  if (override?.trim()) return override.trim();
  return prefs.text.trim();
}

export function shouldIncludeSignature(
  prefs: SignaturePrefs,
  mode: "compose" | "reply" | "replyAll" | "forward" | undefined,
): boolean {
  if (!prefs.enabled) return false;
  if (mode === "forward") return prefs.includeOnForwards;
  if (mode === "reply" || mode === "replyAll") return prefs.includeOnReplies;
  return prefs.includeOnNew;
}

/** RFC 3676 sign-off: a line that is exactly `-- `. */
export function applySignature(body: string, signature: string): string {
  const { before, after } = splitAroundSignature(body);
  const trimmed = signature.trim();
  if (!trimmed) return joinParts(before, after);
  const block = `${before.replace(/\s+$/, "")}${before.trim() ? "\n\n" : ""}${DELIM}\n${trimmed}`;
  return joinParts(block, after);
}

function parseByMailbox(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(value as Record<string, unknown>)) {
    if (!id || id.length > 80) continue;
    const cleaned = cleanSignatureText(text);
    if (cleaned.trim()) out[id] = cleaned;
  }
  return out;
}

function splitAroundSignature(body: string): { before: string; after: string } {
  const lines = body.split("\n");
  let delimAt = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i] === DELIM) {
      delimAt = i;
      break;
    }
  }

  if (delimAt === -1) return splitBeforeQuote(body);

  const before = lines.slice(0, delimAt).join("\n").replace(/\s+$/, "");
  const rest = lines.slice(delimAt + 1).join("\n");
  const quoteAt = findQuoteIndex(rest);
  if (quoteAt === -1) return { before, after: "" };
  return { before, after: rest.slice(quoteAt) };
}

function splitBeforeQuote(body: string): { before: string; after: string } {
  const quoteAt = findQuoteIndex(body);
  if (quoteAt === -1) return { before: body, after: "" };
  return {
    before: body.slice(0, quoteAt).replace(/\s+$/, ""),
    after: body.slice(quoteAt),
  };
}

function findQuoteIndex(text: string): number {
  return text.match(/\n\nOn .+ wrote:\n>/)?.index ?? -1;
}

function joinParts(before: string, after: string): string {
  if (!after) return before;
  if (!before) return after.replace(/^\n+/, "\n\n");
  return `${before.replace(/\s+$/, "")}${after.startsWith("\n") ? after : `\n${after}`}`;
}

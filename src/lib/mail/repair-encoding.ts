/**
 * Repairs bodies from messages this app built before its MIME writer was fixed.
 *
 * Those messages put `Content-Transfer-Encoding` after the blank line that ends the
 * headers, so every parser treated it as the first line of the body and left the
 * payload undecoded. The bytes on the server cannot be rewritten, so the damage is
 * undone on the way out instead.
 */
// The separator is the blank line that should have ended the headers, or the single
// space it collapses to once a snippet has flattened the whitespace.
const ORPHANED =
  /^[ \t]*Content-Transfer-Encoding:[ \t]*(base64|quoted-printable)[ \t]*(?:(?:\r?\n)+|[ \t]+)([\s\S]*)$/i;

export function repairOrphanedEncoding(body: string): string {
  const match = body.match(ORPHANED);
  if (!match) return body;

  const encoding = (match[1] ?? "").toLowerCase();
  const payload = match[2] ?? "";

  const decoded =
    encoding === "base64" ? decodeBase64Text(payload) : decodeQuotedPrintable(payload);
  return decoded ?? body;
}

function decodeBase64Text(payload: string): string | null {
  const cleaned = payload.replace(/[^A-Za-z0-9+/=]/g, "");
  if (cleaned.length < 4) return null;

  // Decode the payload whole first: its padding is significant, and dropping it
  // silently loses the final character. Only a snippet cut mid-stream needs the
  // fallback to the largest complete quantum.
  const complete = decodeBase64(cleaned);
  if (complete !== null) return complete;

  const usable = cleaned.replace(/=+$/, "");
  const trimmed = usable.slice(0, usable.length - (usable.length % 4));
  return trimmed.length === 0 ? null : decodeBase64(trimmed);
}

function decodeBase64(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // Replacement characters mean this was never base64 text; keep the original body.
    return text.includes("�") ? null : text;
  } catch {
    return null;
  }
}

function decodeQuotedPrintable(payload: string): string | null {
  try {
    const joined = payload.replace(/=\r?\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < joined.length; i++) {
      const char = joined[i]!;
      if (char === "=" && i + 2 < joined.length) {
        const hex = joined.slice(i + 1, i + 3);
        if (/^[0-9a-f]{2}$/i.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      for (const byte of new TextEncoder().encode(char)) bytes.push(byte);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

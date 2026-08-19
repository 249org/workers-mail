const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,";

/**
 * IMAP mailbox names travel as modified UTF-7 (RFC 3501 §5.1.3): `&` is the shift
 * character rather than `+`, and the base64 alphabet ends `+,` instead of `+/`.
 * Servers that advertise UTF8=ACCEPT take raw UTF-8, but encoding is safe for both,
 * so a folder called "Café" survives either way.
 */
export function encodeMailboxName(name: string): string {
  let out = "";
  let buffer: number[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    out += `&${base64Utf16(buffer)}-`;
    buffer = [];
  };

  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x26) {
      flush();
      out += "&-";
      continue;
    }
    if (code >= 0x20 && code <= 0x7e) {
      flush();
      out += char;
      continue;
    }
    for (let i = 0; i < char.length; i++) buffer.push(char.charCodeAt(i));
  }

  flush();
  return out;
}

export function decodeMailboxName(encoded: string): string {
  let out = "";
  let index = 0;

  while (index < encoded.length) {
    const char = encoded[index];
    if (char !== "&") {
      out += char;
      index += 1;
      continue;
    }

    const end = encoded.indexOf("-", index + 1);
    if (end === -1) {
      out += encoded.slice(index);
      break;
    }
    const chunk = encoded.slice(index + 1, end);
    out += chunk === "" ? "&" : decodeBase64Utf16(chunk);
    index = end + 1;
  }

  return out;
}

/**
 * Quotes a mailbox name for the wire. Credentials must not go through here —
 * modified UTF-7 applies to mailbox names only, and encoding a password changes it.
 * Use `imapQuote` for those.
 */
export function imapMailboxArg(name: string): string {
  return quoteString(encodeMailboxName(name));
}

function quoteString(value: string): string {
  return `"${value.replace(/([\\"])/g, "\\$1")}"`;
}

function base64Utf16(units: number[]): string {
  const bytes: number[] = [];
  for (const unit of units) {
    bytes.push((unit >> 8) & 0xff, unit & 0xff);
  }

  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = [bytes[i] ?? 0, bytes[i + 1] ?? 0, bytes[i + 2] ?? 0];
    const remaining = bytes.length - i;
    const triple = (chunk[0]! << 16) | (chunk[1]! << 8) | chunk[2]!;
    const quads = remaining >= 3 ? 4 : remaining + 1;
    for (let q = 0; q < quads; q++) {
      out += BASE64[(triple >> (18 - q * 6)) & 0x3f];
    }
  }
  return out;
}

function decodeBase64Utf16(chunk: string): string {
  const bits: number[] = [];
  for (const char of chunk) {
    const value = BASE64.indexOf(char);
    if (value === -1) continue;
    bits.push(value);
  }

  const bytes: number[] = [];
  let accumulator = 0;
  let held = 0;
  for (const value of bits) {
    accumulator = (accumulator << 6) | value;
    held += 6;
    if (held >= 8) {
      held -= 8;
      bytes.push((accumulator >> held) & 0xff);
    }
  }

  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
  }
  return out;
}

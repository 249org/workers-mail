/** RFC 7628 XOAUTH2 initial client response. */
export function encodeXoauth2(user: string, accessToken: string): string {
  const raw = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
  let binary = "";
  for (const byte of new TextEncoder().encode(raw)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Swap edgeport's IMAP LOGIN for AUTHENTICATE XOAUTH2 on the same tagged line. */
export function rewriteImapLogin(line: string, sasl: string): string {
  return line.replace(/^(\S+) LOGIN .+$/, `$1 AUTHENTICATE XOAUTH2 ${sasl}`);
}

/** Swap SMTP AUTH PLAIN for AUTH XOAUTH2. AUTH LOGIN is the fallback path. */
export function rewriteSmtpAuth(line: string, sasl: string): string {
  if (line.startsWith("AUTH PLAIN ") || line === "AUTH LOGIN") {
    return `AUTH XOAUTH2 ${sasl}`;
  }
  return line;
}

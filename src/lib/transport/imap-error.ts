/** Socket/command stalls from edgeport and IMAP hosts such as one.com. */
export function isImapTimeout(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /timed out|timeout/i.test(text);
}

/** Turns a wire error into the sentence we show next to Sync. */
export function describeImapError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (isImapTimeout(text)) {
    return "The mail server took too long to respond. Sync will try again.";
  }
  return text;
}

/** CREATE NO text → a short sentence for the folder form. */
export function folderCreateRejected(serverText?: string): string {
  if (!serverText) return "The mail server did not accept that folder name.";
  const text = serverText.replace(/^\[.*?\]\s*/, "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (/already exist/.test(lower)) return "A folder with that name already exists on the mail server.";
  if (text.length > 0 && text.length < 90 && /^[\x20-\x7e]+$/.test(text)) {
    return `The mail server rejected that folder (${text}).`;
  }
  return "The mail server did not accept that folder name.";
}

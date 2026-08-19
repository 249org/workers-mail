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

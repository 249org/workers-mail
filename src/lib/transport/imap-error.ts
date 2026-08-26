import { providerAuthNoteForHost } from "./presets";

/** Socket/command stalls from edgeport and IMAP hosts such as one.com. */
export function isImapTimeout(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /timed out|timeout/i.test(text);
}

/** A rejected LOGIN, as opposed to a network or protocol failure. */
export function isImapAuthFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /login rejected|authenticationfailed|invalid credentials|auth(entication)? failed/i.test(
    text,
  );
}

/**
 * Turns a wire error into the sentence shown next to Sync.
 *
 * A rejected login on Gmail or Microsoft is almost never a mistyped password: both
 * stopped accepting account passwords over IMAP, so the useful thing to say is that
 * an app password is required.
 */
export function describeImapError(error: unknown, imapHost?: string | null): string {
  const text = error instanceof Error ? error.message : String(error);
  if (isImapTimeout(text)) {
    return "The mail server took too long to respond. Sync will try again.";
  }
  if (isImapAuthFailure(text)) {
    const note = providerAuthNoteForHost(imapHost);
    if (note?.kind === "app-password") {
      return `${note.label} rejected the sign-in. It no longer accepts your account password over IMAP — create an app password at ${note.href} and reconnect this mailbox.`;
    }
    if (note?.kind === "oauth-only") {
      return `${note.label} no longer accepts any password over IMAP. Reconnect this mailbox with one-click ${note.label} sign-in.`;
    }
    return "The mail server rejected the sign-in. Check the address and password, and whether the account needs an app password.";
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

import type { Folder } from "@/lib/mail/mailboxes";
import type { MailboxEntry } from "./imap-commands";

const SPECIAL_FOLDERS: Array<{ match: RegExp; role: Folder["role"]; name: string }> = [
  { match: /^inbox$/i, role: "inbox", name: "Inbox" },
  { match: /sent/i, role: "sent", name: "Sent" },
  { match: /draft/i, role: "drafts", name: "Drafts" },
  { match: /(trash|deleted)/i, role: "trash", name: "Trash" },
  { match: /(archive|all mail)/i, role: "archive", name: "Archive" },
];

/*
 * SPECIAL-USE (RFC 6154) names the same folders without depending on the server's
 * language. Matching on the path alone filed a UK Gmail's `[Gmail]/Bin` as an ordinary
 * folder, so the mailbox kept an empty Trash that pointed nowhere and nothing could be
 * deleted for good. The attributes are checked first and the names are the fallback.
 */
const SPECIAL_USE_ROLES: Array<{ attribute: string; role: Folder["role"]; name: string }> = [
  { attribute: "sent", role: "sent", name: "Sent" },
  { attribute: "drafts", role: "drafts", name: "Drafts" },
  { attribute: "trash", role: "trash", name: "Trash" },
  { attribute: "archive", role: "archive", name: "Archive" },
  { attribute: "all", role: "archive", name: "Archive" },
];

export function roleForMailbox(entry: MailboxEntry): { role: Folder["role"]; name: string } | null {
  if (/^inbox$/i.test(entry.path)) return { role: "inbox", name: "Inbox" };

  const attributes = new Set(entry.attributes);
  const special = SPECIAL_USE_ROLES.find((candidate) => attributes.has(candidate.attribute));
  if (special) return { role: special.role, name: special.name };

  // Split on the hierarchy separator only. Treating "." as one too renamed the
  // Gmail folder "Unroll.me" to "me" and hid which mailbox it really was.
  const leaf = entry.path.split("/").pop() || entry.path;
  const named = SPECIAL_FOLDERS.find(
    (candidate) => candidate.match.test(entry.path) || candidate.match.test(leaf),
  );
  return named ? { role: named.role, name: named.name } : null;
}

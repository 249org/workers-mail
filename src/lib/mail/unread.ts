/*
 * What the badge on the tab icon counts: unread mail in the inbox of the mailbox on
 * screen. The same number the sidebar puts next to Inbox, so the tab can always be
 * checked against the window.
 *
 * Totalling every folder was wrong twice over. Gmail serves its labels as folders, and
 * All Mail and Important hold the same messages the inbox does — one account's ninety
 * unread were counted three times. And trash, drafts and junk show a size rather than a
 * count of unread, so a trash holding a hundred read messages announced a hundred.
 */

/** Highest number drawn in full; past it the badge says there are more. */
export const BADGE_CEILING = 99;

export function inboxUnread(folders: Array<{ role: string; unread: number }>): number {
  const inbox = folders.find((folder) => folder.role === "inbox");
  return Math.max(0, inbox?.unread ?? 0);
}

/** What the badge reads, or an empty string when there is nothing to show. */
export function badgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count > BADGE_CEILING) return `${BADGE_CEILING}+`;
  return String(Math.floor(count));
}

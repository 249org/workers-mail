/*
 * What counts as mail waiting to be read, for the badge on the tab icon.
 *
 * Not every unread row is news. Drafts are unread by definition, sent mail is nobody's
 * to read, and trash and junk are where things go precisely so they stop asking for
 * attention — the sidebar already shows those as a size rather than a count of unread.
 */
export const SILENT_ROLES = ["trash", "drafts", "junk", "sent"] as const;

const silent: ReadonlySet<string> = new Set(SILENT_ROLES);

/** Highest number drawn in full; past it the badge says there are more. */
export const BADGE_CEILING = 99;

export function countsTowardsBadge(role: string): boolean {
  return !silent.has(role);
}

/**
 * Totals the folders of one mailbox as the sidebar holds them.
 *
 * The sidebar's number is a count of unread for most folders and a count of everything
 * for the few where unread means nothing, so the roles left out here are the same ones
 * whose number would otherwise be a size.
 */
export function unreadBadgeTotal(folders: Array<{ role: string; unread: number }>): number {
  return folders.reduce(
    (total, folder) => (countsTowardsBadge(folder.role) ? total + Math.max(0, folder.unread) : total),
    0,
  );
}

/** What the badge reads, or an empty string when there is nothing to show. */
export function badgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count > BADGE_CEILING) return `${BADGE_CEILING}+`;
  return String(Math.floor(count));
}

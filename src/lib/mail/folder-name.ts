export const SYSTEM_FOLDER_ROLES = ["inbox", "sent", "drafts", "archive", "trash"] as const;

const RESERVED_NAMES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "archive",
  "spam",
  "junk",
]);

export function isSystemFolderRole(role: string): boolean {
  return (SYSTEM_FOLDER_ROLES as readonly string[]).includes(role);
}

export function partitionFolders<T extends { role: string }>(folders: T[]): {
  system: T[];
  custom: T[];
} {
  const order = new Map<string, number>(SYSTEM_FOLDER_ROLES.map((role, index) => [role, index]));
  const system = folders
    .filter((folder) => isSystemFolderRole(folder.role))
    .sort((a, b) => (order.get(a.role) ?? 99) - (order.get(b.role) ?? 99));
  const custom = folders.filter((folder) => !isSystemFolderRole(folder.role));
  return { system, custom };
}

export type FolderNameResult = { ok: true; name: string } | { ok: false; error: string };

/** Trims and rejects names that would collide with IMAP specials or the system rail. */
export function parseFolderName(raw: string): FolderNameResult {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Enter a folder name." };
  if (name.length > 64) return { ok: false, error: "Keep the name under 64 characters." };
  if (/[\x00-\x1f\\"]/.test(name)) {
    return { ok: false, error: "That name contains characters the mail server cannot store." };
  }
  if (/^[/.]/.test(name) || /[/]$/.test(name)) {
    return { ok: false, error: "The name cannot start or end with a path separator." };
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return { ok: false, error: `${name} is already a system folder.` };
  }
  return { ok: true, name };
}

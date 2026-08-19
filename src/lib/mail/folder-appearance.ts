import type { IconName } from "@/components/mail/icons";

/** The icons offered in the picker, in the order they are laid out. */
export const FOLDER_ICONS = [
  "folder",
  "tag",
  "flag",
  "bookmark",
  "star",
  "pin",
  "bell",
  "briefcase",
  "receipt",
  "card",
  "cart",
  "gift",
  "plane",
  "home",
  "calendar",
  "users",
  "heart",
  "coffee",
  "code",
  "chart",
  "bulb",
  "lock",
] as const satisfies readonly IconName[];

export type FolderIcon = (typeof FOLDER_ICONS)[number];

/**
 * Colours are stored as token names rather than hex, so a folder picked in light mode
 * still reads correctly in dark mode — the token resolves per theme.
 */
export const FOLDER_COLORS = [
  "default",
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type FolderColor = (typeof FOLDER_COLORS)[number];

export function isFolderIcon(value: string | null | undefined): value is FolderIcon {
  return Boolean(value) && (FOLDER_ICONS as readonly string[]).includes(value as string);
}

export function isFolderColor(value: string | null | undefined): value is FolderColor {
  return Boolean(value) && (FOLDER_COLORS as readonly string[]).includes(value as string);
}

/** CSS colour for a stored token, or null to inherit the surrounding text colour. */
export function folderColorVar(color: string | null | undefined): string | null {
  if (!isFolderColor(color) || color === "default") return null;
  return `var(--folder-${color})`;
}

export const FOLDER_COLOR_LABELS: Record<FolderColor, string> = {
  default: "Default",
  red: "Red",
  amber: "Amber",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
};

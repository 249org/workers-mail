export type Scope = "global" | "list" | "reader" | "modal";

export type ShortcutAction =
  | "compose"
  | "palette"
  | "search"
  | "help"
  | "undo"
  | "next"
  | "previous"
  | "open"
  | "back"
  | "archive"
  | "trash"
  | "star"
  | "unread"
  | "select"
  | "selectAll"
  | "reply"
  | "replyAll"
  | "forward"
  | "send"
  | "syncNow"
  | "goInbox"
  | "goStarred"
  | "goSent"
  | "goDrafts"
  | "goArchive"
  | "goSettings"
  | "toggleSidebar"
  | "toggleList";

export type Shortcut = {
  action: ShortcutAction;
  /** Key combos in `mod+k` form, or a `g i` sequence separated by a space. */
  keys: string[];
  label: string;
  group: "Navigation" | "Actions" | "Compose" | "Jump to" | "Application";
  scope: Scope;
  /** Allow the binding to fire while a text field has focus. */
  worksWhileTyping?: boolean;
};

/**
 * The single source of truth for bindings. Both the dispatcher and the `?` cheat
 * sheet read this list, so they cannot drift apart.
 */
export const SHORTCUTS: Shortcut[] = [
  { action: "palette", keys: ["mod+k"], label: "Command palette", group: "Application", scope: "global", worksWhileTyping: true },
  { action: "search", keys: ["/"], label: "Search", group: "Application", scope: "global" },
  { action: "help", keys: ["?"], label: "Keyboard shortcuts", group: "Application", scope: "global" },
  { action: "undo", keys: ["mod+z"], label: "Undo last action", group: "Application", scope: "global" },
  { action: "syncNow", keys: ["shift+r"], label: "Sync now", group: "Application", scope: "global" },

  { action: "next", keys: ["j", "arrowdown"], label: "Next message", group: "Navigation", scope: "list" },
  { action: "previous", keys: ["k", "arrowup"], label: "Previous message", group: "Navigation", scope: "list" },
  { action: "open", keys: ["enter", "o"], label: "Read full width", group: "Navigation", scope: "list" },
  { action: "back", keys: ["escape"], label: "Close or go back", group: "Navigation", scope: "global", worksWhileTyping: true },
  { action: "toggleSidebar", keys: ["["], label: "Collapse folder sidebar", group: "Navigation", scope: "global" },
  { action: "toggleList", keys: ["]"], label: "Read full width", group: "Navigation", scope: "global" },

  { action: "archive", keys: ["e"], label: "Archive", group: "Actions", scope: "list" },
  { action: "trash", keys: ["#", "backspace"], label: "Move to trash", group: "Actions", scope: "list" },
  { action: "star", keys: ["s"], label: "Star", group: "Actions", scope: "list" },
  { action: "unread", keys: ["u"], label: "Mark unread", group: "Actions", scope: "list" },
  { action: "select", keys: ["x"], label: "Select message", group: "Actions", scope: "list" },
  { action: "selectAll", keys: ["shift+a"], label: "Select all", group: "Actions", scope: "list" },

  { action: "compose", keys: ["c"], label: "Compose", group: "Compose", scope: "global" },
  { action: "reply", keys: ["r"], label: "Reply", group: "Compose", scope: "reader" },
  { action: "replyAll", keys: ["a"], label: "Reply all", group: "Compose", scope: "reader" },
  { action: "forward", keys: ["f"], label: "Forward", group: "Compose", scope: "reader" },
  { action: "send", keys: ["mod+enter"], label: "Send", group: "Compose", scope: "modal", worksWhileTyping: true },

  { action: "goInbox", keys: ["g i"], label: "Inbox", group: "Jump to", scope: "global" },
  { action: "goStarred", keys: ["g s"], label: "Starred", group: "Jump to", scope: "global" },
  { action: "goSent", keys: ["g t"], label: "Sent", group: "Jump to", scope: "global" },
  { action: "goDrafts", keys: ["g d"], label: "Drafts", group: "Jump to", scope: "global" },
  { action: "goArchive", keys: ["g a"], label: "Archive", group: "Jump to", scope: "global" },
  { action: "goSettings", keys: ["g ,"], label: "Settings", group: "Jump to", scope: "global" },
];

export const SHORTCUT_GROUPS = [
  "Navigation",
  "Actions",
  "Compose",
  "Jump to",
  "Application",
] as const;

/** Renders a combo for display, using platform-appropriate modifier glyphs. */
export function formatKeys(combo: string, isMac: boolean): string[] {
  if (combo.includes(" ")) return combo.split(" ").map((key) => key.toUpperCase());

  return combo.split("+").map((part) => {
    switch (part) {
      case "mod":
        return isMac ? "⌘" : "Ctrl";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "enter":
        return "↵";
      case "escape":
        return "Esc";
      case "arrowup":
        return "↑";
      case "arrowdown":
        return "↓";
      case "backspace":
        return "⌫";
      default:
        return part.toUpperCase();
    }
  });
}

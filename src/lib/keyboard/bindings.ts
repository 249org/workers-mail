import { SHORTCUTS, type Shortcut, type ShortcutAction } from "./shortcuts";

export type ShortcutOverrides = Partial<Record<ShortcutAction, string[]>>;

const ACTION_SET = new Set<string>(SHORTCUTS.map((shortcut) => shortcut.action));

/** Defaults stay in SHORTCUTS. The dispatcher reads this live list. */
let activeShortcuts: Shortcut[] = SHORTCUTS;

export function getActiveShortcuts(): Shortcut[] {
  return activeShortcuts;
}

export function setActiveShortcuts(shortcuts: Shortcut[]): void {
  activeShortcuts = shortcuts;
}

export function defaultKeys(action: ShortcutAction): string[] {
  return SHORTCUTS.find((shortcut) => shortcut.action === action)?.keys ?? [];
}

export function resolveShortcuts(overrides: ShortcutOverrides = {}): Shortcut[] {
  return SHORTCUTS.map((shortcut) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, shortcut.action)) {
      return shortcut;
    }
    return { ...shortcut, keys: overrides[shortcut.action] ?? [] };
  });
}

export function parseOverrides(raw: unknown): ShortcutOverrides {
  if (!raw || typeof raw !== "object") return {};
  const next: ShortcutOverrides = {};
  for (const [action, keys] of Object.entries(raw as Record<string, unknown>)) {
    if (!ACTION_SET.has(action) || !Array.isArray(keys)) continue;
    next[action as ShortcutAction] = keys.filter(
      (combo): combo is string => typeof combo === "string" && isValidCombo(combo),
    );
  }
  return next;
}

export function isValidCombo(combo: string): boolean {
  if (!combo || combo.length > 40) return false;
  const parts = combo.split(" ");
  if (parts.length < 1 || parts.length > 2) return false;
  return parts.every(isValidChord);
}

function isValidChord(chord: string): boolean {
  const tokens = chord.split("+").filter(Boolean);
  if (tokens.length === 0) return false;
  const key = tokens[tokens.length - 1];
  if (!key || key === "shift" || key === "mod" || key === "alt" || key === "tab") return false;
  return tokens.slice(0, -1).every((mod) => mod === "mod" || mod === "alt" || mod === "shift");
}

/** Exact match, or a sequence prefix colliding with a single key. */
export function combosOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const aParts = a.split(" ");
  const bParts = b.split(" ");
  if (aParts.length === 2 && bParts.length === 1) return aParts[0] === b;
  if (bParts.length === 2 && aParts.length === 1) return bParts[0] === a;
  return false;
}

export function findConflicts(
  combo: string,
  action: ShortcutAction,
  shortcuts: Shortcut[] = getActiveShortcuts(),
): Shortcut[] {
  return shortcuts.filter(
    (shortcut) =>
      shortcut.action !== action && shortcut.keys.some((keys) => combosOverlap(keys, combo)),
  );
}

/** Bind `combo` to `action`. Overlapping keys on other actions are removed. `null` unbinds. */
export function assignBinding(
  overrides: ShortcutOverrides,
  action: ShortcutAction,
  combo: string | null,
): ShortcutOverrides {
  const next: ShortcutOverrides = { ...overrides };
  const resolved = resolveShortcuts(next);

  if (combo === null) {
    next[action] = [];
    return next;
  }

  for (const conflict of findConflicts(combo, action, resolved)) {
    next[conflict.action] = conflict.keys.filter((keys) => !combosOverlap(keys, combo));
  }
  next[action] = [combo];
  return next;
}

export function resetBinding(
  overrides: ShortcutOverrides,
  action: ShortcutAction,
): ShortcutOverrides {
  const next: ShortcutOverrides = { ...overrides };
  delete next[action];
  const restored = defaultKeys(action);
  let resolved = resolveShortcuts(next);
  for (const combo of restored) {
    for (const conflict of findConflicts(combo, action, resolved)) {
      next[conflict.action] = (next[conflict.action] ?? conflict.keys).filter(
        (keys) => !combosOverlap(keys, combo),
      );
    }
    resolved = resolveShortcuts(next);
  }
  return next;
}

export function isCustomized(overrides: ShortcutOverrides, action: ShortcutAction): boolean {
  if (!Object.prototype.hasOwnProperty.call(overrides, action)) return false;
  const keys = overrides[action] ?? [];
  return keys.join("\0") !== defaultKeys(action).join("\0");
}

export function primaryCombo(
  action: ShortcutAction,
  shortcuts: Shortcut[] = getActiveShortcuts(),
): string | null {
  return shortcuts.find((shortcut) => shortcut.action === action)?.keys[0] ?? null;
}

export function hasOverrides(overrides: ShortcutOverrides): boolean {
  return Object.keys(overrides).length > 0;
}

"use client";

import { create } from "zustand";
import { SHORTCUTS, type Shortcut, type ShortcutAction } from "./shortcuts";
import {
  assignBinding,
  getActiveShortcuts,
  parseOverrides,
  resetBinding,
  resolveShortcuts,
  setActiveShortcuts,
  type ShortcutOverrides,
} from "./bindings";

export const SHORTCUTS_STORAGE_KEY = "workers-mail.shortcuts";

type State = {
  overrides: ShortcutOverrides;
  shortcuts: Shortcut[];
  ready: boolean;
  hydrate: () => Promise<void>;
  assign: (action: ShortcutAction, combo: string | null) => void;
  resetAction: (action: ShortcutAction) => void;
  resetAll: () => void;
};

let inflight: Promise<void> | null = null;

function persist(overrides: ShortcutOverrides): void {
  const shortcuts = resolveShortcuts(overrides);
  setActiveShortcuts(shortcuts);
  try {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Private mode can refuse storage; the API still holds the choice.
  }
  void fetch("/api/shortcuts", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overrides }),
  });
}

function apply(overrides: ShortcutOverrides): Pick<State, "overrides" | "shortcuts"> {
  const shortcuts = resolveShortcuts(overrides);
  setActiveShortcuts(shortcuts);
  return { overrides, shortcuts };
}

function readLocal(): ShortcutOverrides {
  try {
    return parseOverrides(JSON.parse(localStorage.getItem(SHORTCUTS_STORAGE_KEY) ?? ""));
  } catch {
    return {};
  }
}

export const useShortcutStore = create<State>((set) => ({
  overrides: {},
  shortcuts: SHORTCUTS,
  ready: false,

  hydrate: async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      const local = readLocal();
      set({ ...apply(local) });

      try {
        const response = await fetch("/api/shortcuts");
        if (response.ok) {
          const payload = (await response.json()) as { overrides?: unknown };
          const remote = parseOverrides(payload.overrides);
          if (Object.keys(remote).length === 0 && Object.keys(local).length > 0) {
            persist(local);
            set({ ...apply(local), ready: true });
            return;
          }
          try {
            localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(remote));
          } catch {
            /* ignore */
          }
          set({ ...apply(remote), ready: true });
          return;
        }
      } catch {
        // Offline or unauthenticated; local bindings still apply.
      } finally {
        set({ ready: true });
      }
    })();
    return inflight;
  },

  assign: (action, combo) => {
    const overrides = assignBinding(useShortcutStore.getState().overrides, action, combo);
    persist(overrides);
    set(apply(overrides));
  },

  resetAction: (action) => {
    const overrides = resetBinding(useShortcutStore.getState().overrides, action);
    persist(overrides);
    set(apply(overrides));
  },

  resetAll: () => {
    persist({});
    set(apply({}));
  },
}));

export { getActiveShortcuts };

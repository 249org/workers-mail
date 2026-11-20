"use client";

import { create } from "zustand";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  parseAppearance,
  persistAppearanceLocal,
  sameTheme,
  serializeAppearance,
  APPEARANCE_COOKIE,
  type Appearance,
} from "@/lib/appearance";

type State = {
  prefs: Appearance;
  ready: boolean;
  hydrate: () => Promise<void>;
  setPrefs: (prefs: Appearance) => void;
};

let inflight: Promise<void> | null = null;

function fromCookie(): Appearance {
  const match = document.cookie.match(new RegExp(`(?:^|; )${APPEARANCE_COOKIE}=([^;]*)`));
  return parseAppearance(match?.[1]);
}

function save(prefs: Appearance): void {
  void fetch("/api/appearance", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: serializeAppearance(prefs) }),
  });
}

export const useAppearanceStore = create<State>((set, get) => ({
  prefs: DEFAULT_APPEARANCE,
  ready: false,

  /*
   * The cookie is what this browser painted with. The account's saved choice wins over
   * it, so picking a theme on one machine carries to the next one signed in.
   */
  hydrate: async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      const local = fromCookie();
      set({ prefs: local });

      try {
        const response = await fetch("/api/appearance");
        if (response.ok) {
          const payload = (await response.json()) as { value?: string | null };
          if (payload.value) {
            const saved = parseAppearance(payload.value);
            applyAppearance(saved);
            persistAppearanceLocal(saved);
            set({ prefs: saved });
            return;
          }
        }
        save(local);
      } catch {
        // Offline or signed out; what the cookie says still applies.
      } finally {
        set({ ready: true });
      }
    })();
    return inflight;
  },

  setPrefs: (prefs) => {
    const current = get().prefs;
    if (sameTheme(current.theme, prefs.theme) && current.nav === prefs.nav) return;
    applyAppearance(prefs);
    persistAppearanceLocal(prefs);
    set({ prefs });
    save(prefs);
  },
}));

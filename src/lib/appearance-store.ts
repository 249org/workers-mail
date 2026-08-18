"use client";

import { create } from "zustand";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  persistAppearanceLocal,
  readStoredAppearance,
  type AppearancePrefs,
} from "@/lib/appearance";

type State = {
  prefs: AppearancePrefs;
  ready: boolean;
  hydrate: () => Promise<void>;
  setPrefs: (prefs: AppearancePrefs) => void;
};

let inflight: Promise<void> | null = null;

export const useAppearanceStore = create<State>((set, get) => ({
  prefs: DEFAULT_APPEARANCE,
  ready: false,

  hydrate: async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      const local = readStoredAppearance();
      applyAppearance(local);
      set({ prefs: local });

      try {
        const response = await fetch("/api/appearance");
        if (response.ok) {
          const payload = (await response.json()) as { prefs?: AppearancePrefs | null };
          if (payload.prefs) {
            applyAppearance(payload.prefs);
            persistAppearanceLocal(payload.prefs);
            set({ prefs: payload.prefs, ready: true });
            return;
          }
        }
        persistAppearanceLocal(local);
        void fetch("/api/appearance", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(local),
        });
      } catch {
        // Offline or unauthenticated; local prefs still apply.
      } finally {
        set({ ready: true });
      }
    })();
    return inflight;
  },

  setPrefs: (prefs) => {
    if (get().prefs.palette === prefs.palette && get().prefs.scheme === prefs.scheme) return;
    applyAppearance(prefs);
    persistAppearanceLocal(prefs);
    set({ prefs });
    void fetch("/api/appearance", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(prefs),
    });
  },
}));

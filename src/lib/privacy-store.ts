"use client";

import { create } from "zustand";
import { DEFAULT_PRIVACY, parsePrivacy, type PrivacyPrefs } from "@/lib/privacy";

const STORAGE_KEY = "wm-privacy";

type State = {
  prefs: PrivacyPrefs;
  ready: boolean;
  hydrate: () => Promise<void>;
  setPrefs: (prefs: PrivacyPrefs) => void;
};

function readLocal(): PrivacyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parsePrivacy(JSON.parse(raw)) : { ...DEFAULT_PRIVACY };
  } catch {
    return { ...DEFAULT_PRIVACY };
  }
}

let inflight: Promise<void> | null = null;

export const usePrivacyStore = create<State>((set, get) => ({
  prefs: DEFAULT_PRIVACY,
  ready: false,

  hydrate: async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      if (typeof window !== "undefined") set({ prefs: readLocal() });
      try {
        const response = await fetch("/api/privacy");
        if (!response.ok) {
          set({ ready: true });
          return;
        }
        const payload = (await response.json()) as { prefs?: PrivacyPrefs };
        const prefs = parsePrivacy(payload.prefs);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        set({ prefs, ready: true });
      } catch {
        set({ ready: true });
      }
    })();
    return inflight;
  },

  setPrefs: (prefs) => {
    const current = get().prefs;
    if (
      current.remoteImages === prefs.remoteImages &&
      current.collectContacts === prefs.collectContacts
    ) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    set({ prefs });
    void fetch("/api/privacy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
  },
}));

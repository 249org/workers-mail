"use client";

import { create } from "zustand";
import { DEFAULT_SIGNATURE, parseSignature, type SignaturePrefs } from "@/lib/signature";

const STORAGE_KEY = "wm-signature";

type State = {
  prefs: SignaturePrefs;
  ready: boolean;
  hydrate: () => Promise<void>;
  setPrefs: (prefs: SignaturePrefs) => void;
};

function readLocal(): SignaturePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseSignature(JSON.parse(raw)) : { ...DEFAULT_SIGNATURE, byMailbox: {} };
  } catch {
    return { ...DEFAULT_SIGNATURE, byMailbox: {} };
  }
}

let inflight: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useSignatureStore = create<State>((set, get) => ({
  prefs: { ...DEFAULT_SIGNATURE, byMailbox: {} },
  ready: false,

  hydrate: async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      if (typeof window !== "undefined") set({ prefs: readLocal() });
      try {
        const response = await fetch("/api/signature");
        if (!response.ok) {
          set({ ready: true });
          return;
        }
        const payload = (await response.json()) as { prefs?: unknown };
        const prefs = parseSignature(payload.prefs);
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
    if (JSON.stringify(current) === JSON.stringify(prefs)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    set({ prefs });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void fetch("/api/signature", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefs }),
      });
    }, 400);
  },
}));

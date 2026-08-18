"use client";

import { create } from "zustand";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import type { PaletteCommand } from "@/components/palette/command-palette";

type State = {
  open: boolean;
  query: string;
  mailbox: PublicMailbox | null;
  extras: PaletteCommand[];
  helpOpen: boolean;
  openPalette: (query?: string) => void;
  closePalette: () => void;
  setMailbox: (mailbox: PublicMailbox | null) => void;
  setExtras: (extras: PaletteCommand[]) => void;
  setHelpOpen: (open: boolean) => void;
};

export const usePaletteStore = create<State>((set) => ({
  open: false,
  query: "",
  mailbox: null,
  extras: [],
  helpOpen: false,
  openPalette: (query = "") => set({ open: true, query }),
  closePalette: () => set({ open: false, query: "" }),
  setMailbox: (mailbox) => set({ mailbox }),
  setExtras: (extras) => set({ extras }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));

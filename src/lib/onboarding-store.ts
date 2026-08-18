"use client";

import { create } from "zustand";

type State = {
  open: boolean;
  openTour: () => void;
  closeTour: () => void;
};

export const useOnboardingStore = create<State>((set) => ({
  open: false,
  openTour: () => set({ open: true }),
  closeTour: () => set({ open: false }),
}));

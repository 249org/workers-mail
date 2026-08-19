"use client";

import { create } from "zustand";
import { markTutorialSeen } from "@/lib/onboarding";

type State = {
  open: boolean;
  openTour: () => void;
  closeTour: () => void;
};

export const useOnboardingStore = create<State>((set) => ({
  open: false,
  openTour: () => set({ open: true }),
  closeTour: () => {
    markTutorialSeen();
    set({ open: false });
  },
}));

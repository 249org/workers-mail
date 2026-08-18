import { create } from "zustand";

type SettingsViewState = {
  view: string | null;
  prepare: (href: string) => void;
  sync: (pathname: string) => void;
};

export const useSettingsViewStore = create<SettingsViewState>((set) => ({
  view: null,
  prepare: (href) => set({ view: href.split("?")[0] }),
  sync: (pathname) => set({ view: pathname }),
}));

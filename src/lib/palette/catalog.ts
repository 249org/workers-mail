"use client";

import {
  NAV_LAYOUTS,
  PRESET_IDS,
  PRESET_NAMES,
  SYSTEM_DARK,
  SYSTEM_LIGHT,
  isLight,
  paletteOf,
  type Appearance,
} from "@/lib/appearance";
import type { PaletteCommand } from "@/components/palette/command-palette";
import { SETTINGS_PAGES } from "@/components/settings/settings-nav";
import { useSettingsViewStore } from "@/components/settings/settings-view-store";
import { usePaletteStore } from "@/lib/palette/store";
import { useOnboardingStore } from "@/lib/onboarding-store";

export function appearanceCommands(
  prefs: Appearance,
  setPrefs: (prefs: Appearance) => void,
): PaletteCommand[] {
  // The toggle lands on the system pair, so a dark custom theme flips to a light one.
  const dark = resolvedDark(prefs);
  const toggleTo = dark ? SYSTEM_LIGHT : SYSTEM_DARK;
  const activePreset = prefs.theme.kind === "preset" ? prefs.theme.id : null;

  const modes: PaletteCommand[] = [
    {
      id: "scheme-toggle",
      label: dark ? "Switch to light mode" : "Switch to dark mode",
      group: "Appearance",
      keywords: ["theme", "night", "day", "colour", "color", "appearance", "toggle"],
      run: () => setPrefs({ ...prefs, theme: { kind: "preset", id: toggleTo } }),
    },
    {
      id: "scheme-system",
      label: "Use system appearance",
      group: "Appearance",
      keywords: ["theme", "device", "os", "automatic", "colour", "color"],
      suffix: prefs.theme.kind === "system" ? "On" : undefined,
      run: () => setPrefs({ ...prefs, theme: { kind: "system" } }),
    },
  ];

  const themes: PaletteCommand[] = PRESET_IDS.map((id) => ({
    id: `theme-${id}`,
    label: `${PRESET_NAMES[id]} theme`,
    group: "Appearance",
    keywords: ["theme", "palette", "colour", "color", id],
    suffix: activePreset === id ? "On" : undefined,
    run: () => setPrefs({ ...prefs, theme: { kind: "preset", id } }),
  }));

  const layouts: PaletteCommand[] = NAV_LAYOUTS.map((nav) => ({
    id: `nav-${nav}`,
    label: nav === "floating" ? "Floating layout" : "Default layout",
    group: "Appearance",
    keywords: ["layout", "sidebar", "panels", "navigation", nav],
    suffix: prefs.nav === nav ? "On" : undefined,
    run: () => setPrefs({ ...prefs, nav }),
  }));

  return [...modes, ...themes, ...layouts];
}

export function settingsCommands(
  navigate: (href: string) => void,
  signOut: () => void,
): PaletteCommand[] {
  const pages: PaletteCommand[] = SETTINGS_PAGES.map((page) => ({
    id: `settings-${page.href}`,
    label: page.command,
    group: "Settings",
    keywords: ["settings", "preferences", ...page.keywords],
    run: () => {
      useSettingsViewStore.getState().prepare(page.href);
      navigate(page.href);
    },
  }));

  return [
    ...pages,
    {
      id: "go-mail",
      label: "Back to mail",
      group: "Settings",
      keywords: ["inbox", "mailbox", "home"],
      run: () => navigate("/mail"),
    },
    {
      id: "help",
      label: "Keyboard shortcuts",
      hint: "?",
      group: "Application",
      keywords: ["hotkeys", "cheatsheet", "bindings"],
      run: () => usePaletteStore.getState().setHelpOpen(true),
    },
    {
      id: "tour",
      label: "Show keyboard tour",
      group: "Application",
      keywords: ["tutorial", "onboarding", "help", "learn"],
      run: () => useOnboardingStore.getState().openTour(),
    },
    {
      id: "signout",
      label: "Sign out",
      group: "Application",
      keywords: ["logout", "exit", "account"],
      run: signOut,
    },
  ];
}

function resolvedDark(prefs: Appearance): boolean {
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return !isLight(paletteOf(prefs.theme, prefersDark).background);
}

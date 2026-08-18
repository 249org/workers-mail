"use client";

import {
  PALETTES,
  SCHEMES,
  type AppearancePrefs,
  type PaletteId,
  type SchemeId,
} from "@/lib/appearance";
import type { PaletteCommand } from "@/components/palette/command-palette";
import { SETTINGS_PAGES } from "@/components/settings/settings-nav";
import { useSettingsViewStore } from "@/components/settings/settings-view-store";
import { usePaletteStore } from "@/lib/palette/store";
import { useOnboardingStore } from "@/lib/onboarding-store";

export function appearanceCommands(
  prefs: AppearancePrefs,
  setPrefs: (prefs: AppearancePrefs) => void,
): PaletteCommand[] {
  const resolved = resolvedScheme(prefs.scheme);
  const toggleTo: SchemeId = resolved === "dark" ? "light" : "dark";

  const schemes: PaletteCommand[] = [
    {
      id: "scheme-toggle",
      label: toggleTo === "dark" ? "Switch to dark mode" : "Switch to light mode",
      group: "Appearance",
      keywords: ["theme", "night", "day", "colour", "color", "appearance", "toggle"],
      run: () => setPrefs({ ...prefs, scheme: toggleTo }),
    },
    ...SCHEMES.map((scheme) => ({
      id: `scheme-${scheme.id}`,
      label: scheme.id === "system" ? "Use system appearance" : `Use ${scheme.name.toLowerCase()} mode`,
      group: "Appearance",
      keywords: ["theme", "scheme", "colour", "color", scheme.name, scheme.id],
      suffix: prefs.scheme === scheme.id ? "On" : undefined,
      run: () => setPrefs({ ...prefs, scheme: scheme.id as SchemeId }),
    })),
  ];

  const palettes: PaletteCommand[] = PALETTES.map((palette) => ({
    id: `palette-${palette.id}`,
    label: `${palette.name} palette`,
    group: "Appearance",
    keywords: ["theme", "template", "colour", "color", palette.note, palette.id],
    suffix: prefs.palette === palette.id ? "On" : undefined,
    run: () => setPrefs({ ...prefs, palette: palette.id as PaletteId }),
  }));

  return [...schemes, ...palettes];
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

function resolvedScheme(scheme: SchemeId): "light" | "dark" {
  if (scheme === "light" || scheme === "dark") return scheme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { useAppearanceStore } from "@/lib/appearance-store";
import { usePrivacyStore } from "@/lib/privacy-store";
import { useSignatureStore } from "@/lib/signature-store";
import { appearanceCommands, settingsCommands } from "@/lib/palette/catalog";
import { usePaletteStore } from "@/lib/palette/store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { useShortcutStore } from "@/lib/keyboard/store";
import { CommandPalette } from "./command-palette";
import { ShortcutHelp } from "@/components/mail/shortcut-help";
import { OnboardingTour } from "@/components/mail/onboarding-tour";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { hasSeenTutorial } from "@/lib/onboarding";

let shownThisRuntime = false;

function closePalette() {
  usePaletteStore.getState().closePalette();
}

type Props = {
  mailboxes: PublicMailbox[];
};

export function CommandCenter({ mailboxes }: Props) {
  const router = useRouter();
  const open = usePaletteStore((state) => state.open);
  const query = usePaletteStore((state) => state.query);
  const mailbox = usePaletteStore((state) => state.mailbox);
  const extras = usePaletteStore((state) => state.extras);
  const helpOpen = usePaletteStore((state) => state.helpOpen);
  const tourOpen = useOnboardingStore((state) => state.open);
  const prefs = useAppearanceStore((state) => state.prefs);
  const setPrefs = useAppearanceStore((state) => state.setPrefs);
  const hydrateAppearance = useAppearanceStore((state) => state.hydrate);
  const hydrateShortcuts = useShortcutStore((state) => state.hydrate);
  const hydratePrivacy = usePrivacyStore((state) => state.hydrate);
  const hydrateSignature = useSignatureStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateAppearance();
    void hydrateShortcuts();
    void hydratePrivacy();
    void hydrateSignature();
  }, [hydrateAppearance, hydrateShortcuts, hydratePrivacy, hydrateSignature]);

  useEffect(() => {
    if (shownThisRuntime) return;
    shownThisRuntime = true;
    if (hasSeenTutorial()) return;
    useOnboardingStore.getState().openTour();
  }, []);

  useHotkeys("global", {
    palette: () => usePaletteStore.getState().openPalette(),
    help: () => usePaletteStore.getState().setHelpOpen(true),
  });

  const commands = useMemo(() => {
    const seen = new Set<string>();
    const merged = [
      ...appearanceCommands(prefs, setPrefs),
      ...settingsCommands((href) => router.push(href), async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }),
      ...extras,
    ];
    return merged.filter((command) => {
      if (seen.has(command.id)) return false;
      seen.add(command.id);
      return true;
    });
  }, [prefs, setPrefs, extras, router]);

  return (
    <>
      <CommandPalette
        open={open}
        initialQuery={query}
        mailbox={mailbox ?? mailboxes[0] ?? null}
        mailboxes={mailboxes}
        commands={commands}
        onClose={closePalette}
      />
      <ShortcutHelp
        open={helpOpen && !tourOpen}
        onClose={() => usePaletteStore.getState().setHelpOpen(false)}
      />
      <OnboardingTour open={tourOpen} onClose={() => useOnboardingStore.getState().closeTour()} />
    </>
  );
}

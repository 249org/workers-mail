"use client";

import { useEffect, useState } from "react";
import { KeyCaps, useIsMac } from "@/components/mail/key-caps";
import { primaryCombo } from "@/lib/keyboard/bindings";
import { useShortcutStore } from "@/lib/keyboard/store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import type { ShortcutAction } from "@/lib/keyboard/shortcuts";

type Focus = "all" | "folders" | "list" | "reader" | "command";

type Step = {
  title: string;
  body: string;
  focus: Focus;
  keys: ShortcutAction[];
};

const STEPS: Step[] = [
  {
    title: "A keyboard-first mailbox",
    body: "Folders, the list, and the message sit in three hairline panes. The work happens on the keys, not the chrome.",
    focus: "all",
    keys: [],
  },
  {
    title: "Move",
    body: "Walk the list, then open a message full width. Same motion as any mail client — just faster.",
    focus: "list",
    keys: ["next", "previous", "open"],
  },
  {
    title: "Act",
    body: "Archive, star, and compose without the mouse. These do not animate; they just happen.",
    focus: "list",
    keys: ["archive", "star", "compose"],
  },
  {
    title: "Command",
    body: "One surface for appearance, settings, and mail. Search when you already know what you want.",
    focus: "command",
    keys: ["palette", "search"],
  },
  {
    title: "Shape and jump",
    body: "Collapse the folder rail or hide the list so the reader fills the width. Jump to a folder with a two-key sequence. The cheat sheet is always one key away, and every binding can be reassigned in Settings → Shortcuts.",
    focus: "folders",
    keys: ["toggleSidebar", "toggleList", "goInbox", "help"],
  },
];

export function OnboardingTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMac = useIsMac();
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) {
      setMounted(false);
      setStep(0);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useHotkeys("modal", { back: onClose }, open);

  if (!open) return null;

  const current = STEPS[step] ?? STEPS[0];
  if (!current) return null;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <button
        type="button"
        aria-label="Skip tour"
        className="overlay-backdrop absolute inset-0 cursor-default"
        data-open={mounted}
        onClick={onClose}
      />

      <div
        className="overlay-panel panel relative w-full max-w-lg overflow-hidden"
        data-open={mounted}
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <span className="reg reg-tl" />
        <span className="reg reg-tr" />
        <span className="reg reg-bl" />
        <span className="reg reg-br" />

        <div className="px-6 pt-6">
          <WorkspaceSketch focus={current.focus} />
        </div>

        <div className="px-6 pt-5 pb-2">
          <h2 id="tour-title" className="page-title">
            {current.title}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{current.body}</p>

          {current.keys.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {current.keys.map((action) => {
                const shortcut = shortcuts.find((item) => item.action === action);
                const combo = primaryCombo(action, shortcuts);
                if (!shortcut) return null;
                return (
                  <li key={action} className="flex items-center justify-between gap-3">
                    <span className="text-[13px]">{shortcut.label}</span>
                    {combo ? <KeyCaps combo={combo} isMac={isMac} /> : (
                      <span className="text-[13px] text-muted-foreground">Unbound</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <footer className="mt-4 flex items-center justify-between gap-3 border-t border-border px-6 py-3">
          <div className="flex items-center gap-3">
            <ol className="tour-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((item, index) => (
                <li key={item.title}>
                  <button
                    type="button"
                    className="tour-dot"
                    data-on={index === step ? "true" : undefined}
                    aria-label={`Step ${index + 1}: ${item.title}`}
                    aria-current={index === step ? "step" : undefined}
                    onClick={() => setStep(index)}
                  />
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-quiet !h-8 !px-2" onClick={onClose}>
              Skip
            </button>
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (last) onClose();
                else setStep(step + 1);
              }}
            >
              {last ? "Start reading" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function WorkspaceSketch({ focus }: { focus: Focus }) {
  return (
    <div className="tour-sketch" aria-hidden>
      <div className="tour-sketch-bar" data-on={focus === "command" ? "true" : undefined} />
      <div className="tour-sketch-panes">
        <div data-on={focus === "all" || focus === "folders" ? "true" : undefined} />
        <div data-on={focus === "all" || focus === "list" ? "true" : undefined} />
        <div data-on={focus === "all" || focus === "reader" ? "true" : undefined} />
      </div>
    </div>
  );
}

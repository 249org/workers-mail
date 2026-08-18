"use client";

import { useEffect, useState } from "react";
import { SHORTCUT_GROUPS } from "@/lib/keyboard/shortcuts";
import { useShortcutStore } from "@/lib/keyboard/store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { KeyCaps, useIsMac } from "@/components/mail/key-caps";

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMac = useIsMac();
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) {
      setMounted(false);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useHotkeys("modal", { back: onClose }, open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <button
        type="button"
        aria-label="Close"
        className="overlay-backdrop absolute inset-0 cursor-default"
        data-open={mounted}
        onClick={onClose}
      />

      <div
        className="overlay-panel panel relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden"
        data-open={mounted}
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <span className="text-xs text-[var(--ink-faint)]">
            Press <span className="kbd">Esc</span> to close
          </span>
        </header>

        <div className="scroll-thin grid min-h-0 flex-1 gap-x-8 gap-y-5 overflow-y-auto p-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => {
            const rows = shortcuts.filter((shortcut) => shortcut.group === group);
            if (rows.length === 0) return null;

            return (
              <section key={group}>
                <h3 className="label">{group}</h3>
                <ul>
                  {rows.map((shortcut) => (
                    <li
                      key={shortcut.action}
                      className="flex items-center justify-between gap-4 py-1"
                    >
                      <span className="text-[13px] text-[var(--ink-muted)]">
                        {shortcut.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {shortcut.keys.length === 0 ? (
                          <span className="text-[13px] text-muted-foreground">Unbound</span>
                        ) : (
                          shortcut.keys.slice(0, 1).map((combo) => (
                            <KeyCaps key={combo} combo={combo} isMac={isMac} />
                          ))
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

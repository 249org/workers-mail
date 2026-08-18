"use client";

import { useEffect, useRef, useState } from "react";
import { SHORTCUT_GROUPS, type ShortcutAction } from "@/lib/keyboard/shortcuts";
import { hasOverrides, isCustomized } from "@/lib/keyboard/bindings";
import { useShortcutStore } from "@/lib/keyboard/store";
import { comboFromEvent, SEQUENCE_WINDOW_MS, setKeyCapture } from "@/lib/keyboard/use-hotkeys";
import { KeyCaps, useIsMac } from "@/components/mail/key-caps";
import { useOnboardingStore } from "@/lib/onboarding-store";

export function ShortcutsForm() {
  const isMac = useIsMac();
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const overrides = useShortcutStore((state) => state.overrides);
  const hydrate = useShortcutStore((state) => state.hydrate);
  const resetAction = useShortcutStore((state) => state.resetAction);
  const resetAll = useShortcutStore((state) => state.resetAll);
  const [listening, setListening] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted-foreground">
          Click a binding, then press the new keys. A two-key jump is{" "}
          <KeyCaps combo="g i" isMac={isMac} /> — press them in order. Backspace clears.
          Escape cancels.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => useOnboardingStore.getState().openTour()}
          >
            Show tour
          </button>
          {hasOverrides(overrides) ? (
            <button type="button" className="btn btn-ghost" onClick={resetAll}>
              Restore defaults
            </button>
          ) : null}
        </div>
      </div>

      {SHORTCUT_GROUPS.map((group) => {
        const rows = shortcuts.filter((shortcut) => shortcut.group === group);
        if (rows.length === 0) return null;

        return (
          <section key={group}>
            <h2 className="section-title">{group}</h2>
            <ul className="list-frame mt-3">
              {rows.map((shortcut) => {
                const combo = shortcut.keys[0] ?? null;
                const customized = isCustomized(overrides, shortcut.action);

                return (
                  <li key={shortcut.action} className="flex items-center justify-between gap-4 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-[13px]">{shortcut.label}</span>
                      {customized ? (
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">Changed</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {customized ? (
                        <button
                          type="button"
                          className="btn btn-quiet !h-8 !px-2"
                          onClick={() => resetAction(shortcut.action)}
                        >
                          Reset
                        </button>
                      ) : null}
                      <ShortcutRecorder
                        action={shortcut.action}
                        combo={combo}
                        isMac={isMac}
                        listening={listening === shortcut.action}
                        onListeningChange={setListening}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ShortcutRecorder({
  action,
  combo,
  isMac,
  listening,
  onListeningChange,
}: {
  action: ShortcutAction;
  combo: string | null;
  isMac: boolean;
  listening: boolean;
  onListeningChange: (action: ShortcutAction | null) => void;
}) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const listenRef = useRef(onListeningChange);
  listenRef.current = onListeningChange;
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) {
      pending.current = null;
      setPrefix(null);
      if (timer.current) clearTimeout(timer.current);
      setKeyCapture(null);
      return;
    }

    setKeyCapture((event) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape" && !pending.current) {
        listenRef.current(null);
        return true;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        if (pending.current) return true;
        useShortcutStore.getState().assign(actionRef.current, null);
        listenRef.current(null);
        return true;
      }

      const next = comboFromEvent(event);
      if (!next) return true;

      const commit = (combo: string) => {
        useShortcutStore.getState().assign(actionRef.current, combo);
        listenRef.current(null);
      };

      if (pending.current) {
        if (timer.current) clearTimeout(timer.current);
        commit(`${pending.current} ${next}`);
        return true;
      }

      const chord = next.includes("+") || next.length > 1;
      if (chord) {
        commit(next);
        return true;
      }

      pending.current = next;
      setPrefix(next);
      timer.current = setTimeout(() => commit(next), SEQUENCE_WINDOW_MS);
      return true;
    });

    return () => {
      setKeyCapture(null);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [listening]);

  return (
    <button
      type="button"
      className="shortcut-bind"
      data-listening={listening ? "true" : undefined}
      aria-label={listening ? "Press a key" : combo ? `Change shortcut ${combo}` : "Set shortcut"}
      onClick={() => onListeningChange(listening ? null : action)}
    >
      {listening ? (
        prefix ? (
          <span className="flex items-center gap-1">
            <KeyCaps combo={prefix} isMac={isMac} />
            <span className="text-[13px] text-muted-foreground">then…</span>
          </span>
        ) : (
          <span className="text-[13px] text-muted-foreground">Press a key</span>
        )
      ) : combo ? (
        <KeyCaps combo={combo} isMac={isMac} />
      ) : (
        <span className="text-[13px] text-muted-foreground">Unbound</span>
      )}
    </button>
  );
}

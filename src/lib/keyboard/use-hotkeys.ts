"use client";

import { useEffect, useId, useRef } from "react";
import { getActiveShortcuts } from "./bindings";
import type { Scope, ShortcutAction } from "./shortcuts";

export type Handlers = Partial<Record<ShortcutAction, (event: KeyboardEvent) => void>>;

type Registration = {
  scope: Scope;
  /** Held as a ref so re-renders do not need to re-register the scope. */
  handlers: { current: Handlers };
  /** Modals swallow bare keys so list bindings do not fire underneath them. */
  blocking: boolean;
  order: number;
};

export const SEQUENCE_WINDOW_MS = 700;
const registry = new Map<string, Registration>();

let counter = 0;
let listening = false;
let pendingPrefix: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let capture: ((event: KeyboardEvent) => boolean) | null = null;

/** While a rebind field is listening, swallow keys before shortcuts fire. */
export function setKeyCapture(handler: ((event: KeyboardEvent) => boolean) | null): void {
  capture = handler;
  clearPending();
}

/**
 * Binds a scope's worth of shortcut handlers. Registrations form a stack: the most
 * recent one matching a key wins, and a blocking scope stops the search continuing
 * to the scopes underneath it.
 */
export function useHotkeys(scope: Scope, handlers: Handlers, enabled = true): void {
  const id = useId();
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) {
      registry.delete(id);
      return;
    }

    counter += 1;
    registry.set(id, {
      scope,
      handlers: latest,
      blocking: scope === "modal",
      order: counter,
    });

    startListening();
    return () => {
      registry.delete(id);
    };
  }, [id, scope, enabled]);
}

function startListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", dispatch, { capture: true });
}

function dispatch(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.repeat) return;
  if (capture?.(event)) return;

  const typing = isTextEntry(event.target);
  const combo = comboFor(event);
  if (!combo) return;

  // Native undo belongs to the field the user is typing in.
  if (typing && combo === "mod+z") return;

  if (pendingPrefix) {
    const sequence = `${pendingPrefix} ${combo}`;
    clearPending();
    if (handle(sequence, event, typing)) return;
  }

  if (!typing && !hasModifier(event) && isSequencePrefix(combo)) {
    pendingPrefix = combo;
    pendingTimer = setTimeout(clearPending, SEQUENCE_WINDOW_MS);
    event.preventDefault();
    return;
  }

  handle(combo, event, typing);
}

function handle(combo: string, event: KeyboardEvent, typing: boolean): boolean {
  const matches = getActiveShortcuts().filter((shortcut) => shortcut.keys.includes(combo));
  if (matches.length === 0) return false;

  const usable = matches.filter(
    (shortcut) => !typing || shortcut.worksWhileTyping || hasModifier(event),
  );
  if (usable.length === 0) return false;

  const stack = [...registry.values()].sort((a, b) => b.order - a.order);

  for (const registration of stack) {
    for (const shortcut of usable) {
      if (shortcut.scope !== registration.scope) continue;
      const handler = registration.handlers.current[shortcut.action];
      if (!handler) continue;
      event.preventDefault();
      event.stopPropagation();
      handler(event);
      return true;
    }
    // A modal absorbs bare keys, but modifier combos still reach the app shell.
    if (registration.blocking && !hasModifier(event)) return false;
  }

  return false;
}

export function comboFromEvent(event: KeyboardEvent): string | null {
  return comboFor(event);
}

function comboFor(event: KeyboardEvent): string | null {
  const key = event.key;
  if (!key || key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
    return null;
  }

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");

  const normalized = key.toLowerCase();
  // Shift is implicit in punctuation like `?` and `#`; only name it for letters.
  if (event.shiftKey && normalized.length === 1 && /[a-z]/.test(normalized)) {
    parts.push("shift");
  }

  parts.push(normalized);
  return parts.join("+");
}

function isSequencePrefix(combo: string): boolean {
  return getActiveShortcuts().some((shortcut) =>
    shortcut.keys.some((keys) => keys.includes(" ") && keys.split(" ")[0] === combo),
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function clearPending(): void {
  pendingPrefix = null;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
}

/** Exposed for tests; the dispatcher itself is driven by real key events. */
export const internals = { comboFor, isSequencePrefix };

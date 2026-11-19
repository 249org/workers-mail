"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useIsMac } from "./key-caps";

const SETTLE_MS = 1_600;

/*
 * The clipboard API is the right way to do this and is not always allowed — a denied
 * permission, an insecure origin, an embedded view. Selecting the code and asking the
 * document to copy the selection is the older way, and it is permitted in places the
 * other is not. Whatever happens the code ends up selected, so the worst outcome is one
 * keystroke rather than a button that does nothing.
 */
async function copyText(code: string, node: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    // Fall through to the selection.
  }

  const selection = selectNode(node);
  if (!selection) return false;
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

function selectNode(node: HTMLElement | null): boolean {
  if (!node) return false;
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * The one-time code in a message, offered on its own so it never has to be retyped.
 *
 * The code itself is a button as well as the one beside it: by the time this is on
 * screen the only thing anybody wants to do with those digits is take them.
 */
export function CodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const value = useRef<HTMLButtonElement>(null);
  const isMac = useIsMac();

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // A new message means a new code; the last one's confirmation is not about this one.
  useEffect(() => setCopied(false), [code]);

  async function copy() {
    if (await copyText(code, value.current)) {
      setCopied(true);
      return;
    }
    selectNode(value.current);
    toast(`Code selected — press ${isMac ? "⌘C" : "Ctrl+C"} to copy`);
  }

  return (
    <div className="code-card">
      <div className="min-w-0">
        <span className="label">Verification code</span>
        <button
          ref={value}
          type="button"
          className="code-card-value"
          onClick={() => void copy()}
          aria-label={`Copy code ${code}`}
        >
          {code}
        </button>
      </div>
      <button type="button" className="btn btn-ghost shrink-0" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy code"}
      </button>
    </div>
  );
}

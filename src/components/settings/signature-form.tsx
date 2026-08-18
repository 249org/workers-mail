"use client";

import { useEffect, useState } from "react";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import {
  DEFAULT_SIGNATURE,
  MAX_SIGNATURE_CHARS,
  type SignaturePrefs,
} from "@/lib/signature";
import { useSignatureStore } from "@/lib/signature-store";
import { PrefRow } from "./fields";

export function SignatureForm({ mailboxes }: { mailboxes: PublicMailbox[] }) {
  const prefs = useSignatureStore((state) => state.prefs);
  const setPrefs = useSignatureStore((state) => state.setPrefs);
  const hydrate = useSignatureStore((state) => state.hydrate);
  const [local, setLocal] = useState<SignaturePrefs>({ ...DEFAULT_SIGNATURE, byMailbox: {} });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setLocal(prefs);
  }, [prefs]);

  function update(patch: Partial<SignaturePrefs>) {
    const next = { ...local, ...patch };
    setLocal(next);
    setPrefs(next);
  }

  const preview = local.enabled ? local.text.trim() : "";

  return (
    <div>
      <PrefRow title="Signature" hint="Turn this off to keep the wording without appending it.">
        <div className="scheme-toggle" role="radiogroup" aria-label="Signature">
          <Toggle active={local.enabled} onClick={() => update({ enabled: true })}>
            On
          </Toggle>
          <Toggle active={!local.enabled} onClick={() => update({ enabled: false })}>
            Off
          </Toggle>
        </div>
      </PrefRow>

      <PrefRow
        stack
        title="Include on"
        hint="New messages get it by default. Replies and forwards stay clean unless you ask."
      >
        <div className="scheme-toggle mt-4" role="group" aria-label="When to include the signature">
          <Press
            active={local.includeOnNew}
            onClick={() => update({ includeOnNew: !local.includeOnNew })}
          >
            New messages
          </Press>
          <Press
            active={local.includeOnReplies}
            onClick={() => update({ includeOnReplies: !local.includeOnReplies })}
          >
            Replies
          </Press>
          <Press
            active={local.includeOnForwards}
            onClick={() => update({ includeOnForwards: !local.includeOnForwards })}
          >
            Forwards
          </Press>
        </div>
      </PrefRow>

      <PrefRow
        stack
        title="The text"
        hint="Placed below what you write, after a -- line. HTML is sent as typed characters."
      >
        <textarea
          id="signature-text"
          className="field mt-4 min-h-40 resize-y font-[inherit] leading-relaxed"
          value={local.text}
          maxLength={MAX_SIGNATURE_CHARS}
          spellCheck
          placeholder={"—\nYour name\nyou@example.com"}
          onChange={(event) => update({ text: event.target.value })}
        />
        <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-muted-foreground">
          <span>Saved to this workspace as you type.</span>
          <span className="font-mono tabular-nums">
            {local.text.length} / {MAX_SIGNATURE_CHARS}
          </span>
        </div>
        <div className="signature-preview mt-4" aria-label="Preview">
          <p className="signature-preview-stub">Write your message…</p>
          {preview ? (
            <>
              <p className="signature-preview-delim">-- </p>
              <p className="signature-preview-body">{preview}</p>
            </>
          ) : (
            <p className="mt-3 text-[13px] text-muted-foreground">Nothing will be appended.</p>
          )}
        </div>
      </PrefRow>

      {mailboxes.length > 1 ? (
        <PrefRow
          stack
          title="Per mailbox"
          hint="Leave a field blank to use the text above. Filled fields replace it for that address only."
        >
          <div className="mt-4 grid gap-5">
            {mailboxes.map((mailbox) => (
              <div key={mailbox.id}>
                <label className="label" htmlFor={`sig-${mailbox.id}`}>
                  {mailbox.displayName ? `${mailbox.displayName} · ${mailbox.address}` : mailbox.address}
                </label>
                <textarea
                  id={`sig-${mailbox.id}`}
                  className="field mt-1.5 min-h-24 resize-y font-[inherit] leading-relaxed"
                  value={local.byMailbox[mailbox.id] ?? ""}
                  maxLength={MAX_SIGNATURE_CHARS}
                  placeholder="Same as default"
                  onChange={(event) => {
                    const next = { ...local.byMailbox };
                    if (event.target.value.trim()) next[mailbox.id] = event.target.value;
                    else delete next[mailbox.id];
                    update({ byMailbox: next });
                  }}
                />
              </div>
            ))}
          </div>
        </PrefRow>
      ) : null}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className="scheme-toggle-btn"
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Press({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className="scheme-toggle-btn"
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

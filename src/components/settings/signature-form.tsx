"use client";

import { useEffect, useState } from "react";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { mailboxSignatureMode, type MailboxSignatureMode } from "@/lib/signature";
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
          hint="Each address can reuse the default, carry its own wording, or send nothing at all."
        >
          <div className="mt-4 grid gap-5">
            {mailboxes.map((mailbox) => {
              const mode = mailboxSignatureMode(local, mailbox.id);
              return (
                <div key={mailbox.id}>
                  <label className="label" htmlFor={`sig-mode-${mailbox.id}`}>
                    {mailbox.displayName
                      ? `${mailbox.displayName} · ${mailbox.address}`
                      : mailbox.address}
                  </label>
                  <select
                    id={`sig-mode-${mailbox.id}`}
                    className="field mt-1.5"
                    value={mode}
                    onChange={(event) => {
                      const next = { ...local.byMailbox };
                      const choice = event.target.value as MailboxSignatureMode;
                      if (choice === "default") delete next[mailbox.id];
                      // An empty string is the stored form of "send nothing".
                      else if (choice === "none") next[mailbox.id] = "";
                      else next[mailbox.id] = local.byMailbox[mailbox.id] || local.text;
                      update({ byMailbox: next });
                    }}
                  >
                    <option value="default">Use the default signature</option>
                    <option value="custom">Its own signature</option>
                    <option value="none">No signature</option>
                  </select>

                  {mode === "custom" ? (
                    <textarea
                      id={`sig-${mailbox.id}`}
                      aria-label={`Signature for ${mailbox.address}`}
                      className="field mt-2 min-h-24 resize-y font-[inherit] leading-relaxed"
                      value={local.byMailbox[mailbox.id] ?? ""}
                      maxLength={MAX_SIGNATURE_CHARS}
                      onChange={(event) => {
                        update({
                          byMailbox: { ...local.byMailbox, [mailbox.id]: event.target.value },
                        });
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
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

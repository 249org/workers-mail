"use client";

import { useState } from "react";
import {
  ServerSettingsFields,
  type ServerSettings,
} from "@/components/mail/server-settings-fields";
import {
  EASY_PROVIDERS,
  OTHER_PROVIDER_ID,
  easyProvider,
  hostsForEasyProvider,
  hostsFromPreset,
  presetFor,
  type EasyProviderId,
} from "@/lib/transport/presets";

export type ImapProvider = EasyProviderId | typeof OTHER_PROVIDER_ID;

export type ConnectionCheck = { ok: boolean; detail: string; folders?: string[] };

type Props = {
  provider: ImapProvider;
  address: string;
  password: string;
  servers: ServerSettings;
  onProviderChange: (provider: ImapProvider, servers: ServerSettings) => void;
  onAddressChange: (address: string) => void;
  onPasswordChange: (password: string) => void;
  onServersChange: (servers: ServerSettings) => void;
  checks?: { imap: ConnectionCheck; smtp: ConnectionCheck } | null;
};

export function ImapAccountFields({
  provider,
  address,
  password,
  servers,
  onProviderChange,
  onAddressChange,
  onPasswordChange,
  onServersChange,
  checks,
}: Props) {
  const [advanced, setAdvanced] = useState(false);
  const easy = provider === "other" ? null : easyProvider(provider);

  function pick(next: ImapProvider) {
    if (next === "other") {
      onProviderChange(next, servers);
      setAdvanced(true);
      return;
    }
    onProviderChange(next, hostsForEasyProvider(next));
    setAdvanced(false);
  }

  function updateAddress(value: string) {
    onAddressChange(value);
    if (provider !== "other") return;
    const preset = presetFor(value);
    if (preset) onServersChange(hostsFromPreset(preset));
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {EASY_PROVIDERS.map((option) => {
          const selected = provider === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => pick(option.id)}
              className="flex items-start gap-2.5 border px-3 py-2.5 text-left"
              style={{
                borderRadius: 4,
                borderColor: selected ? "var(--primary)" : "var(--border)",
                background: selected ? "var(--accent-subtle)" : "transparent",
              }}
            >
              <ProviderMark letter={option.id === "gmail" ? "G" : "M"} selected={selected} />
              <span className="min-w-0">
                <span
                  className="block text-[13px] font-medium"
                  style={{ color: selected ? "var(--primary)" : "var(--foreground)" }}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">{option.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={provider === "other"}
        onClick={() => pick("other")}
        className="mt-2 text-[13px] text-muted-foreground hover:underline"
        style={{ color: provider === "other" ? "var(--primary)" : undefined, fontWeight: provider === "other" ? 600 : 400 }}
      >
        Other IMAP
      </button>

      <div className="mt-4 grid gap-4">
        <div>
          <label className="label" htmlFor="imap-address">
            Email address
          </label>
          <input
            id="imap-address"
            className="field"
            type="email"
            required
            autoComplete="username"
            placeholder={easy?.addressPlaceholder ?? "you@example.com"}
            value={address}
            onChange={(event) => updateAddress(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="imap-password">
            {easy?.passwordLabel ?? "Mailbox password"}
          </label>
          <input
            id="imap-password"
            type="password"
            required
            className="field"
            autoComplete="current-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
          <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">
            {easy ? (
              <>
                {easy.passwordHint}{" "}
                <a
                  href={easy.helpHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                >
                  {easy.helpLabel}
                </a>
              </>
            ) : (
              "The password you use for webmail. Stored encrypted with AES-GCM."
            )}
          </p>
        </div>
      </div>

      {provider === "other" || advanced ? (
        <div className="mt-4">
          <ServerSettingsFields value={servers} onChange={onServersChange} />
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 text-[12px] text-muted-foreground hover:underline"
          onClick={() => setAdvanced(true)}
        >
          Show server settings
        </button>
      )}

      {checks && (
        <div className="mt-4 space-y-2">
          <CheckRow label="IMAP" check={checks.imap} />
          <CheckRow label="SMTP" check={checks.smtp} />
          {checks.imap.folders && checks.imap.folders.length > 0 && (
            <p className="text-xs text-[var(--ink-muted)]">
              Folders found: {checks.imap.folders.slice(0, 8).join(", ")}
              {checks.imap.folders.length > 8 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function ProviderMark({ letter, selected }: { letter: string; selected: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border text-[12px] font-medium"
      style={{
        borderRadius: 4,
        borderColor: selected ? "var(--primary)" : "var(--border)",
        color: selected ? "var(--primary)" : "var(--foreground)",
      }}
    >
      {letter}
    </span>
  );
}

function CheckRow({ label, check }: { label: string; check: ConnectionCheck }) {
  return (
    <p className="flex items-start gap-2 text-xs">
      <span
        aria-hidden
        className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: check.ok ? "var(--success)" : "var(--danger)" }}
      />
      <span>
        <span className="font-medium">{label}</span> — {check.detail}
      </span>
    </p>
  );
}

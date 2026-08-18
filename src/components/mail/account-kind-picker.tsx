"use client";

import type { ReactNode } from "react";
import type { EasyProviderId } from "@/lib/transport/presets";
import { EASY_PROVIDERS } from "@/lib/transport/presets";

export type AccountKind = EasyProviderId | "other" | "native";

type Props = {
  value: AccountKind;
  onChange: (kind: AccountKind) => void;
  /** Include “address on your domain” as a fourth choice. */
  allowNative?: boolean;
};

export function AccountKindPicker({ value, onChange, allowNative = false }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {EASY_PROVIDERS.map((option) => (
        <KindChoice
          key={option.id}
          selected={value === option.id}
          label={option.label}
          blurb={option.blurb}
          onClick={() => onChange(option.id)}
          mark={option.id === "gmail" ? <GoogleMark /> : <MicrosoftMark />}
        />
      ))}
      {allowNative ? (
        <KindChoice
          selected={value === "native"}
          label="Your domain"
          blurb="An address on Cloudflare"
          onClick={() => onChange("native")}
          mark={<DomainMark />}
        />
      ) : null}
      <div className={allowNative ? undefined : "col-span-2"}>
        <KindChoice
          selected={value === "other"}
          label="Other IMAP"
          blurb="Looked up from DNS — not guessed"
          onClick={() => onChange("other")}
          mark={<ImapMark />}
        />
      </div>
    </div>
  );
}

function KindChoice({
  selected,
  label,
  blurb,
  onClick,
  mark,
}: {
  selected: boolean;
  label: string;
  blurb: string;
  onClick: () => void;
  mark: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="kind-choice"
    >
      <span className="kind-choice-mark" aria-hidden>
        {mark}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">{blurb}</span>
      </span>
    </button>
  );
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.96 8.96 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}

export function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="7.2" height="7.2" />
      <rect x="9.8" y="1" width="7.2" height="7.2" />
      <rect x="1" y="9.8" width="7.2" height="7.2" />
      <rect x="9.8" y="9.8" width="7.2" height="7.2" />
    </svg>
  );
}

function DomainMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 3 3.8 6 3.8 9s-1.3 6-3.8 9c-2.5-3-3.8-6-3.8-9s1.3-6 3.8-9z" />
    </svg>
  );
}

function ImapMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

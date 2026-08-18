"use client";

import { useState } from "react";
import {
  AccountKindPicker,
  type AccountKind,
} from "@/components/mail/account-kind-picker";
import {
  ServerSettingsFields,
  type ServerSettings,
} from "@/components/mail/server-settings-fields";
import {
  easyProvider,
  hostsForEasyProvider,
  tlsForImapPort,
  tlsForSmtpPort,
  type EasyProviderId,
} from "@/lib/transport/presets";

export type ImapDraft = {
  kind: EasyProviderId | "other";
  address: string;
  password: string;
  displayName: string;
  imap: {
    host: string;
    port: number;
    tls: "implicit" | "starttls";
    username: string;
    password: string;
  };
  smtp: {
    host: string;
    port: number;
    tls: "implicit" | "starttls";
    username: string;
    password: string;
  };
};

const EMPTY_SERVERS: ServerSettings = {
  imapHost: "",
  imapPort: 993,
  smtpHost: "",
  smtpPort: 587,
};

export function LinkInboxWizard({
  submitting,
  error,
  submitLabel,
  onBack,
  onSubmit,
  startAt = "kind",
  initialKind = "gmail",
  initialAddress = "",
}: {
  submitting?: boolean;
  error?: string | null;
  submitLabel: string;
  onBack?: () => void;
  onSubmit: (draft: ImapDraft) => void;
  startAt?: "kind" | "link";
  initialKind?: EasyProviderId | "other";
  initialAddress?: string;
}) {
  const [step, setStep] = useState<"kind" | "link">(startAt);
  const [kind, setKind] = useState<EasyProviderId | "other">(initialKind);
  const [address, setAddress] = useState(initialAddress);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [servers, setServers] = useState<ServerSettings>(
    initialKind === "other" ? EMPTY_SERVERS : hostsForEasyProvider(initialKind),
  );
  const [advanced, setAdvanced] = useState(initialKind === "other");

  function pick(next: AccountKind) {
    if (next === "native") return;
    setKind(next);
    if (next === "other") {
      setServers(EMPTY_SERVERS);
      setAdvanced(true);
    } else {
      setServers(hostsForEasyProvider(next));
      setAdvanced(false);
    }
  }

  function submit() {
    const secret = password.replace(/\s+/g, "");
    onSubmit({
      kind,
      address,
      password: secret,
      displayName,
      imap: {
        host: servers.imapHost,
        port: servers.imapPort,
        tls: tlsForImapPort(servers.imapPort),
        username: address,
        password: secret,
      },
      smtp: {
        host: servers.smtpHost,
        port: servers.smtpPort,
        tls: tlsForSmtpPort(servers.smtpPort),
        username: address,
        password: secret,
      },
    });
  }

  if (step === "kind") {
    return (
      <div>
        <AccountKindPicker value={kind} onChange={pick} />
        <div className="mt-5 flex gap-2">
          {onBack ? (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Back
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => setStep("link")}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  const easy = kind === "other" ? null : easyProvider(kind);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {kind !== "other" ? (
        <EasyLink
          provider={kind}
          address={address}
          password={password}
          displayName={displayName}
          onAddressChange={setAddress}
          onPasswordChange={setPassword}
          onDisplayNameChange={setDisplayName}
        />
      ) : (
        <div className="grid gap-4">
          <Field label="Email address" htmlFor="imap-address">
            <input
              id="imap-address"
              className="field"
              type="email"
              required
              autoComplete="username"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>
          <Field label="Mailbox password" htmlFor="imap-password" hint="The password you use for webmail.">
            <input
              id="imap-password"
              className="field"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Display name" htmlFor="imap-display-name">
            <input
              id="imap-display-name"
              className="field"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          {advanced ? (
            <ServerSettingsFields value={servers} onChange={setServers} />
          ) : (
            <button type="button" className="text-[12px] text-muted-foreground hover:underline" onClick={() => setAdvanced(true)}>
              Show server settings
            </button>
          )}
        </div>
      )}

      {error ? <p className="mt-4 text-[13px] text-[var(--danger)]">{error}</p> : null}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (startAt === "link" && onBack) onBack();
            else setStep("kind");
          }}
        >
          Back
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !address || !password || !servers.imapHost || !servers.smtpHost}
        >
          {submitting ? "Connecting" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function EasyLink({
  provider,
  address,
  password,
  displayName,
  onAddressChange,
  onPasswordChange,
  onDisplayNameChange,
}: {
  provider: EasyProviderId;
  address: string;
  password: string;
  displayName: string;
  onAddressChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
}) {
  const easy = easyProvider(provider);
  const google = provider === "gmail";

  return (
    <div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {google
          ? "Google will not accept the password you use at gmail.com. Continue with Google, create a 16-character app password, then paste it here."
          : "Microsoft will not accept your usual password if two-step verification is on. Continue, create an app password, then paste it here."}
      </p>

      <a
        className="btn btn-primary mt-4 w-full"
        href={easy.helpHref}
        target="_blank"
        rel="noreferrer"
      >
        {google ? "Continue with Google" : "Continue with Microsoft"}
      </a>
      <p className="mt-2 text-center text-[12px] text-muted-foreground">
        Opens in a new tab. Name it Workers Mail, copy the password, come back.
      </p>

      <p className="login-or">then paste it here</p>

      <Field label="Email address" htmlFor="link-address">
        <input
          id="link-address"
          className="field"
          type="email"
          required
          autoComplete="username"
          placeholder={easy.addressPlaceholder}
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
        />
      </Field>
      <Field
        label={easy.passwordLabel}
        htmlFor="link-password"
        hint="16 characters. Spaces are fine."
      >
        <input
          id="link-password"
          className="field"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </Field>
      <Field label="Display name" htmlFor="link-display-name">
        <input
          id="link-display-name"
          className="field"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

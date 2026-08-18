"use client";

import { useEffect, useState } from "react";
import {
  AccountKindPicker,
  type AccountKind,
} from "@/components/mail/account-kind-picker";
import {
  ServerSettingsFields,
  type ServerSettings,
} from "@/components/mail/server-settings-fields";
import { isEmailAddress } from "@/lib/mail/address";
import type { DiscoverResult } from "@/lib/transport/autodiscover";
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
  const [advanced, setAdvanced] = useState(false);
  const [serversEdited, setServersEdited] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null);

  function pick(next: AccountKind) {
    if (next === "native") return;
    setKind(next);
    setDiscovery(null);
    setServersEdited(false);
    setAdvanced(false);
    if (next === "other") {
      setServers(EMPTY_SERVERS);
    } else {
      setServers(hostsForEasyProvider(next));
    }
  }

  useEffect(() => {
    if (kind !== "other" || serversEdited || !isEmailAddress(address)) {
      setDiscovering(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDiscovering(true);
      void (async () => {
        try {
          const response = await fetch(
            `/api/mailboxes/discover?address=${encodeURIComponent(address)}`,
            { signal: controller.signal },
          );
          const result = (await response.json()) as DiscoverResult;
          if (controller.signal.aborted || serversEdited) return;
          setDiscovery(result);
          if (result.found) {
            setServers({
              imapHost: result.imapHost,
              imapPort: result.imapPort,
              smtpHost: result.smtpHost,
              smtpPort: result.smtpPort,
            });
            setAdvanced(false);
          } else {
            setAdvanced(true);
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          setDiscovery({
            found: false,
            detail: error instanceof Error ? error.message : "Lookup failed.",
          });
          setAdvanced(true);
        } finally {
          if (!controller.signal.aborted) setDiscovering(false);
        }
      })();
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, kind, serversEdited]);

  async function submit() {
    const secret = password.replace(/\s+/g, "");
    let next = servers;
    if (kind === "other" && (!next.imapHost || !next.smtpHost) && isEmailAddress(address)) {
      setDiscovering(true);
      try {
        const response = await fetch(
          `/api/mailboxes/discover?address=${encodeURIComponent(address)}`,
        );
        const result = (await response.json()) as DiscoverResult;
        setDiscovery(result);
        if (result.found) {
          next = {
            imapHost: result.imapHost,
            imapPort: result.imapPort,
            smtpHost: result.smtpHost,
            smtpPort: result.smtpPort,
          };
          setServers(next);
        }
      } finally {
        setDiscovering(false);
      }
    }
    onSubmit({
      kind,
      address,
      password: secret,
      displayName,
      imap: {
        host: next.imapHost,
        port: next.imapPort,
        tls: tlsForImapPort(next.imapPort),
        username: address,
        password: secret,
      },
      smtp: {
        host: next.smtpHost,
        port: next.smtpPort,
        tls: tlsForSmtpPort(next.smtpPort),
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
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
              placeholder="you@your-domain.com"
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                if (!serversEdited) {
                  setServers(EMPTY_SERVERS);
                  setDiscovery(null);
                }
              }}
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
          <DiscoverStatus
            address={address}
            discovering={discovering}
            discovery={discovery}
          />
          {advanced ? (
            <ServerSettingsFields
              value={servers}
              onChange={(next) => {
                setServersEdited(true);
                setServers(next);
              }}
            />
          ) : (
            <button type="button" className="text-[12px] text-muted-foreground hover:underline" onClick={() => setAdvanced(true)}>
              Edit server settings
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
          disabled={
            submitting ||
            discovering ||
            !address ||
            !password ||
            !servers.imapHost ||
            !servers.smtpHost
          }
        >
          {submitting ? "Connecting" : discovering ? "Looking up host" : submitLabel}
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

function DiscoverStatus({
  address,
  discovering,
  discovery,
}: {
  address: string;
  discovering: boolean;
  discovery: DiscoverResult | null;
}) {
  const domain = address.split("@")[1]?.trim().toLowerCase() ?? "";
  if (discovering) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Looking up the mail host{domain ? ` for ${domain}` : ""}…
      </p>
    );
  }
  if (!discovery) return null;
  if (discovery.found) {
    return (
      <p className="text-[12px] text-muted-foreground">
        {discovery.imapHost}:{discovery.imapPort} · {discovery.smtpHost}:{discovery.smtpPort}
        <span className="mt-0.5 block">{discovery.detail}</span>
      </p>
    );
  }
  return <p className="text-[12px] text-muted-foreground">{discovery.detail}</p>;
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

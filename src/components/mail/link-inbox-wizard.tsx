"use client";

import { useEffect, useState } from "react";
import {
  ServerSettingsFields,
  type ServerSettings,
} from "@/components/mail/server-settings-fields";
import { isEmailAddress } from "@/lib/mail/address";
import type { DiscoverResult } from "@/lib/transport/autodiscover";
import {
  appPasswordHelp,
  presetFor,
  tlsForImapPort,
  tlsForSmtpPort,
} from "@/lib/transport/presets";

export type ImapDraft = {
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

const DISCOVER_DEBOUNCE_MS = 400;

/**
 * One form for every account. Hosts are resolved from the address — a known provider
 * comes from the directory, anything else from SRV, autoconfig or MX — so there is
 * nothing for the person connecting to choose beyond their own credentials.
 */
export function LinkInboxWizard({
  submitting,
  error,
  submitLabel,
  onSubmit,
  onBack,
  initialAddress = "",
}: {
  submitting?: boolean;
  error?: string | null;
  submitLabel: string;
  onSubmit: (draft: ImapDraft) => void;
  onBack?: () => void;
  initialAddress?: string;
}) {
  const [address, setAddress] = useState(initialAddress);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [servers, setServers] = useState<ServerSettings>(EMPTY_SERVERS);
  const [advanced, setAdvanced] = useState(false);
  const [serversEdited, setServersEdited] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null);

  const help = appPasswordHelp(address);

  useEffect(() => {
    if (serversEdited || !isEmailAddress(address)) {
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
            // Nothing found, so the fields have to be filled in by hand.
            setAdvanced(true);
          }
        } catch (lookupError) {
          if (controller.signal.aborted) return;
          setDiscovery({
            found: false,
            detail: lookupError instanceof Error ? lookupError.message : "Lookup failed.",
          });
          setAdvanced(true);
        } finally {
          if (!controller.signal.aborted) setDiscovering(false);
        }
      })();
    }, DISCOVER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, serversEdited]);

  async function submit() {
    // App passwords are shown in spaced groups of four; the server wants them joined.
    const secret = password.replace(/\s+/g, "");
    let next = servers;

    if ((!next.imapHost || !next.smtpHost) && isEmailAddress(address)) {
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4">
        <Field label="Email address" htmlFor="imap-address">
          <input
            id="imap-address"
            className="field"
            type="email"
            required
            autoComplete="username"
            placeholder="you@example.com"
            autoFocus
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

        <Field
          label="Password"
          htmlFor="imap-password"
          hint={help ? undefined : "The password you use for webmail."}
        >
          <input
            id="imap-password"
            className="field"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {help ? (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {help.label} needs an app password, not your normal one.{" "}
              <a
                href={help.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[var(--primary)] hover:underline"
              >
                Create one
              </a>
              .
            </p>
          ) : null}
        </Field>

        <Field label="Display name" htmlFor="imap-display-name">
          <input
            id="imap-display-name"
            className="field"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <DiscoverStatus address={address} discovering={discovering} discovery={discovery} />

        {advanced ? (
          <ServerSettingsFields
            value={servers}
            onChange={(next) => {
              setServersEdited(true);
              setServers(next);
            }}
          />
        ) : (
          <button
            type="button"
            className="text-[12px] text-muted-foreground hover:underline"
            onClick={() => setAdvanced(true)}
          >
            Edit server settings
          </button>
        )}
      </div>

      {error ? <p className="mt-4 text-[13px] text-[var(--danger)]">{error}</p> : null}

      <div className="mt-5 flex gap-2">
        {onBack ? (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
        ) : null}
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

function DiscoverStatus({
  address,
  discovering,
  discovery,
}: {
  address: string;
  discovering: boolean;
  discovery: DiscoverResult | null;
}) {
  if (!isEmailAddress(address)) return null;
  if (discovering) {
    return <p className="text-[12px] text-muted-foreground">Looking up mail servers…</p>;
  }
  if (!discovery) return null;

  return (
    <p
      className="text-[12px]"
      style={{ color: discovery.found ? "var(--muted-foreground)" : "var(--warning)" }}
    >
      {discovery.found
        ? `Found ${discovery.imapHost} · ${discovery.detail}`
        : `${discovery.detail} Enter the server settings below.`}
    </p>
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
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { presetFor, tlsForImapPort, tlsForSmtpPort } from "@/lib/transport/presets";

type DomainOption = { id: string; name: string; status: string };
type Check = { ok: boolean; detail: string; folders?: string[] };

export function NewMailboxForm({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"native" | "external_imap">(
    domains.length > 0 ? "native" : "external_imap",
  );
  const [localPart, setLocalPart] = useState("");
  const [domainName, setDomainName] = useState(domains[0]?.name ?? "");
  const [displayName, setDisplayName] = useState("");

  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);

  const [checks, setChecks] = useState<{ imap: Check; smtp: Check } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);

  function applyPreset(value: string) {
    setAddress(value);
    if (imapHost) return;

    const preset = presetFor(value);
    if (!preset) return;
    setImapHost(preset.imapHost);
    setImapPort(preset.imapPort);
    setSmtpHost(preset.smtpHost);
    setSmtpPort(preset.smtpPort);
  }

  function imapPayload() {
    return {
      address,
      imap: {
        host: imapHost,
        port: imapPort,
        tls: tlsForImapPort(imapPort),
        username: address,
        password,
      },
      smtp: {
        host: smtpHost,
        port: smtpPort,
        tls: tlsForSmtpPort(smtpPort),
        username: address,
        password,
      },
    };
  }

  async function test() {
    setBusy("test");
    setError(null);
    setChecks(null);

    const response = await fetch("/api/mail/test-connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(imapPayload()),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      imap?: Check;
      smtp?: Check;
      error?: string;
    };

    if (!response.ok || !payload.imap || !payload.smtp) {
      setError(payload.error ?? "The connection test could not run.");
    } else {
      setChecks({ imap: payload.imap, smtp: payload.smtp });
    }
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    setError(null);

    const body =
      kind === "native"
        ? {
            type: "native" as const,
            address: `${localPart.trim()}@${domainName}`,
            displayName,
          }
        : { type: "external_imap" as const, displayName, ...imapPayload() };

    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "The mailbox could not be created.");
      setBusy(null);
      return;
    }

    router.push("/settings/mailboxes");
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <TabButton active={kind === "native"} onClick={() => setKind("native")}>
          Domain mailbox
        </TabButton>
        <TabButton active={kind === "external_imap"} onClick={() => setKind("external_imap")}>
          Connect existing IMAP
        </TabButton>
      </div>

      <div className="card mt-4 p-5">
        {kind === "native" ? (
          domains.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">
              Connect a domain first, then you can create addresses on it.
            </p>
          ) : (
            <>
              <label className="label" htmlFor="local-part">
                Address
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="local-part"
                  className="field"
                  placeholder="hello"
                  value={localPart}
                  onChange={(event) => setLocalPart(event.target.value)}
                />
                <span className="text-sm text-[var(--ink-muted)]">@</span>
                <select
                  className="field"
                  value={domainName}
                  onChange={(event) => setDomainName(event.target.value)}
                >
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.name}>
                      {domain.name}
                      {domain.status !== "verified" ? " (unverified)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className="label" htmlFor="display-name">
                  Display name
                </label>
                <input
                  id="display-name"
                  className="field"
                  placeholder="Support"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            </>
          )
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="imap-address">
                  Email address
                </label>
                <input
                  id="imap-address"
                  className="field"
                  placeholder="you@example.com"
                  value={address}
                  onChange={(event) => applyPreset(event.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label" htmlFor="imap-password">
                  Password or app password
                </label>
                <input
                  id="imap-password"
                  type="password"
                  className="field"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
                  Stored encrypted with AES-GCM. Providers with 2FA need an app password.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="imap-host">
                  IMAP host
                </label>
                <input
                  id="imap-host"
                  className="field"
                  placeholder="imap.example.com"
                  value={imapHost}
                  onChange={(event) => setImapHost(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="imap-port">
                  IMAP port
                </label>
                <select
                  id="imap-port"
                  className="field"
                  value={imapPort}
                  onChange={(event) => setImapPort(Number(event.target.value))}
                >
                  <option value={993}>993 — implicit TLS</option>
                  <option value={143}>143 — STARTTLS</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="smtp-host">
                  SMTP host
                </label>
                <input
                  id="smtp-host"
                  className="field"
                  placeholder="smtp.example.com"
                  value={smtpHost}
                  onChange={(event) => setSmtpHost(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="smtp-port">
                  SMTP port
                </label>
                <select
                  id="smtp-port"
                  className="field"
                  value={smtpPort}
                  onChange={(event) => setSmtpPort(Number(event.target.value))}
                >
                  <option value={587}>587 — STARTTLS</option>
                  <option value={465}>465 — implicit TLS</option>
                </select>
                <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
                  Port 25 is blocked on Workers and cannot be used.
                </p>
              </div>
            </div>

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
        )}

        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          {kind === "external_imap" && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null || !address || !password || !imapHost}
              onClick={() => void test()}
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null || (kind === "native" ? !localPart.trim() || !domainName : !address || !password)}
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Create mailbox"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
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
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--ink-muted)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function CheckRow({ label, check }: { label: string; check: Check }) {
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

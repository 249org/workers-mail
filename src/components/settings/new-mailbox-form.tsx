"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ImapAccountFields,
  type ConnectionCheck,
  type ImapProvider,
} from "@/components/mail/imap-account-fields";
import { type ServerSettings } from "@/components/mail/server-settings-fields";
import { hostsForEasyProvider, tlsForImapPort, tlsForSmtpPort } from "@/lib/transport/presets";

type DomainOption = { id: string; name: string; status: string };

export function NewMailboxForm({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"native" | "imap">(
    domains.length > 0 ? "native" : "imap",
  );
  const [localPart, setLocalPart] = useState("");
  const [domainName, setDomainName] = useState(domains[0]?.name ?? "");
  const [displayName, setDisplayName] = useState("");

  const [provider, setProvider] = useState<ImapProvider>("gmail");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [servers, setServers] = useState<ServerSettings>(hostsForEasyProvider("gmail"));

  const [checks, setChecks] = useState<{ imap: ConnectionCheck; smtp: ConnectionCheck } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);

  function imapPayload() {
    return {
      address,
      imap: {
        host: servers.imapHost,
        port: servers.imapPort,
        tls: tlsForImapPort(servers.imapPort),
        username: address,
        password,
      },
      smtp: {
        host: servers.smtpHost,
        port: servers.smtpPort,
        tls: tlsForSmtpPort(servers.smtpPort),
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
      imap?: ConnectionCheck;
      smtp?: ConnectionCheck;
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
      <div className="flex flex-wrap gap-2">
        <TabButton active={kind === "native"} onClick={() => setKind("native")}>
          Domain mailbox
        </TabButton>
        <TabButton active={kind === "imap"} onClick={() => setKind("imap")}>
          Google, Microsoft, or IMAP
        </TabButton>
      </div>

      <div className="panel mt-4 p-5">
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
            <ImapAccountFields
              provider={provider}
              address={address}
              password={password}
              servers={servers}
              checks={checks}
              onProviderChange={(next, nextServers) => {
                setProvider(next);
                setServers(nextServers);
                setChecks(null);
              }}
              onAddressChange={setAddress}
              onPasswordChange={setPassword}
              onServersChange={setServers}
            />

            <div className="mt-4">
              <label className="label" htmlFor="imap-display-name">
                Display name
              </label>
              <input
                id="imap-display-name"
                className="field"
                placeholder="You"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
          </>
        )}

        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          {kind === "imap" && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null || !address || !password || !servers.imapHost}
              onClick={() => void test()}
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy !== null ||
              (kind === "native"
                ? !localPart.trim() || !domainName
                : !address || !password || !servers.imapHost || !servers.smtpHost)
            }
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
      className="rounded-full px-3 py-1.5 text-[13px]"
      style={{
        background: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--primary)" : "var(--muted-foreground)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

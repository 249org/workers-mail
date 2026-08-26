"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LinkInboxWizard, type ImapDraft } from "@/components/mail/link-inbox-wizard";
import { useSettingsViewStore } from "@/components/settings/settings-view-store";

type DomainOption = { id: string; name: string; status: string };

/**
 * Adding a mailbox is one form: an address and a password. Gmail and Microsoft speak
 * IMAP like everyone else, so asking which provider it is only moved work onto the
 * person connecting — the hosts come from the address instead.
 */
export function NewMailboxForm({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [creatingAddress, setCreatingAddress] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [domainName, setDomainName] = useState(domains[0]?.name ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "The mailbox could not be created.");
      setBusy(false);
      return;
    }
    useSettingsViewStore.getState().prepare("/settings/mailboxes");
    router.push("/settings/mailboxes");
    router.refresh();
  }

  if (creatingAddress) {
    return (
      <div className="mt-6">
        {domains.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
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
                autoFocus
                value={localPart}
                onChange={(event) => setLocalPart(event.target.value)}
              />
              <span className="text-[13px] text-muted-foreground">@</span>
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
        )}

        {error ? <p className="mt-4 text-[13px] text-[var(--danger)]">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setError(null);
              setCreatingAddress(false);
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !localPart.trim() || !domainName}
            onClick={() =>
              void create({
                type: "native",
                address: `${localPart.trim()}@${domainName}`,
                displayName,
              })
            }
          >
            {busy ? "Saving" : "Create address"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <LinkInboxWizard
        submitting={busy}
        error={error}
        submitLabel="Connect mailbox"
        returnTo="/settings/mailboxes"
        onSubmit={(draft: ImapDraft) =>
          void create({
            type: "external_imap",
            displayName: draft.displayName,
            address: draft.address,
            imap: draft.imap,
            smtp: draft.smtp,
          })
        }
      />

      {domains.length > 0 ? (
        <button
          type="button"
          className="mt-5 text-[12px] text-muted-foreground hover:underline"
          onClick={() => {
            setError(null);
            setCreatingAddress(true);
          }}
        >
          Create an address on a domain you run instead
        </button>
      ) : null}
    </div>
  );
}

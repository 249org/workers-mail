"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AccountKindPicker,
  type AccountKind,
} from "@/components/mail/account-kind-picker";
import { LinkInboxWizard, type ImapDraft } from "@/components/mail/link-inbox-wizard";
import type { EasyProviderId } from "@/lib/transport/presets";

type DomainOption = { id: string; name: string; status: string };

export function NewMailboxForm({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<"kind" | "details">("kind");
  const [kind, setKind] = useState<AccountKind>("gmail");
  const [localPart, setLocalPart] = useState("");
  const [domainName, setDomainName] = useState(domains[0]?.name ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveImap(draft: ImapDraft) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "external_imap",
        displayName: draft.displayName,
        address: draft.address,
        imap: draft.imap,
        smtp: draft.smtp,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "The mailbox could not be created.");
      setBusy(false);
      return;
    }
    router.push("/settings/mailboxes");
    router.refresh();
  }

  async function saveNative() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "native",
        address: `${localPart.trim()}@${domainName}`,
        displayName,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "The mailbox could not be created.");
      setBusy(false);
      return;
    }
    router.push("/settings/mailboxes");
    router.refresh();
  }

  if (stage === "kind") {
    return (
      <div className="mt-6">
        <p className="login-step-index">Step 1 of 2</p>
        <AccountKindPicker value={kind} onChange={setKind} allowNative />
        <button type="button" className="btn btn-primary mt-5" onClick={() => setStage("details")}>
          Continue
        </button>
      </div>
    );
  }

  if (kind === "native") {
    return (
      <div className="mt-6">
        <p className="login-step-index">Step 2 of 2</p>
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
          <button type="button" className="btn btn-ghost" onClick={() => setStage("kind")}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !localPart.trim() || !domainName}
            onClick={() => void saveNative()}
          >
            {busy ? "Saving" : "Create address"}
          </button>
        </div>
      </div>
    );
  }

  const heading =
    kind === "gmail" ? "Connect Gmail" : kind === "outlook" ? "Connect Microsoft" : "Connect IMAP";

  return (
    <div className="mt-6">
      <p className="login-step-index">Step 2 of 2 · {heading}</p>
      <LinkInboxWizard
        startAt="link"
        initialKind={kind as EasyProviderId | "other"}
        submitting={busy}
        error={error}
        submitLabel={heading}
        onBack={() => {
          setError(null);
          setStage("kind");
        }}
        onSubmit={(draft) => void saveImap(draft)}
      />
    </div>
  );
}

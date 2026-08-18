"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DnsRecord } from "@/lib/db/schema";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { formatRelative } from "@/lib/format";

export type RuleView = {
  id: string;
  matchType: "address" | "catch_all";
  matchValue: string | null;
  action: "mailbox" | "forward" | "drop";
  targetMailboxId: string | null;
  forwardTo: string | null;
};

export type DomainView = {
  id: string;
  name: string;
  zoneId: string | null;
  status: "pending" | "verified" | "error";
  routingEnabled: boolean;
  sendingEnabled: boolean;
  dnsRecords: DnsRecord[];
  lastCheckedAt: number | null;
  rules: RuleView[];
};

export function DomainManager({
  domains,
  mailboxes,
}: {
  domains: DomainView[];
  mailboxes: PublicMailbox[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addDomain() {
    setBusy("add");
    setError(null);
    const response = await fetch("/api/domains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "That domain could not be added.");
    } else {
      setName("");
      router.refresh();
    }
    setBusy(null);
  }

  async function verify(domainId: string) {
    setBusy(domainId);
    setError(null);
    const response = await fetch(`/api/domains/${domainId}/verify`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Verification failed.");
    }
    router.refresh();
    setBusy(null);
  }

  async function removeDomain(domainId: string) {
    setBusy(domainId);
    await fetch(`/api/domains/${domainId}`, { method: "DELETE" });
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="mt-6">
      <div className="panel p-4">
        <label className="label" htmlFor="domain-name">
          Add a domain
        </label>
        <div className="flex gap-2">
          <input
            id="domain-name"
            className="field"
            placeholder="example.com"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            disabled={busy === "add" || !name.trim()}
            onClick={() => void addDomain()}
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      </div>

      {domains.length === 0 ? (
        <p className="list-frame mt-4 p-6 text-center text-[13px] text-muted-foreground">
          No domains connected yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {domains.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              mailboxes={mailboxes}
              busy={busy === domain.id}
              onVerify={() => void verify(domain.id)}
              onRemove={() => void removeDomain(domain.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainCard({
  domain,
  mailboxes,
  busy,
  onVerify,
  onRemove,
}: {
  domain: DomainView;
  mailboxes: PublicMailbox[];
  busy: boolean;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [showRuleForm, setShowRuleForm] = useState(false);

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{domain.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
            <StatusBadge status={domain.status} />
            {domain.routingEnabled && <span className="badge">Receiving</span>}
            {domain.sendingEnabled && <span className="badge">Sending</span>}
            <span>Checked {formatRelative(domain.lastCheckedAt)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost !py-1.5 text-xs" disabled={busy} onClick={onVerify}>
            {busy ? "Checking…" : "Verify"}
          </button>
          <button type="button" className="btn btn-danger !py-1.5 text-xs" disabled={busy} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      {domain.dnsRecords.length > 0 && (
        <div className="mt-4">
          <p className="label">Required DNS records</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="text-[var(--ink-faint)]">
                <tr>
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Value</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {domain.dnsRecords.map((record, index) => (
                  <tr key={`${record.type}-${index}`} className="border-t border-[var(--border)]">
                    <td className="py-1.5 pr-3">{record.type}</td>
                    <td className="py-1.5 pr-3 font-mono">{record.name}</td>
                    <td className="py-1.5 pr-3 font-mono break-all">
                      {record.priority ? `${record.priority} ` : ""}
                      {record.content}
                    </td>
                    <td className="py-1.5" style={{ color: record.present ? "var(--success)" : "var(--warning)" }}>
                      {record.present ? "Present" : "Missing"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="label !mb-0">Routing rules</p>
          <button
            type="button"
            className="text-xs text-[var(--accent)]"
            onClick={() => setShowRuleForm((open) => !open)}
          >
            {showRuleForm ? "Cancel" : "Add rule"}
          </button>
        </div>

        {domain.rules.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            No rules. Mail to an exact mailbox address is delivered automatically; add a
            catch-all to capture everything else.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--border)] text-xs">
            {domain.rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {rule.matchType === "catch_all" ? "Catch-all" : rule.matchValue} →{" "}
                  {rule.action === "mailbox"
                    ? (mailboxes.find((box) => box.id === rule.targetMailboxId)?.address ?? "mailbox")
                    : rule.action === "forward"
                      ? rule.forwardTo
                      : "drop"}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-[var(--danger)] hover:underline"
                  onClick={async () => {
                    await fetch(`/api/domains/${domain.id}/rules?rule=${rule.id}`, {
                      method: "DELETE",
                    });
                    router.refresh();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        {showRuleForm && (
          <RuleForm
            domainId={domain.id}
            mailboxes={mailboxes}
            onDone={() => {
              setShowRuleForm(false);
              router.refresh();
            }}
          />
        )}
      </div>
    </section>
  );
}

function RuleForm({
  domainId,
  mailboxes,
  onDone,
}: {
  domainId: string;
  mailboxes: PublicMailbox[];
  onDone: () => void;
}) {
  const [matchType, setMatchType] = useState<"address" | "catch_all">("catch_all");
  const [matchValue, setMatchValue] = useState("");
  const [action, setAction] = useState<"mailbox" | "forward" | "drop">("mailbox");
  const [targetMailboxId, setTargetMailboxId] = useState(mailboxes[0]?.id ?? "");
  const [forwardTo, setForwardTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const response = await fetch(`/api/domains/${domainId}/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchType, matchValue, action, targetMailboxId, forwardTo }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "The rule could not be saved.");
      return;
    }
    onDone();
  }

  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`match-${domainId}`}>
            Match
          </label>
          <select
            id={`match-${domainId}`}
            className="field"
            value={matchType}
            onChange={(event) => setMatchType(event.target.value as "address" | "catch_all")}
          >
            <option value="catch_all">Everything else</option>
            <option value="address">A specific address</option>
          </select>
          {matchType === "address" && (
            <input
              className="field mt-2"
              placeholder="sales@example.com"
              value={matchValue}
              onChange={(event) => setMatchValue(event.target.value)}
            />
          )}
        </div>

        <div>
          <label className="label" htmlFor={`action-${domainId}`}>
            Then
          </label>
          <select
            id={`action-${domainId}`}
            className="field"
            value={action}
            onChange={(event) => setAction(event.target.value as typeof action)}
          >
            <option value="mailbox">Deliver to a mailbox</option>
            <option value="forward">Forward to an address</option>
            <option value="drop">Drop silently</option>
          </select>

          {action === "mailbox" && (
            <select
              className="field mt-2"
              value={targetMailboxId}
              onChange={(event) => setTargetMailboxId(event.target.value)}
            >
              {mailboxes.map((mailbox) => (
                <option key={mailbox.id} value={mailbox.id}>
                  {mailbox.address}
                </option>
              ))}
            </select>
          )}
          {action === "forward" && (
            <input
              className="field mt-2"
              placeholder="somewhere@else.com"
              value={forwardTo}
              onChange={(event) => setForwardTo(event.target.value)}
            />
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      <button type="button" className="btn btn-primary mt-3 text-xs" onClick={() => void submit()}>
        Save rule
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: DomainView["status"] }) {
  const color =
    status === "verified" ? "var(--success)" : status === "error" ? "var(--danger)" : "var(--warning)";
  return (
    <span className="badge" style={{ color }}>
      {status}
    </span>
  );
}

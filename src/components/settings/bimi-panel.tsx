"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bimiIssues, bimiRecordName, bimiRecordValue } from "@/lib/mail/bimi";

type Props = {
  domainId: string;
  domainName: string;
  logoUrl: string | null;
  certUrl: string | null;
  dmarcPolicy: string | null;
};

export function BimiPanel({ domainId, domainName, logoUrl, certUrl, dmarcPolicy }: Props) {
  const router = useRouter();
  const [logo, setLogo] = useState(logoUrl ?? "");
  const [cert, setCert] = useState(certUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = { logoUrl: logo.trim() || null, certUrl: cert.trim() || null };
  const record = bimiRecordValue(config);
  const issues = bimiIssues(config, dmarcPolicy);

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/domains/${domainId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bimiLogoUrl: config.logoUrl, bimiCertUrl: config.certUrl }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "That could not be saved.");
    } else {
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="label !mb-0">Logo in Gmail (BIMI)</p>
      </div>

      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        A logo cannot be sent inside a message. Gmail looks it up from DNS and only shows
        it when the domain passes DMARC at enforcement and a certificate authority has
        vouched for the mark.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`bimi-logo-${domainId}`}>
            Logo URL (SVG Tiny PS)
          </label>
          <input
            id={`bimi-logo-${domainId}`}
            className="field"
            placeholder={`https://${domainName}/logo.svg`}
            value={logo}
            onChange={(event) => setLogo(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`bimi-cert-${domainId}`}>
            VMC or CMC URL
          </label>
          <input
            id={`bimi-cert-${domainId}`}
            className="field"
            placeholder={`https://${domainName}/vmc.pem`}
            value={cert}
            onChange={(event) => setCert(event.target.value)}
          />
        </div>
      </div>

      {record && (
        <div className="mt-3">
          <p className="label">TXT record</p>
          <p className="font-mono text-[11px] break-all text-[var(--ink-muted)]">
            {bimiRecordName(domainName)}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-[var(--surface)] p-2.5 font-mono text-[11px]">
            {record}
          </pre>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {issues.map((issue) => (
            <li key={issue.message} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden
                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    issue.level === "blocker" ? "var(--danger)" : "var(--warning)",
                }}
              />
              <span className="text-[var(--ink-muted)]">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      <button
        type="button"
        className="btn btn-ghost mt-3 text-xs"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? "Saving" : "Save"}
      </button>
    </div>
  );
}

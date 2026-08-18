"use client";

import { useEffect, useState } from "react";

type Check = { name: string; ok: boolean; detail: string };

export function HealthPanel() {
  const [checks, setChecks] = useState<Check[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch("/api/health");
      if (!response.ok) return;
      const payload = (await response.json()) as { checks?: Check[] };
      if (!cancelled && payload.checks) setChecks(payload.checks);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checks) {
    return <p className="px-8 py-5 text-[13px] text-muted-foreground">Running checks…</p>;
  }

  return (
    <ul className="settings-checks">
      {checks.map((check) => (
        <li key={check.name} className="settings-ledger-row">
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: check.ok ? "var(--success)" : "var(--warning)" }}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{check.name}</p>
            <p className="text-[13px] text-muted-foreground">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

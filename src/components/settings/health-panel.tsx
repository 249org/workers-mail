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
    return <p className="list-frame mt-3 p-4 text-[13px] text-muted-foreground">Running checks…</p>;
  }

  return (
    <ul className="list-frame mt-3">
      {checks.map((check) => (
        <li key={check.name} className="flex items-start gap-3 p-4">
          <span
            aria-hidden
            className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: check.ok ? "var(--success)" : "var(--warning)" }}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{check.name}</p>
            <p className="text-xs text-[var(--ink-muted)]">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

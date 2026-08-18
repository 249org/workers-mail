"use client";

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/format";

type KeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: number | null;
  createdAt: number;
};

const SCOPES = ["mail:read", "mail:send", "admin"];

export function ApiKeyManager() {
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["mail:read"]);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/api-keys");
    if (!response.ok) return;
    const payload = (await response.json()) as { keys: KeyRecord[] };
    setKeys(payload.keys);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError(null);
    const response = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, scopes }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "The key could not be created.");
      return;
    }
    const payload = (await response.json()) as { key: string };
    setIssued(payload.key);
    setName("");
    await load();
  }

  async function revoke(id: string) {
    await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mt-6">
      <div className="panel p-4">
        <label className="label" htmlFor="key-name">
          New key
        </label>
        <div className="flex gap-2">
          <input
            id="key-name"
            className="field"
            placeholder="Deploy script"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            disabled={!name.trim()}
            onClick={() => void create()}
          >
            Create
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(event) =>
                  setScopes(
                    event.target.checked
                      ? [...scopes, scope]
                      : scopes.filter((entry) => entry !== scope),
                  )
                }
              />
              <code className="font-mono">{scope}</code>
            </label>
          ))}
        </div>

        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

        {issued && (
          <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--ink-muted)]">
              Copy this now — it will not be shown again.
            </p>
            <code className="mt-1.5 block font-mono text-xs break-all">{issued}</code>
          </div>
        )}
      </div>

      {keys.length > 0 && (
        <ul className="list-frame mt-4">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  <code className="font-mono">{key.prefix}…</code> · {key.scopes.join(", ")} · last
                  used {formatRelative(key.lastUsedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger shrink-0 !py-1.5 text-xs"
                onClick={() => void revoke(key.id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

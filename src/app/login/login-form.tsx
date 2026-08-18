"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm({ setupNeeded }: { setupNeeded: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch(setupNeeded ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        name: form.get("name"),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Something went wrong. Try again.");
      setPending(false);
      return;
    }

    router.replace("/mail");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-6" style={{ boxShadow: "var(--shadow)" }}>
      {setupNeeded && (
        <div className="mb-4">
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" name="name" className="field" autoComplete="name" />
        </div>
      )}

      <div className="mb-4">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="field"
        />
      </div>

      <div className="mb-5">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={setupNeeded ? 10 : undefined}
          autoComplete={setupNeeded ? "new-password" : "current-password"}
          className="field"
        />
        {setupNeeded && (
          <p className="mt-1.5 text-xs text-[var(--ink-faint)]">At least 10 characters.</p>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Working…" : setupNeeded ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}

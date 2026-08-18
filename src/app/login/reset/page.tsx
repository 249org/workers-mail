"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { BrandLockup } from "@/components/brand/wordmark";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("The passwords do not match.");
      setPending(false);
      return;
    }
    const response = await fetch("/api/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "This reset link could not be used.");
      setPending(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[28rem]">
        <header className="rise-in mb-7 text-center">
          <h1 className="flex justify-center">
            <span className="sr-only">Workers Mail</span>
            <BrandLockup size="lg" />
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">Choose a new password for this workspace.</p>
        </header>
        <form onSubmit={onSubmit} className="rise-in panel relative p-5">
          <span className="reg reg-tl" aria-hidden />
          <span className="reg reg-tr" aria-hidden />
          <span className="reg reg-bl" aria-hidden />
          <span className="reg reg-br" aria-hidden />
          {!token && (
            <p className="mb-3 text-[13px] text-[var(--danger)]">This reset link is missing its token.</p>
          )}
          <div className="mb-3.5">
            <label className="label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              className="field"
            />
            <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">At least 10 characters.</p>
          </div>
          <div className="mb-3.5">
            <label className="label" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              name="confirm"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              className="field"
            />
          </div>
          {error && (
            <p className="mb-3 text-[13px] text-[var(--danger)]">{error}</p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={pending || !token}>
            {pending ? "Saving" : "Save password"}
          </button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoginShell } from "@/components/auth/login-shell";
import { OauthButtons } from "@/components/auth/oauth-buttons";
import { LinkInboxWizard, type ImapDraft } from "@/components/mail/link-inbox-wizard";
import { rememberSavedProfile } from "@/lib/auth/saved-profiles";

export function FirstRun({ encryptionReady }: { encryptionReady: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"start" | "account" | "link">("start");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function connect(draft: ImapDraft) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/mail/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name || draft.displayName,
          address: draft.address,
          password: draft.password,
          loginPassword: password,
          imap: draft.imap,
          smtp: draft.smtp,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "That mailbox could not be connected.");
      }
      rememberSavedProfile(email || draft.address);
      router.replace("/mail");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That mailbox could not be connected.");
      setSubmitting(false);
    }
  }

  if (!encryptionReady) {
    return (
      <LoginShell
        heading="One secret first"
        lede="IMAP passwords are encrypted on this account. Without the key, nothing is stored."
      >
        <p className="text-[13px] text-muted-foreground">
          Set <code className="font-mono text-xs">MAIL_ENCRYPTION_KEY</code>, then reload.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--surface)] p-3 font-mono text-[11px]">
          npx wrangler secret put MAIL_ENCRYPTION_KEY
        </pre>
      </LoginShell>
    );
  }

  if (phase === "start") {
    return (
      <LoginShell
        heading="Get started"
        lede="One click connects Gmail or Outlook. Or link any other IMAP host."
      >
        <OauthButtons intent="setup" google microsoft />
        <p className="login-or">or</p>
        <button type="button" className="btn btn-ghost w-full" onClick={() => setPhase("account")}>
          Use another IMAP account
        </button>
      </LoginShell>
    );
  }

  if (phase === "account") {
    return (
      <LoginShell
        heading="Create your sign-in"
        lede="This password is for Workers Mail — not Gmail, not Outlook. You’ll use it to open the workspace."
      >
        <p className="login-step-index">Step 1 of 2</p>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setPhase("link");
          }}
        >
          <div className="mb-3.5">
            <label className="label" htmlFor="first-name">
              Your name
            </label>
            <input
              id="first-name"
              className="field"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="mb-3.5">
            <label className="label" htmlFor="first-email">
              Email
            </label>
            <input
              id="first-email"
              className="field"
              type="email"
              required
              autoComplete="username"
              placeholder="you@gmail.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Use the address you’ll link in a moment.
            </p>
          </div>
          <div className="mb-3.5">
            <label className="label" htmlFor="first-password">
              Workers Mail password
            </label>
            <input
              id="first-password"
              className="field"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              At least 10 characters. Not your Google password.
            </p>
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Continue
          </button>
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => setPhase("start")}>
            Back
          </button>
        </form>
      </LoginShell>
    );
  }

  return (
    <LoginShell
      heading="Connect your mailbox"
      lede="Your address and password. The mail host is looked up from DNS."
    >
      <p className="login-step-index">Step 2 of 2</p>
      <LinkInboxWizard
        initialAddress={email}
        submitting={submitting}
        error={error}
        submitLabel="Connect inbox"
        onBack={() => {
          setError(null);
          setPhase("account");
        }}
        onSubmit={(draft) => void connect(draft)}
      />
    </LoginShell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ServerSettingsFields,
  type ServerSettings,
} from "@/components/mail/server-settings-fields";
import { tlsForImapPort, tlsForSmtpPort } from "@/lib/transport/presets";

type Props = {
  setupNeeded: boolean;
  encryptionReady: boolean;
};

type Stage = "idle" | "verifying" | "connected";

export function AuthScreen({ setupNeeded, encryptionReady }: Props) {
  const [mode, setMode] = useState<"signin" | "connect">(setupNeeded ? "connect" : "signin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4 py-10">
      <div className="w-full max-w-[28rem]">
        <header className="rise-in mb-7 text-center">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Workers Mail</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
            {setupNeeded
              ? "Connect with your mailbox email, password, and server settings."
              : "Sign in with your mailbox email and password."}
          </p>
        </header>

        {setupNeeded && (
          <div className="rise-in mb-4 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--raised)] p-1">
            <Tab active={mode === "connect"} onClick={() => setMode("connect")}>
              Connect account
            </Tab>
            <Tab active={mode === "signin"} onClick={() => setMode("signin")}>
              Workspace only
            </Tab>
          </div>
        )}

        {mode === "connect" && setupNeeded ? (
          <ConnectForm encryptionReady={encryptionReady} />
        ) : (
          <SignInForm setupNeeded={setupNeeded} />
        )}
      </div>
    </main>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-md px-3 py-1.5 text-[13px]"
      style={{
        background: active ? "var(--selected)" : "transparent",
        color: active ? "var(--accent)" : "var(--ink-muted)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function SignInForm({ setupNeeded }: { setupNeeded: boolean }) {
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
    <form
      onSubmit={onSubmit}
      className="rise-in card p-5"
      style={{ animationDelay: "60ms", boxShadow: "var(--shadow-sm)" }}
    >
      {setupNeeded && (
        <Field label="Your name" htmlFor="name">
          <input id="name" name="name" className="field" autoComplete="name" />
        </Field>
      )}

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="field"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint={setupNeeded ? "At least 10 characters." : undefined}
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={setupNeeded ? 10 : undefined}
          autoComplete={setupNeeded ? "new-password" : "current-password"}
          className="field"
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending}>
        {pending ? "Working" : setupNeeded ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}

function ConnectForm({ encryptionReady }: { encryptionReady: boolean }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [servers, setServers] = useState<ServerSettings>({
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 587,
  });
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("verifying");
    setError(null);

    const response = await fetch("/api/mail/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        address,
        password,
        imap: {
          host: servers.imapHost,
          port: servers.imapPort,
          tls: tlsForImapPort(servers.imapPort),
          username: address,
          password,
        },
        smtp: {
          host: servers.smtpHost,
          port: servers.smtpPort,
          tls: tlsForSmtpPort(servers.smtpPort),
          username: address,
          password,
        },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "That mailbox could not be connected.");
      setStage("idle");
      return;
    }

    setStage("connected");
    // Hold the success state briefly; this screen is seen once, so it can breathe.
    setTimeout(() => {
      router.replace("/mail");
      router.refresh();
    }, 700);
  }

  if (!encryptionReady) {
    return (
      <div className="rise-in card p-5">
        <p className="text-[13px] text-[var(--ink)]">
          Set the <code className="font-mono text-xs">MAIL_ENCRYPTION_KEY</code> secret
          before connecting a mailbox.
        </p>
        <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
          It encrypts stored IMAP credentials. Without it this workspace refuses to hold
          them rather than saving them in the clear.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--surface)] p-3 font-mono text-[11px]">
          npx wrangler secret put MAIL_ENCRYPTION_KEY
        </pre>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rise-in card p-5"
      style={{ animationDelay: "60ms", boxShadow: "var(--shadow-sm)" }}
    >
      <Field label="Email address" htmlFor="address">
        <input
          id="address"
          type="email"
          required
          autoComplete="username"
          placeholder="you@example.com"
          className="field"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>

      <Field
        label="Mailbox password"
        htmlFor="mailbox-password"
        hint="The password you use for webmail. You will sign in to this workspace with the same one."
      >
        <input
          id="mailbox-password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field label="Your name" htmlFor="display-name">
        <input
          id="display-name"
          className="field"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <ServerSettingsFields value={servers} onChange={setServers} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={
          stage !== "idle" || !address || !password || !servers.imapHost || !servers.smtpHost
        }
      >
        {stage === "verifying"
          ? "Verifying connection"
          : stage === "connected"
            ? "Connected"
            : "Connect mailbox"}
      </button>

      <p className="mt-3 text-center text-[12px] text-[var(--ink-faint)]">
        Credentials are checked against your server before anything is saved, then stored
        encrypted. Later sign-in uses this same mailbox password.
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">{hint}</p>}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-3 rounded-md border px-3 py-2 text-[13px]"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--danger)",
      }}
    >
      {children}
    </p>
  );
}

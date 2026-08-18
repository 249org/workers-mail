"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { presetFor, tlsForImapPort, tlsForSmtpPort } from "@/lib/transport/presets";

type Props = {
  setupNeeded: boolean;
  encryptionReady: boolean;
};

type Stage = "idle" | "verifying" | "connected";

export function AuthScreen({ setupNeeded, encryptionReady }: Props) {
  const [mode, setMode] = useState<"signin" | "connect">(setupNeeded ? "connect" : "signin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <header className="rise-in mb-7 text-center">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Workers Mail</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
            {setupNeeded
              ? "Connect a mailbox to finish setting up this workspace."
              : "Sign in to your mail workspace."}
          </p>
        </header>

        {setupNeeded && (
          <div className="rise-in mb-4 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--raised)] p-1">
            <Tab active={mode === "connect"} onClick={() => setMode("connect")}>
              Connect account
            </Tab>
            <Tab active={mode === "signin"} onClick={() => setMode("signin")}>
              Use a password
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
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");

  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [advanced, setAdvanced] = useState(false);
  const [touchedHosts, setTouchedHosts] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const preset = presetFor(address);

  // Fill the hosts from the address until the user overrides them by hand.
  useEffect(() => {
    if (touchedHosts || !preset) return;
    setImapHost(preset.imapHost);
    setImapPort(preset.imapPort);
    setSmtpHost(preset.smtpHost);
    setSmtpPort(preset.smtpPort);
  }, [preset, touchedHosts]);

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
        loginPassword,
        imap: {
          host: imapHost,
          port: imapPort,
          tls: tlsForImapPort(imapPort),
          username: address,
          password,
        },
        smtp: {
          host: smtpHost,
          port: smtpPort,
          tls: tlsForSmtpPort(smtpPort),
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
        {preset && (
          <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">
            Detected {preset.name}. {preset.note ?? ""}
          </p>
        )}
      </Field>

      <Field label="Mailbox password" htmlFor="mailbox-password">
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

      <Field
        label="Sign-in password"
        htmlFor="login-password"
        hint="Used to sign in to this workspace. At least 10 characters."
      >
        <input
          id="login-password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="field"
          value={loginPassword}
          onChange={(event) => setLoginPassword(event.target.value)}
        />
      </Field>

      <button
        type="button"
        className="mb-3 text-[12px] text-[var(--accent)]"
        onClick={() => setAdvanced((open) => !open)}
        aria-expanded={advanced}
      >
        {advanced ? "Hide server settings" : "Server settings"}
      </button>

      {advanced && (
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
          <Field label="IMAP host" htmlFor="imap-host">
            <input
              id="imap-host"
              className="field"
              value={imapHost}
              onChange={(event) => {
                setTouchedHosts(true);
                setImapHost(event.target.value);
              }}
            />
          </Field>
          <Field label="IMAP port" htmlFor="imap-port">
            <select
              id="imap-port"
              className="field"
              value={imapPort}
              onChange={(event) => {
                setTouchedHosts(true);
                setImapPort(Number(event.target.value));
              }}
            >
              <option value={993}>993 · TLS</option>
              <option value={143}>143 · STARTTLS</option>
            </select>
          </Field>
          <Field label="SMTP host" htmlFor="smtp-host">
            <input
              id="smtp-host"
              className="field"
              value={smtpHost}
              onChange={(event) => {
                setTouchedHosts(true);
                setSmtpHost(event.target.value);
              }}
            />
          </Field>
          <Field label="SMTP port" htmlFor="smtp-port">
            <select
              id="smtp-port"
              className="field"
              value={smtpPort}
              onChange={(event) => {
                setTouchedHosts(true);
                setSmtpPort(Number(event.target.value));
              }}
            >
              <option value={587}>587 · STARTTLS</option>
              <option value={465}>465 · TLS</option>
            </select>
          </Field>
          <p className="col-span-2 text-[11px] text-[var(--ink-faint)]">
            Port 25 is blocked on Workers and is not offered.
          </p>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={stage !== "idle" || !address || !password || loginPassword.length < 10}
      >
        {stage === "verifying"
          ? "Verifying connection"
          : stage === "connected"
            ? "Connected"
            : "Connect mailbox"}
      </button>

      <p className="mt-3 text-center text-[12px] text-[var(--ink-faint)]">
        Credentials are checked against your server before anything is saved, then stored
        encrypted.
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

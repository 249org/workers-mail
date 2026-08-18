"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SESSION_TTL_DAYS, type SessionTtlDays } from "@/lib/privacy";
import { describeUserAgent } from "@/lib/auth/user-agent";
import { formatRelative } from "@/lib/format";
import { Field, FormError, PrefRow } from "./fields";

type Account = {
  email: string;
  name: string | null;
  sessionTtlDays: SessionTtlDays;
  totpEnabled: boolean;
  totpEnabledAt: number | null;
};

type SessionRow = {
  id: string;
  createdAt: number;
  userAgent: string;
  ip: string;
  current: boolean;
};

type TotpStatus = {
  enabled: boolean;
  enabledAt: number | null;
  recoveryCodesLeft: number;
};

export function SecurityPanel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const loadAccount = useCallback(async () => {
    const response = await fetch("/api/account");
    if (!response.ok) return;
    const payload = (await response.json()) as Account;
    setAccount(payload);
    setName(payload.name ?? "");
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  async function saveName() {
    setSavingName(true);
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSavingName(false);
    if (!response.ok) {
      toast.error("The name could not be saved.");
      return;
    }
    toast.success("Display name saved.");
    await loadAccount();
  }

  async function saveTtl(days: SessionTtlDays) {
    setAccount((current) => (current ? { ...current, sessionTtlDays: days } : current));
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionTtlDays: days }),
    });
    if (!response.ok) toast.error("Session length could not be saved.");
  }

  return (
    <div>
      <PrefRow
        stack
        title="Account"
        hint="This is the identity you use to open the workspace. It is separate from IMAP mailbox passwords."
      >
        <div className="mt-4 grid max-w-md gap-3">
          <Field label="Email" htmlFor="account-email">
            <input
              id="account-email"
              className="field"
              value={account?.email ?? ""}
              readOnly
              autoComplete="username"
            />
          </Field>
          <Field label="Display name" htmlFor="account-name">
            <div className="flex gap-2">
              <input
                id="account-name"
                className="field"
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary shrink-0"
                disabled={savingName || name.trim() === (account?.name ?? "")}
                onClick={() => void saveName()}
              >
                Save
              </button>
            </div>
          </Field>
        </div>
      </PrefRow>

      <PasswordSection />
      <TotpSection enabled={account?.totpEnabled ?? false} onChanged={() => void loadAccount()} />

      <PrefRow
        title="Stay signed in"
        hint="How long a browser keeps its session after you sign in. Changing this applies the next time you sign in."
      >
        <div className="scheme-toggle" role="radiogroup" aria-label="Session length">
          {SESSION_TTL_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              role="radio"
              aria-checked={account?.sessionTtlDays === days}
              className="scheme-toggle-btn"
              data-active={account?.sessionTtlDays === days ? "true" : undefined}
              onClick={() => void saveTtl(days)}
            >
              {days === 1 ? "1 day" : `${days} days`}
            </button>
          ))}
        </div>
      </PrefRow>

      <SessionsSection />
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/auth/password", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; revoked?: number };
    setPending(false);
    if (!response.ok) {
      setError(payload.error ?? "The password could not be changed.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success(
      payload.revoked
        ? `Password updated. ${payload.revoked} other session${payload.revoked === 1 ? "" : "s"} signed out.`
        : "Password updated.",
    );
  }

  return (
    <PrefRow
      stack
      title="Password"
      hint="Used to open Workers Mail. It does not change the password on your mail server."
    >
      <form
        className="mt-4 grid max-w-md gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Current password" htmlFor="pw-current">
          <input
            id="pw-current"
            type="password"
            className="field"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="pw-next" hint="At least 10 characters.">
          <input
            id="pw-next"
            type="password"
            className="field"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm">
          <input
            id="pw-confirm"
            type="password"
            className="field"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <FormError>{error}</FormError>
        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || !current || next.length < 10}
          >
            {pending ? "Updating" : "Update password"}
          </button>
        </div>
      </form>
    </PrefRow>
  );
}

function TotpSection({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [stage, setStage] = useState<"idle" | "setup" | "recovery" | "disable">("idle");
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/auth/totp");
    if (!response.ok) return;
    setStatus((await response.json()) as TotpStatus);
  }, []);

  useEffect(() => {
    void load();
  }, [load, enabled]);

  async function start() {
    setError(null);
    setPending(true);
    const response = await fetch("/api/auth/totp", { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      secret?: string;
      otpauth?: string;
    };
    setPending(false);
    if (!response.ok || !payload.secret) {
      setError(payload.error ?? "Two-factor setup could not start.");
      return;
    }
    setSecret(payload.secret);
    setOtpauth(payload.otpauth ?? "");
    setCode("");
    setStage("setup");
  }

  async function confirm() {
    setError(null);
    setPending(true);
    const response = await fetch("/api/auth/totp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      recoveryCodes?: string[];
    };
    setPending(false);
    if (!response.ok) {
      setError(payload.error ?? "That code did not match.");
      return;
    }
    setRecovery(payload.recoveryCodes ?? []);
    setStage("recovery");
    setCode("");
    await load();
    onChanged();
  }

  async function disable() {
    setError(null);
    setPending(true);
    const response = await fetch("/api/auth/totp", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, code }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(payload.error ?? "Two-factor authentication could not be turned off.");
      return;
    }
    setStage("idle");
    setPassword("");
    setCode("");
    toast.success("Two-factor authentication is off.");
    await load();
    onChanged();
  }

  async function regenerate() {
    setError(null);
    setPending(true);
    const response = await fetch("/api/auth/totp/recovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      recoveryCodes?: string[];
    };
    setPending(false);
    if (!response.ok) {
      setError(payload.error ?? "Recovery codes could not be rotated.");
      return;
    }
    setRecovery(payload.recoveryCodes ?? []);
    setStage("recovery");
    setCode("");
    await load();
  }

  const on = status?.enabled ?? enabled;

  return (
    <PrefRow
      stack
      title="Two-factor authentication"
      hint="After the password, a six-digit code from an authenticator app is required to sign in."
    >
      <div className="mt-4 max-w-lg">
        {on && stage === "idle" && (
          <p className="mb-3 text-[13px] text-muted-foreground">
            On
            {status?.enabledAt ? ` · ${formatRelative(status.enabledAt)}` : ""}.{" "}
            {status?.recoveryCodesLeft ?? 0} recovery code
            {(status?.recoveryCodesLeft ?? 0) === 1 ? "" : "s"} left.
          </p>
        )}

        {stage === "setup" && (
          <div className="mb-4">
            <p className="text-[13px] text-muted-foreground">
              Add this account in your authenticator, then enter the code it shows.
            </p>
            <p className="totp-secret mt-3" translate="no">
              {groupSecret(secret)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void navigator.clipboard.writeText(secret)}
              >
                Copy setup key
              </button>
              {otpauth && (
                <a href={otpauth} className="btn btn-ghost">
                  Open authenticator
                </a>
              )}
            </div>
            <div className="mt-4">
              <Field label="Authenticator code" htmlFor="totp-confirm">
                <input
                  id="totp-confirm"
                  className="field"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        {stage === "recovery" && (
          <RecoveryCodes
            codes={recovery}
            onDone={() => {
              setStage("idle");
              setRecovery([]);
            }}
          />
        )}

        {stage === "disable" && (
          <form
            className="mb-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void disable();
            }}
          >
            <Field label="Password" htmlFor="totp-off-password">
              <input
                id="totp-off-password"
                type="password"
                className="field"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Authenticator code" htmlFor="totp-off-code">
              <input
                id="totp-off-code"
                className="field"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          </form>
        )}

        {stage === "idle" && on && (
          <div className="mb-3 max-w-xs">
            <Field label="Authenticator code to rotate recovery codes" htmlFor="totp-rotate">
              <input
                id="totp-rotate"
                className="field"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          </div>
        )}

        <FormError>{error}</FormError>

        <div className="mt-3 flex flex-wrap gap-2">
          {stage === "idle" && !on && (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void start()}>
              {pending ? "Starting" : "Turn on"}
            </button>
          )}
          {stage === "setup" && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || code.replace(/\s/g, "").length !== 6}
                onClick={() => void confirm()}
              >
                {pending ? "Checking" : "Confirm"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setStage("idle");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </>
          )}
          {stage === "idle" && on && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending || code.replace(/\s/g, "").length !== 6}
                onClick={() => void regenerate()}
              >
                New recovery codes
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setError(null);
                  setCode("");
                  setStage("disable");
                }}
              >
                Turn off
              </button>
            </>
          )}
          {stage === "disable" && (
            <>
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending || !password}
                onClick={() => void disable()}
              >
                {pending ? "Turning off" : "Turn off two-factor"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setStage("idle");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </PrefRow>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="mb-4">
      <p className="text-[13px] text-muted-foreground">
        Save these recovery codes somewhere offline. Each one signs in once if you lose the
        authenticator.
      </p>
      <ul className="recovery-grid mt-3">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}
        >
          Copy codes
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          I have saved them
        </button>
      </div>
    </div>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch("/api/auth/sessions");
    if (!response.ok) return;
    const payload = (await response.json()) as { sessions: SessionRow[] };
    setSessions(payload.sessions);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revokeOthers() {
    setPending(true);
    const response = await fetch("/api/auth/sessions", { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      toast.error("Other sessions could not be signed out.");
      return;
    }
    toast.success("Other sessions signed out.");
    await load();
  }

  return (
    <PrefRow
      stack
      title="Sessions"
      hint="Each signed-in browser is listed here. Signing out others keeps this one."
    >
      <div className="mt-4">
        {sessions.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">This is the only session on record.</p>
        ) : (
          <ul className="settings-ledger settings-ledger-sessions">
            {sessions.map((session) => (
              <li key={session.id} className="settings-ledger-row">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {describeUserAgent(session.userAgent)}
                    {session.current ? " · this browser" : ""}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Signed in {formatRelative(Math.floor(session.createdAt / 1000))}
                    {session.ip && session.ip !== "unknown" ? ` · ${session.ip}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {sessions.some((session) => !session.current) && (
          <button
            type="button"
            className="btn btn-ghost mt-3"
            disabled={pending}
            onClick={() => void revokeOthers()}
          >
            {pending ? "Signing out" : "Sign out other sessions"}
          </button>
        )}
      </div>
    </PrefRow>
  );
}

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

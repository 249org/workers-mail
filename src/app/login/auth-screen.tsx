"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FirstRun } from "@/components/auth/first-run";
import { LoginShell } from "@/components/auth/login-shell";
import { OauthButtons } from "@/components/auth/oauth-buttons";
import { MailIcon } from "@/components/mail/icons";
import {
  forgetSavedProfile,
  readSavedProfiles,
  rememberSavedProfile,
  type SavedProfile,
} from "@/lib/auth/saved-profiles";

type Props = {
  setupNeeded: boolean;
  encryptionReady: boolean;
  oauth: { google: boolean; microsoft: boolean };
};

export function AuthScreen({ setupNeeded, encryptionReady, oauth }: Props) {
  if (setupNeeded) return <FirstRun encryptionReady={encryptionReady} />;

  return (
    <LoginShell
      heading="Sign in"
      lede="One click for Google or Microsoft. Or use your Workers Mail password."
    >
      <SignInForm oauth={oauth} />
    </LoginShell>
  );
}

function SignInForm({ oauth }: { oauth: { google: boolean; microsoft: boolean } }) {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "totp" | "forgot" | "forgot-sent">("credentials");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [remember, setRemember] = useState(true);
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [another, setAnother] = useState(false);

  useEffect(() => {
    setProfiles(readSavedProfiles());
    const message = new URLSearchParams(window.location.search).get("oauth_error");
    if (message) setError(message);
  }, []);

  function finish(signedInEmail: string) {
    if (remember) setProfiles(rememberSavedProfile(signedInEmail));
    else setProfiles(forgetSavedProfile(signedInEmail));
    router.replace("/mail");
    router.refresh();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") ?? "").trim().toLowerCase();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: submittedEmail,
        password: form.get("password"),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      requiresTwoFactor?: boolean;
      challenge?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Something went wrong. Try again.");
      setPending(false);
      return;
    }

    if (payload.requiresTwoFactor && payload.challenge) {
      setChallenge(payload.challenge);
      setEmail(submittedEmail);
      setStep("totp");
      setPending(false);
      return;
    }

    finish(submittedEmail);
  }

  async function verifyTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/auth/login/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge, code }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "That code was not recognised.");
      setPending(false);
      return;
    }
    finish(email);
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    });
    setPending(false);
    setStep("forgot-sent");
  }

  if (step === "forgot" || step === "forgot-sent") {
    return (
      <form onSubmit={requestReset}>
        {step === "forgot-sent" ? (
          <p className="text-[13px]">
            If that account exists, a reset link is on its way. Check the inbox for this address.
          </p>
        ) : (
          <>
            <p className="mb-4 text-[13px] text-muted-foreground">
              We will send a reset link to the address you sign in with.
            </p>
            <Field label="Email" htmlFor="reset-email">
              <input
                id="reset-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="field"
                defaultValue={email || picked || ""}
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending}>
              {pending ? "Sending" : "Send reset link"}
            </button>
          </>
        )}
        <button
          type="button"
          className="mt-3 w-full text-center text-[13px] text-muted-foreground hover:underline"
          onClick={() => {
            setStep("credentials");
            setError(null);
          }}
        >
          Back to sign in
        </button>
      </form>
    );
  }

  if (step === "totp") {
    return (
      <form onSubmit={verifyTwoFactor}>
        <p className="mb-4 text-[13px] text-muted-foreground">
          {recovery
            ? "Enter one of your recovery codes."
            : "Enter the six-digit code from your authenticator."}
        </p>
        <Field label={recovery ? "Recovery code" : "Authenticator code"} htmlFor="totp-code">
          <input
            id="totp-code"
            className="field"
            autoComplete={recovery ? "off" : "one-time-code"}
            inputMode={recovery ? "text" : "numeric"}
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending || !code.trim()}>
          {pending ? "Checking" : "Sign in"}
        </button>
        <button
          type="button"
          className="mt-3 w-full text-center text-[13px] text-muted-foreground hover:underline"
          onClick={() => {
            setRecovery((value) => !value);
            setCode("");
            setError(null);
          }}
        >
          {recovery ? "Use authenticator code" : "Use a recovery code"}
        </button>
        <button
          type="button"
          className="mt-2 w-full text-center text-[13px] text-muted-foreground hover:underline"
          onClick={() => {
            setStep("credentials");
            setCode("");
            setError(null);
          }}
        >
          Back
        </button>
      </form>
    );
  }

  const showPicker = profiles.length > 0 && !another && !picked;

  if (showPicker) {
    return (
      <div>
        <OauthButtons intent="login" google microsoft />
        <p className="login-or">or</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <ul className="login-profiles">
          {profiles.map((profile, index) => (
            <li key={profile.email}>
              <button
                type="button"
                className="login-profile"
                onClick={() => {
                  setPicked(profile.email);
                  setEmail(profile.email);
                  setError(null);
                }}
              >
                <span className="login-profile-mark">
                  <MailIcon name="mailbox" />
                </span>
                <span className="login-profile-email">{profile.email}</span>
                {index === 0 ? <span className="login-last-used">Last used</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className="login-or">or</p>
        <button
          type="button"
          className="login-another"
          onClick={() => {
            setAnother(true);
            setPicked(null);
            setEmail("");
          }}
        >
          Sign in with another email →
        </button>
      </div>
    );
  }

  const lockedEmail = picked;

  return (
    <form onSubmit={onSubmit}>
      {!lockedEmail ? (
        <>
          <OauthButtons intent="login" google microsoft />
          <p className="login-or">or</p>
        </>
      ) : null}
      {lockedEmail ? (
        <div className="mb-3.5">
          <p className="label">Email</p>
          <div className="login-locked-email">
            <span className="login-profile-mark">
              <MailIcon name="mailbox" />
            </span>
            <span className="min-w-0 truncate">{lockedEmail}</span>
          </div>
          <input type="hidden" name="email" value={lockedEmail} />
        </div>
      ) : (
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
      )}

      <Field label="Workers Mail password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
          autoFocus={Boolean(lockedEmail)}
        />
      </Field>

      <label className="login-remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        Remember this email on this device
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}

      <button type="submit" className="btn btn-primary mt-3 w-full" disabled={pending}>
        {pending ? "Working" : "Sign in"}
      </button>

      <div className="mt-3 flex flex-col gap-2">
        {lockedEmail || another ? (
          <button
            type="button"
            className="w-full text-center text-[13px] text-muted-foreground hover:underline"
            onClick={() => {
              setPicked(null);
              setAnother(false);
              setEmail("");
              setError(null);
            }}
          >
            ← View saved profiles
          </button>
        ) : null}
        <button
          type="button"
          className="w-full text-center text-[13px] text-muted-foreground hover:underline"
          onClick={() => {
            setStep("forgot");
            setError(null);
          }}
        >
          Forgot password
        </button>
      </div>
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
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
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

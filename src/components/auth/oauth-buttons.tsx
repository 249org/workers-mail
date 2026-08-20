import { GoogleMark, MicrosoftMark } from "@/components/mail/provider-marks";

export function OauthButtons({
  intent,
  google,
  microsoft,
  returnTo,
}: {
  intent: "setup" | "login" | "link";
  google: boolean;
  microsoft: boolean;
  returnTo?: string;
}) {
  if (!google && !microsoft) return null;
  const extra = returnTo ? `&return=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="oauth-stack">
      {google ? (
        <a className="kind-choice oauth-choice" href={`/api/oauth/google?intent=${intent}${extra}`}>
          <span className="kind-choice-mark" aria-hidden>
            <GoogleMark />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Continue with Google</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">One click. No app password.</span>
          </span>
        </a>
      ) : null}
      {microsoft ? (
        <a className="kind-choice oauth-choice" href={`/api/oauth/microsoft?intent=${intent}${extra}`}>
          <span className="kind-choice-mark" aria-hidden>
            <MicrosoftMark />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Continue with Microsoft</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">Outlook, Hotmail, and Microsoft 365.</span>
          </span>
        </a>
      ) : null}
    </div>
  );
}

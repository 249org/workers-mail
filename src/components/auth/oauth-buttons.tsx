import { GoogleMark } from "@/components/mail/provider-marks";

export function OauthButtons({
  intent,
  google,
  returnTo,
}: {
  intent: "setup" | "login" | "link";
  google: boolean;
  returnTo?: string;
}) {
  if (!google) return null;
  const extra = returnTo ? `&return=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="oauth-stack">
      <a className="kind-choice oauth-choice" href={`/api/oauth/google?intent=${intent}${extra}`}>
        <span className="kind-choice-mark" aria-hidden>
          <GoogleMark />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">Continue with Google</span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">One click. No app password.</span>
        </span>
      </a>
    </div>
  );
}

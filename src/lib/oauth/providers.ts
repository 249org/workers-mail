import { randomToken } from "@/lib/ids";
import { hostsForEasyProvider, type EasyProviderId, type TransportHosts } from "@/lib/transport/presets";

export type OauthProviderId = "google" | "microsoft";

export type OauthProfile = {
  email: string;
  name: string | null;
};

export type OauthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  idToken?: string;
};

export type OauthIntent = "setup" | "login" | "link";

export type OauthState = {
  provider: OauthProviderId;
  intent: OauthIntent;
  verifier: string;
  userId?: string;
  returnTo: string;
};

type ProviderConfig = {
  id: OauthProviderId;
  easyId: EasyProviderId;
  authorize: string;
  token: string;
  scopes: string[];
  clientId: (env: CloudflareEnv) => string | undefined;
  clientSecret: (env: CloudflareEnv) => string | undefined;
};

const PROVIDERS: Record<OauthProviderId, ProviderConfig> = {
  google: {
    id: "google",
    easyId: "gmail",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile", "https://mail.google.com/"],
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    clientSecret: (env) => env.GOOGLE_CLIENT_SECRET,
  },
  microsoft: {
    id: "microsoft",
    easyId: "outlook",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "offline_access",
      "openid",
      "email",
      "profile",
      "https://outlook.office.com/IMAP.AccessAsUser.All",
      "https://outlook.office.com/SMTP.Send",
    ],
    clientId: (env) => env.MICROSOFT_CLIENT_ID,
    clientSecret: (env) => env.MICROSOFT_CLIENT_SECRET,
  },
};

export function oauthProvider(id: OauthProviderId): ProviderConfig {
  return PROVIDERS[id];
}

export function oauthReady(env: CloudflareEnv, id: OauthProviderId): boolean {
  const provider = PROVIDERS[id];
  return Boolean(provider.clientId(env)?.trim() && provider.clientSecret(env)?.trim());
}

export function oauthAvailability(env: CloudflareEnv): {
  google: boolean;
  microsoft: boolean;
} {
  return { google: oauthReady(env, "google"), microsoft: oauthReady(env, "microsoft") };
}

export function hostsForOauth(id: OauthProviderId): TransportHosts {
  return hostsForEasyProvider(PROVIDERS[id].easyId);
}

export function redirectUri(origin: string, id: OauthProviderId): string {
  return `${origin}/api/oauth/${id}/callback`;
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function authorizeUrl(
  env: CloudflareEnv,
  origin: string,
  state: OauthState,
  stateKey: string,
  challenge: string,
): string {
  const provider = PROVIDERS[state.provider];
  const clientId = provider.clientId(env)?.trim();
  if (!clientId) throw new Error(`${state.provider} sign-in is not configured.`);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin, state.provider),
    response_type: "code",
    scope: provider.scopes.join(" "),
    state: stateKey,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (state.provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  }
  if (state.provider === "microsoft") {
    params.set("response_mode", "query");
  }
  return `${provider.authorize}?${params.toString()}`;
}

export async function exchangeCode(
  env: CloudflareEnv,
  origin: string,
  providerId: OauthProviderId,
  code: string,
  verifier: string,
): Promise<OauthTokenSet> {
  const provider = PROVIDERS[providerId];
  const clientId = provider.clientId(env)?.trim();
  const clientSecret = provider.clientSecret(env)?.trim();
  if (!clientId || !clientSecret) throw new Error(`${providerId} sign-in is not configured.`);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin, providerId),
  });

  const response = await fetch(provider.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Token exchange failed.");
  }
  if (!payload.refresh_token) {
    throw new Error("The provider did not return a refresh token. Grant mail access and try again.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    idToken: payload.id_token,
  };
}

export async function refreshAccessToken(
  env: CloudflareEnv,
  providerId: OauthProviderId,
  refreshToken: string,
): Promise<OauthTokenSet> {
  const provider = PROVIDERS[providerId];
  const clientId = provider.clientId(env)?.trim();
  const clientSecret = provider.clientSecret(env)?.trim();
  if (!clientId || !clientSecret) throw new Error(`${providerId} sign-in is not configured.`);

  const response = await fetch(provider.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Could not refresh the mail token.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || refreshToken,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
}

export async function fetchProfile(
  providerId: OauthProviderId,
  accessToken: string,
  idToken?: string,
): Promise<OauthProfile> {
  const fromId = idToken ? profileFromIdToken(idToken) : null;
  if (fromId) return fromId;

  if (providerId === "google") {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
    };
    if (!response.ok || !payload.email) throw new Error("Google did not return an email address.");
    return { email: payload.email.toLowerCase(), name: payload.name?.trim() || null };
  }

  throw new Error("Microsoft did not return an email address.");
}

export function profileFromIdToken(idToken: string): OauthProfile | null {
  const segment = idToken.split(".")[1];
  if (!segment) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (segment.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as {
      email?: string;
      preferred_username?: string;
      name?: string;
    };
    const email = (payload.email || payload.preferred_username || "").trim().toLowerCase();
    if (!email.includes("@")) return null;
    return { email, name: payload.name?.trim() || null };
  } catch {
    return null;
  }
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/mail";
  }
  return value;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

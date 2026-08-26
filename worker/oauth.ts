import { eq } from "drizzle-orm";
import { ApiError, errorResponse } from "@/lib/auth/api";
import {
  createSession,
  findUserByEmail,
  hasAnyUser,
  readCookie,
  resolveSession,
  SESSION_COOKIE,
  sessionCookie,
} from "@/lib/auth/session";
import { hashPassword } from "@/lib/crypto";
import { createDb } from "@/lib/db";
import { mailboxes, users } from "@/lib/db/schema";
import { newId, randomToken } from "@/lib/ids";
import { isEmailAddress, normalizeAddress } from "@/lib/mail/address";
import { ensureDefaultFolders } from "@/lib/mail/mailboxes";
import {
  authorizeUrl,
  createPkce,
  exchangeCode,
  fetchProfile,
  hostsForOauth,
  oauthReady,
  redirectUri,
  safeReturnTo,
  type OauthIntent,
  type OauthProviderId,
  type OauthState,
} from "@/lib/oauth/providers";
import { encryptOauthTokens } from "@/lib/oauth/tokens";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { testImapConnection } from "@/lib/transport/imap";
import { testSmtpConnection } from "@/lib/transport/smtp";
import { tlsForImapPort, tlsForSmtpPort } from "@/lib/transport/presets";

const STATE_TTL = 600;

export async function handleOauthStart(
  request: Request,
  env: CloudflareEnv,
  provider: OauthProviderId,
): Promise<Response> {
  const url = new URL(request.url);
  const intent = parseIntent(url.searchParams.get("intent"));
  // Linking happens from inside the app, so failures belong on the page it started from.
  const failTo = intent === "link" ? safeReturnTo(url.searchParams.get("return")) : undefined;

  try {
    const limit = await rateLimit(env.SESSION_STORE, clientKey(request, `oauth:${provider}`), 12, 300);
    if (!limit.allowed) {
      return oauthRedirect(request, "Too many sign-in attempts. Try again shortly.", failTo);
    }
    if (!oauthReady(env, provider)) {
      return oauthRedirect(
        request,
        `${label(provider)} sign-in is not configured. Register an OAuth app and set its client id and secret. Redirect URI: ${redirectUri(url.origin, provider)}`,
        failTo,
      );
    }
    if (!env.MAIL_ENCRYPTION_KEY) {
      return oauthRedirect(request, "Set MAIL_ENCRYPTION_KEY before connecting a mailbox.", failTo);
    }

    const sessionUser = await resolveSession(env, readCookie(request.headers.get("cookie"), SESSION_COOKIE));
    if (intent === "link" && !sessionUser) {
      return oauthRedirect(request, "Sign in first, then connect a mailbox.");
    }

    const { verifier, challenge } = await createPkce();
    const stateKey = randomToken(24);
    const state: OauthState = {
      provider,
      intent,
      verifier,
      userId: sessionUser?.id,
      returnTo: safeReturnTo(url.searchParams.get("return")),
    };
    await env.SESSION_STORE.put(`oauth-state:${stateKey}`, JSON.stringify(state), {
      expirationTtl: STATE_TTL,
    });

    const location = authorizeUrl(env, url.origin, state, stateKey, challenge);
    return Response.redirect(location, 302);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleOauthCallback(
  request: Request,
  env: CloudflareEnv,
  provider: OauthProviderId,
): Promise<Response> {
  const url = new URL(request.url);
  // Where a failure should report. Only known once the state is read, so it starts unset.
  let failTo: string | undefined;
  const denied = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (denied) return oauthRedirect(request, denied);

  try {
    const stateKey = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!stateKey || !code) throw new ApiError(400, "This sign-in link is missing its code.");

    const raw = await env.SESSION_STORE.get(`oauth-state:${stateKey}`);
    await env.SESSION_STORE.delete(`oauth-state:${stateKey}`);
    if (!raw) throw new ApiError(400, "This sign-in expired. Try again.");
    const state = JSON.parse(raw) as OauthState;
    if (state.intent === "link") failTo = state.returnTo;
    if (state.provider !== provider) throw new ApiError(400, "This sign-in was started with a different provider.");

    const tokens = await exchangeCode(env, url.origin, provider, code, state.verifier);
    const profile = await fetchProfile(provider, tokens.accessToken, tokens.idToken);
    const address = normalizeAddress(profile.email);
    if (!isEmailAddress(address)) throw new ApiError(400, "That account did not return a valid email address.");

    const hosts = hostsForOauth(provider);
    await testImapConnection({
      hostname: hosts.imapHost,
      port: hosts.imapPort,
      tls: tlsForImapPort(hosts.imapPort),
      username: address,
      password: tokens.accessToken,
      mechanism: "xoauth2",
    }).catch((error: unknown) => {
      throw new ApiError(502, `Mail access was granted, but IMAP failed: ${describe(error)}`);
    });
    await testSmtpConnection({
      hostname: hosts.smtpHost,
      port: hosts.smtpPort,
      tls: tlsForSmtpPort(hosts.smtpPort),
      username: address,
      password: tokens.accessToken,
      mechanism: "xoauth2",
    }).catch((error: unknown) => {
      throw new ApiError(502, `Mail access was granted, but SMTP failed: ${describe(error)}`);
    });

    const db = createDb(env.DB);
    const existingUser = await findUserByEmail(db, address);
    const anyone = await hasAnyUser(db);
    const sessionUser = state.userId
      ? await resolveSession(env, readCookie(request.headers.get("cookie"), SESSION_COOKIE))
      : null;

    let userId: string;
    let returnTo = state.returnTo;

    if (state.intent === "link") {
      if (!sessionUser) throw new ApiError(401, "Sign in first, then connect a mailbox.");
      userId = sessionUser.id;
      returnTo = state.returnTo === "/mail" ? "/settings/mailboxes" : state.returnTo;
    } else if (state.intent === "setup" || !anyone) {
      if (anyone) {
        if (!existingUser) {
          throw new ApiError(403, "This workspace is already set up. Sign in, then link the mailbox.");
        }
        userId = existingUser.id;
      } else {
        userId = newId("usr");
        await db.insert(users).values({
          id: userId,
          email: address,
          name: profile.name,
          passwordHash: await hashPassword(randomToken(32)),
          role: "admin",
        });
      }
    } else {
      if (!existingUser) {
        throw new ApiError(
          403,
          "No Workers Mail account for that address. Sign in, then connect it from Settings → Mailboxes.",
        );
      }
      userId = existingUser.id;
    }

    await upsertOauthMailbox(env, db, {
      ownerId: userId,
      address,
      displayName: profile.name,
      provider,
      tokens,
    });

    const session = await createSession(env.SESSION_STORE, userId);
    return new Response(null, {
      status: 302,
      headers: {
        location: returnTo,
        "set-cookie": sessionCookie(
          session.token,
          session.maxAge,
          url.protocol === "https:",
        ),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return oauthRedirect(request, error.message, failTo);
    console.error("oauth callback failed", error);
    return oauthRedirect(
      request,
      error instanceof Error ? error.message : "Sign-in failed.",
      failTo,
    );
  }
}

export function parseOauthProvider(pathname: string): {
  provider: OauthProviderId;
  callback: boolean;
} | null {
  const match = pathname.match(/^\/api\/oauth\/(google|microsoft)(\/callback)?$/);
  if (!match) return null;
  return { provider: match[1] as OauthProviderId, callback: Boolean(match[2]) };
}

async function upsertOauthMailbox(
  env: CloudflareEnv,
  db: ReturnType<typeof createDb>,
  input: {
    ownerId: string;
    address: string;
    displayName: string | null;
    provider: OauthProviderId;
    tokens: Parameters<typeof encryptOauthTokens>[0];
  },
): Promise<void> {
  const hosts = hostsForOauth(input.provider);
  const tokenBlob = await encryptOauthTokens(input.tokens, env.MAIL_ENCRYPTION_KEY);
  const existing = await db
    .select({ id: mailboxes.id, ownerId: mailboxes.ownerId })
    .from(mailboxes)
    .where(eq(mailboxes.address, input.address))
    .limit(1);
  const row = existing[0];
  if (row && row.ownerId !== input.ownerId) {
    throw new ApiError(409, "That address already has a mailbox on this workspace.");
  }

  const fields = {
    displayName: input.displayName,
    type: "external_imap" as const,
    imapHost: hosts.imapHost,
    imapPort: hosts.imapPort,
    imapTls: tlsForImapPort(hosts.imapPort),
    imapUser: input.address,
    imapPassword: null,
    smtpHost: hosts.smtpHost,
    smtpPort: hosts.smtpPort,
    smtpTls: tlsForSmtpPort(hosts.smtpPort),
    smtpUser: input.address,
    smtpPassword: null,
    oauthProvider: input.provider,
    oauthTokens: tokenBlob,
    syncError: null,
    syncState: "idle" as const,
  };

  let mailboxId = row?.id;
  if (mailboxId) {
    await db.update(mailboxes).set(fields).where(eq(mailboxes.id, mailboxId));
  } else {
    mailboxId = newId("mbx");
    await db.insert(mailboxes).values({
      id: mailboxId,
      ownerId: input.ownerId,
      address: input.address,
      ...fields,
    });
    await ensureDefaultFolders(db, mailboxId);
  }

  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
  void stub.poke({ backfill: true, mailboxId }).catch((error) => {
    console.error("oauth mailbox poke failed", {
      mailboxId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function parseIntent(value: string | null): OauthIntent {
  if (value === "setup" || value === "link" || value === "login") return value;
  return "login";
}

/**
 * /login sends a signed-in user straight to their mail, so reporting a failed link
 * there loses the message. Anything started from inside the app reports where it began.
 */
function oauthRedirect(request: Request, message: string, returnTo?: string): Response {
  const url = new URL(returnTo ?? "/login", request.url);
  url.searchParams.set("oauth_error", message.slice(0, 280));
  return Response.redirect(url.toString(), 302);
}

function label(provider: OauthProviderId): string {
  return provider === "google" ? "Google" : "Microsoft";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

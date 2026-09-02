import { createDb } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/crypto";
import {
  createSession,
  findUserByEmail,
  sessionCookie,
  ttlForUser,
} from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isSecureRequest, sessionMeta } from "@/lib/auth/user-agent";
import { randomToken } from "@/lib/ids";

type LoginBody = { email?: string; password?: string };

/** A real PBKDF2 hash of a value nobody holds, so a miss costs what a hit costs. */
const DECOY_HASH =
  "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function POST(request: Request): Promise<Response> {
  const cloudflare = env();
  const limit = await rateLimit(cloudflare.SESSION_STORE, clientKey(request, "login"), 10, 300);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const db = createDb(cloudflare.DB);
  const user = await findUserByEmail(db, email);
  /*
   * An unknown address used to skip the hash entirely and answer in a fraction of the
   * time, which told anyone watching the clock whether an account existed. The check runs
   * either way now, against a throwaway hash when there is nobody to check against.
   */
  const valid = await verifyPassword(password, user?.passwordHash ?? DECOY_HASH);
  if (!user || !valid) {
    return Response.json({ error: "Those credentials did not match." }, { status: 401 });
  }

  if (user.totpSecret && user.totpEnabledAt) {
    const challenge = randomToken(24);
    await cloudflare.SESSION_STORE.put(
      `totp-login:${challenge}`,
      JSON.stringify({ userId: user.id }),
      { expirationTtl: 300 },
    );
    return Response.json({ requiresTwoFactor: true, challenge });
  }

  const meta = sessionMeta(request);
  const session = await createSession(cloudflare.SESSION_STORE, user.id, {
    maxAge: ttlForUser(user.sessionTtlDays),
    ...meta,
  });
  return Response.json(
    { ok: true },
    {
      headers: {
        "set-cookie": sessionCookie(session.token, session.maxAge, isSecureRequest(request)),
      },
    },
  );
}

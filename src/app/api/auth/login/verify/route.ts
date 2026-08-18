import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { createSession, sessionCookie, ttlForUser } from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isSecureRequest, sessionMeta } from "@/lib/auth/user-agent";
import { consumeRecoveryCode, verifyTotp } from "@/lib/auth/totp";

type Body = { challenge?: string; code?: string };

export async function POST(request: Request): Promise<Response> {
  const cloudflare = env();
  const limit = await rateLimit(cloudflare.SESSION_STORE, clientKey(request, "totp"), 20, 300);
  if (!limit.allowed) {
    return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const challenge = body.challenge?.trim();
  const code = body.code?.trim() ?? "";
  if (!challenge || !code) {
    return Response.json({ error: "Enter the authenticator code." }, { status: 400 });
  }

  const raw = await cloudflare.SESSION_STORE.get(`totp-login:${challenge}`);
  if (!raw) {
    return Response.json(
      { error: "That sign-in step expired. Enter your password again." },
      { status: 401 },
    );
  }

  const { userId } = JSON.parse(raw) as { userId: string };
  const db = createDb(cloudflare.DB);
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user?.totpSecret || !cloudflare.MAIL_ENCRYPTION_KEY) {
    return Response.json({ error: "Two-factor authentication is not available." }, { status: 400 });
  }

  const secret = await decryptSecret(user.totpSecret, cloudflare.MAIL_ENCRYPTION_KEY);
  const totpOk = await verifyTotp(secret, code);
  let remaining = user.recoveryCodes ?? [];
  if (!totpOk) {
    const next = await consumeRecoveryCode(remaining, code);
    if (!next) {
      return Response.json({ error: "That code was not recognised." }, { status: 401 });
    }
    remaining = next;
    await db.update(users).set({ recoveryCodes: remaining }).where(eq(users.id, user.id));
  }

  await cloudflare.SESSION_STORE.delete(`totp-login:${challenge}`);
  const session = await createSession(cloudflare.SESSION_STORE, user.id, {
    maxAge: ttlForUser(user.sessionTtlDays),
    ...sessionMeta(request),
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

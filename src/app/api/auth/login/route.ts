import { createDb } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/crypto";
import { createSession, findUserByEmail, sessionCookie } from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";

type LoginBody = { email?: string; password?: string };

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
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return Response.json({ error: "Those credentials did not match." }, { status: 401 });
  }

  const session = await createSession(cloudflare.SESSION_STORE, user.id);
  return Response.json(
    { ok: true },
    {
      headers: {
        "set-cookie": sessionCookie(session.token, session.maxAge, isSecure(request)),
      },
    },
  );
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

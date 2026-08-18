import { createDb } from "@/lib/db";
import { env } from "@/lib/env";
import { findUserByEmail } from "@/lib/auth/session";
import { issuePasswordReset, sendResetEmail } from "@/lib/auth/password-reset";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isEmailAddress } from "@/lib/mail/address";

type Body = { email?: string };

export async function POST(request: Request): Promise<Response> {
  const cloudflare = env();
  const limit = await rateLimit(cloudflare.SESSION_STORE, clientKey(request, "forgot"), 5, 900);
  if (!limit.allowed) {
    return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase() ?? "";
  const generic = {
    ok: true,
    message: "If that account exists, a reset link is on its way.",
  };

  if (!isEmailAddress(email)) return Response.json(generic);

  const db = createDb(cloudflare.DB);
  const user = await findUserByEmail(db, email);
  if (!user) return Response.json(generic);

  const token = await issuePasswordReset(cloudflare.SESSION_STORE, user.id);
  const origin = new URL(request.url).origin;
  await sendResetEmail(cloudflare, db, user.id, user.email, `${origin}/login/reset?token=${token}`);
  return Response.json(generic);
}

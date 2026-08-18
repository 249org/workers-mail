import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/crypto";
import { passwordIssue } from "@/lib/auth/password";
import { consumePasswordReset } from "@/lib/auth/password-reset";
import { revokeOtherSessions } from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";

type Body = { token?: string; password?: string };

export async function POST(request: Request): Promise<Response> {
  const cloudflare = env();
  const limit = await rateLimit(cloudflare.SESSION_STORE, clientKey(request, "reset"), 8, 900);
  if (!limit.allowed) {
    return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const token = body.token?.trim() ?? "";
  const password = body.password ?? "";
  const issue = passwordIssue(password);
  if (!token) return Response.json({ error: "This reset link is missing its token." }, { status: 400 });
  if (issue) return Response.json({ error: issue }, { status: 400 });

  const userId = await consumePasswordReset(cloudflare.SESSION_STORE, token);
  if (!userId) {
    return Response.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const db = createDb(cloudflare.DB);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
  await revokeOtherSessions(cloudflare.SESSION_STORE, userId, undefined);
  return Response.json({ ok: true });
}

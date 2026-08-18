import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { passwordIssue } from "@/lib/auth/password";
import { readCookie, revokeOtherSessions, SESSION_COOKIE } from "@/lib/auth/session";

type Body = { current?: string; next?: string };

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<Body>(request);
    const current = body.current ?? "";
    const next = body.next ?? "";
    const issue = passwordIssue(next);
    if (issue) throw new ApiError(400, issue);

    const rows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const stored = rows[0];
    if (!stored || !(await verifyPassword(current, stored.passwordHash))) {
      throw new ApiError(401, "Current password did not match.");
    }
    if (current === next) {
      throw new ApiError(400, "Choose a password that is different from the current one.");
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(users.id, user.id));

    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    const revoked = await revokeOtherSessions(env.SESSION_STORE, user.id, token);
    return Response.json({ ok: true, revoked });
  } catch (error) {
    return errorResponse(error);
  }
}

import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { users } from "@/lib/db/schema";
import { parsePrivacy, parseSessionTtlDays, type SessionTtlDays } from "@/lib/privacy";

type PatchBody = { name?: string; sessionTtlDays?: SessionTtlDays };

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const rows = await db
      .select({
        email: users.email,
        name: users.name,
        sessionTtlDays: users.sessionTtlDays,
        totpEnabledAt: users.totpEnabledAt,
        createdAt: users.createdAt,
        privacyPrefs: users.privacyPrefs,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ApiError(401, "Not signed in");
    return Response.json({
      email: row.email,
      name: row.name,
      sessionTtlDays: parseSessionTtlDays(row.sessionTtlDays),
      totpEnabled: Boolean(row.totpEnabledAt),
      totpEnabledAt: row.totpEnabledAt,
      createdAt: row.createdAt,
      privacy: parsePrivacy(row.privacyPrefs),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const body = await readJson<PatchBody>(request);
    const patch: { name?: string | null; sessionTtlDays?: number } = {};
    if (typeof body.name === "string") {
      patch.name = body.name.trim().slice(0, 80) || null;
    }
    if (body.sessionTtlDays !== undefined) {
      patch.sessionTtlDays = parseSessionTtlDays(body.sessionTtlDays);
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update.");

    await db.update(users).set(patch).where(eq(users.id, user.id));
    return Response.json({ ok: true, ...patch });
  } catch (error) {
    return errorResponse(error);
  }
}

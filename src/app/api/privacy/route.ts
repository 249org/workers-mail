import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { users } from "@/lib/db/schema";
import { parsePrivacy, type PrivacyPrefs } from "@/lib/privacy";

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const rows = await db
      .select({ privacyPrefs: users.privacyPrefs })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return Response.json({ prefs: parsePrivacy(rows[0]?.privacyPrefs) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const body = await readJson<{ prefs?: unknown }>(request);
    const prefs: PrivacyPrefs = parsePrivacy(body.prefs);
    await db.update(users).set({ privacyPrefs: prefs }).where(eq(users.id, user.id));
    return Response.json({ prefs });
  } catch (error) {
    return errorResponse(error);
  }
}

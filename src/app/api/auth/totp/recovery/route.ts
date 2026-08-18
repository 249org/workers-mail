import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { users } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { generateRecoveryCodes, verifyTotp } from "@/lib/auth/totp";

type Body = { code?: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<Body>(request);
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const row = rows[0];
    if (!row?.totpSecret || !row.totpEnabledAt) {
      throw new ApiError(400, "Turn on two-factor authentication first.");
    }
    if (!env.MAIL_ENCRYPTION_KEY) throw new ApiError(400, "Encryption is not configured.");
    const secret = await decryptSecret(row.totpSecret, env.MAIL_ENCRYPTION_KEY);
    if (!(await verifyTotp(secret, body.code ?? ""))) {
      throw new ApiError(400, "Authenticator code did not match.");
    }
    const recovery = await generateRecoveryCodes();
    await db.update(users).set({ recoveryCodes: recovery.hashed }).where(eq(users.id, user.id));
    return Response.json({ recoveryCodes: recovery.plain });
  } catch (error) {
    return errorResponse(error);
  }
}

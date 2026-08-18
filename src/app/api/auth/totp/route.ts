import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { users } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, verifyPassword } from "@/lib/crypto";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/auth/totp";

const SETUP_TTL = 600;

type ConfirmBody = { code?: string };
type DisableBody = { password?: string; code?: string };

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const rows = await db
      .select({
        totpEnabledAt: users.totpEnabledAt,
        recoveryCodes: users.recoveryCodes,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const row = rows[0];
    return Response.json({
      enabled: Boolean(row?.totpEnabledAt),
      enabledAt: row?.totpEnabledAt ?? null,
      recoveryCodesLeft: row?.recoveryCodes?.length ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    if (!env.MAIL_ENCRYPTION_KEY) {
      throw new ApiError(400, "Set MAIL_ENCRYPTION_KEY before turning on two-factor authentication.");
    }
    const secret = generateTotpSecret();
    await env.SESSION_STORE.put(
      setupKey(user.id),
      await encryptSecret(secret, env.MAIL_ENCRYPTION_KEY),
      { expirationTtl: SETUP_TTL },
    );
    return Response.json({
      secret,
      otpauth: otpauthUrl(secret, user.email),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<ConfirmBody>(request);
    const pending = await env.SESSION_STORE.get(setupKey(user.id));
    if (!pending || !env.MAIL_ENCRYPTION_KEY) {
      throw new ApiError(400, "Start two-factor setup again.");
    }
    const secret = await decryptSecret(pending, env.MAIL_ENCRYPTION_KEY);
    if (!(await verifyTotp(secret, body.code ?? ""))) {
      throw new ApiError(400, "That authenticator code did not match. Try the next one.");
    }
    const recovery = await generateRecoveryCodes();
    await db
      .update(users)
      .set({
        totpSecret: await encryptSecret(secret, env.MAIL_ENCRYPTION_KEY),
        totpEnabledAt: Math.floor(Date.now() / 1000),
        recoveryCodes: recovery.hashed,
      })
      .where(eq(users.id, user.id));
    await env.SESSION_STORE.delete(setupKey(user.id));
    return Response.json({ ok: true, recoveryCodes: recovery.plain });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<DisableBody>(request);
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const row = rows[0];
    if (!row?.totpSecret || !row.totpEnabledAt) {
      return Response.json({ ok: true });
    }
    if (!(await verifyPassword(body.password ?? "", row.passwordHash))) {
      throw new ApiError(401, "Password did not match.");
    }
    if (!env.MAIL_ENCRYPTION_KEY) {
      throw new ApiError(400, "Encryption is not configured.");
    }
    const secret = await decryptSecret(row.totpSecret, env.MAIL_ENCRYPTION_KEY);
    if (!(await verifyTotp(secret, body.code ?? ""))) {
      throw new ApiError(400, "Authenticator code did not match.");
    }
    await db
      .update(users)
      .set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: null })
      .where(eq(users.id, user.id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function setupKey(userId: string): string {
  return `totp-setup:${userId}`;
}

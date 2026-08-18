import { and, desc, eq, isNull } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { apiKeys } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { newId, randomToken } from "@/lib/ids";

const SCOPES = new Set(["mail:read", "mail:send", "admin"]);

type CreateBody = { name?: string; scopes?: string[] };

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.ownerId, user.id), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
    return Response.json({ keys: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, db, viaApiKey } = await authenticate(request, cloudflareEnv());
    if (viaApiKey) throw new ApiError(403, "API keys cannot mint further keys.");

    const body = await readJson<CreateBody>(request);
    const name = body.name?.trim();
    if (!name) throw new ApiError(400, "Give the key a name.");

    const scopes = (body.scopes ?? ["mail:read"]).filter((scope) => SCOPES.has(scope));
    if (scopes.length === 0) throw new ApiError(400, "Choose at least one valid scope.");

    const secret = `wmk_${randomToken(24)}`;
    await db.insert(apiKeys).values({
      id: newId("key"),
      ownerId: user.id,
      name,
      prefix: secret.slice(0, 12),
      keyHash: await sha256Hex(secret),
      scopes,
    });

    // The plaintext key is shown once here and never stored.
    return Response.json({ key: secret, scopes }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "id is required");

    await db
      .update(apiKeys)
      .set({ revokedAt: Math.floor(Date.now() / 1000) })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, user.id)));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

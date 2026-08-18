import { and, eq, isNull } from "drizzle-orm";
import { createDb, type Database } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/crypto";
import {
  loadUser,
  readCookie,
  resolveSession,
  SESSION_COOKIE,
  type SessionUser,
} from "./session";

export type ApiContext = {
  user: SessionUser;
  db: Database;
  env: CloudflareEnv;
  viaApiKey: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Authenticates a request from either a session cookie or a bearer API key. The
 * environment is passed in so this works both inside Next route handlers and in the
 * Worker entry, which has no OpenNext request context.
 */
export async function authenticate(
  request: Request,
  cloudflare: CloudflareEnv,
): Promise<ApiContext> {
  const db = createDb(cloudflare.DB);

  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const user = await userForApiKey(db, bearer);
    if (!user) throw new ApiError(401, "Invalid API key");
    return { user, db, env: cloudflare, viaApiKey: true };
  }

  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const user = await resolveSession(cloudflare, token);
  if (!user) throw new ApiError(401, "Not signed in");
  return { user, db, env: cloudflare, viaApiKey: false };
}

async function userForApiKey(db: Database, key: string): Promise<SessionUser | null> {
  const hash = await sha256Hex(key);
  const rows = await db
    .select({ id: apiKeys.id, ownerId: apiKeys.ownerId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);

  const record = rows[0];
  if (!record) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: Math.floor(Date.now() / 1000) })
    .where(eq(apiKeys.id, record.id));

  return loadUser(db, record.ownerId);
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("unhandled api error", error);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Expected a JSON body");
  }
}

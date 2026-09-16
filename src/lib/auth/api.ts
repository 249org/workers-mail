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

/**
 * OpenNext can emit more than one copy of this module into the Worker bundle, so a thrown
 * `ApiError` may fail `instanceof` against the copy that `errorResponse` imported. Status
 * and name are enough to recognise it without relying on the prototype chain.
 */
export function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  return (
    candidate.name === "ApiError" &&
    typeof candidate.status === "number" &&
    typeof candidate.message === "string"
  );
}

/**
 * OpenNext and Next.js sometimes wrap a thrown `ApiError` as `Error` with `cause` set
 * to the original. Walking a few causes is enough to recover the real status.
 */
function unwrapApiError(error: unknown): { status: number; message: string } | null {
  let current: unknown = error;
  for (let i = 0; i < 4 && current != null; i += 1) {
    if (isApiError(current)) return current;
    if (typeof current !== "object") break;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function errorChainText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 4 && current != null; i += 1) {
    parts.push(current instanceof Error ? current.message : String(current));
    if (typeof current !== "object") break;
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" ");
}

export function errorResponse(error: unknown): Response {
  const api = unwrapApiError(error);
  if (api) {
    return Response.json({ error: api.message }, { status: api.status });
  }
  const text = errorChainText(error);
  // A mail-server rejection that escaped ApiError still must not become an opaque 500.
  if (/IMAP (?:NO|BAD):/i.test(text) || /imap apply failed/i.test(text)) {
    const imap = /IMAP (?:NO|BAD):\s*(.*)$/im.exec(text);
    const detail = imap?.[1]?.replace(/^\[.*?\]\s*/, "").replace(/\s+/g, " ").trim();
    const message =
      detail && detail.length < 120
        ? `The mail server rejected that change (${detail}).`
        : "The mail server could not apply that change.";
    return Response.json({ error: message }, { status: 502 });
  }
  /*
   * The cause stays in the logs and a reference goes to the caller. "Internal error" on
   * its own gave someone reporting a failure nothing to quote and left no way to tie the
   * report to the line that logged it.
   */
  const ref = crypto.randomUUID().slice(0, 8);
  console.error("unhandled api error", {
    ref,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    cause:
      error instanceof Error && error.cause instanceof Error
        ? { name: error.cause.name, message: error.cause.message }
        : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return Response.json({ error: `Something went wrong (ref ${ref})` }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Expected a JSON body");
  }
}

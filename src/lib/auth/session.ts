import { eq } from "drizzle-orm";
import { createDb, type Database } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { randomToken } from "@/lib/ids";
import { sha256Hex } from "@/lib/crypto";

export const SESSION_COOKIE = "wm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
};

type SessionRecord = {
  userId: string;
  createdAt: number;
};

export async function createSession(
  store: KVNamespace,
  userId: string,
): Promise<{ token: string; maxAge: number }> {
  const token = randomToken(32);
  const record: SessionRecord = { userId, createdAt: Date.now() };
  await store.put(sessionKey(await sha256Hex(token)), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return { token, maxAge: SESSION_TTL_SECONDS };
}

export async function destroySession(store: KVNamespace, token: string): Promise<void> {
  await store.delete(sessionKey(await sha256Hex(token)));
}

export async function resolveSession(
  env: Pick<CloudflareEnv, "DB" | "SESSION_STORE">,
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  const raw = await env.SESSION_STORE.get(sessionKey(await sha256Hex(token)));
  if (!raw) return null;

  const record = JSON.parse(raw) as SessionRecord;
  return loadUser(createDb(env.DB), record.userId);
}

export async function loadUser(db: Database, userId: string): Promise<SessionUser | null> {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(db: Database, email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasAnyUser(db: Database): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || undefined;
  }
  return undefined;
}

function sessionKey(hash: string): string {
  return `session:${hash}`;
}

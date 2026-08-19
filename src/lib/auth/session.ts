import { eq } from "drizzle-orm";
import { createDb, type Database } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { randomToken } from "@/lib/ids";
import { sha256Hex } from "@/lib/crypto";
import { parseSessionTtlDays, sessionTtlSeconds, type SessionTtlDays } from "@/lib/privacy";

export const SESSION_COOKIE = "wm_session";
const DEFAULT_TTL_SECONDS = sessionTtlSeconds(30);

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
  avatarUpdatedAt: number | null;
};

type SessionRecord = {
  userId: string;
  createdAt: number;
  userAgent?: string;
  ip?: string;
};

export type PublicSession = {
  id: string;
  createdAt: number;
  userAgent: string;
  ip: string;
  current: boolean;
};

type SessionIndexEntry = {
  hash: string;
  createdAt: number;
  userAgent: string;
  ip: string;
};

export async function createSession(
  store: KVNamespace,
  userId: string,
  options: {
    maxAge?: number;
    userAgent?: string;
    ip?: string;
  } = {},
): Promise<{ token: string; maxAge: number }> {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const maxAge = options.maxAge ?? DEFAULT_TTL_SECONDS;
  const createdAt = Date.now();
  const record: SessionRecord = {
    userId,
    createdAt,
    userAgent: options.userAgent,
    ip: options.ip,
  };
  await store.put(sessionKey(hash), JSON.stringify(record), { expirationTtl: maxAge });
  await addToIndex(store, userId, {
    hash,
    createdAt,
    userAgent: options.userAgent ?? "",
    ip: options.ip ?? "unknown",
  }, maxAge);
  return { token, maxAge };
}

export async function destroySession(store: KVNamespace, token: string): Promise<void> {
  const hash = await sha256Hex(token);
  const raw = await store.get(sessionKey(hash));
  if (raw) {
    const record = JSON.parse(raw) as SessionRecord;
    await removeFromIndex(store, record.userId, hash);
  }
  await store.delete(sessionKey(hash));
}

export async function listSessions(
  store: KVNamespace,
  userId: string,
  currentToken: string | undefined,
): Promise<PublicSession[]> {
  const currentHash = currentToken ? await sha256Hex(currentToken) : "";
  const index = await readIndex(store, userId);
  return index.map((entry) => ({
    id: entry.hash.slice(0, 12),
    createdAt: entry.createdAt,
    userAgent: entry.userAgent,
    ip: entry.ip,
    current: entry.hash === currentHash,
  }));
}

export async function revokeOtherSessions(
  store: KVNamespace,
  userId: string,
  keepToken: string | undefined,
): Promise<number> {
  const keepHash = keepToken ? await sha256Hex(keepToken) : "";
  const index = await readIndex(store, userId);
  const kept: SessionIndexEntry[] = [];
  let revoked = 0;
  for (const entry of index) {
    if (entry.hash === keepHash) {
      kept.push(entry);
      continue;
    }
    await store.delete(sessionKey(entry.hash));
    revoked += 1;
  }
  await writeIndex(store, userId, kept);
  return revoked;
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
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
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

export function ttlForUser(days: number | null | undefined): number {
  return sessionTtlSeconds(parseSessionTtlDays(days));
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

function indexKey(userId: string): string {
  return `sessions:${userId}`;
}

async function readIndex(store: KVNamespace, userId: string): Promise<SessionIndexEntry[]> {
  const raw = await store.get(indexKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SessionIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(store: KVNamespace, userId: string, entries: SessionIndexEntry[]): Promise<void> {
  if (entries.length === 0) {
    await store.delete(indexKey(userId));
    return;
  }
  await store.put(indexKey(userId), JSON.stringify(entries), {
    expirationTtl: sessionTtlSeconds(30) + 60 * 60 * 24,
  });
}

async function addToIndex(
  store: KVNamespace,
  userId: string,
  entry: SessionIndexEntry,
  maxAge: number,
): Promise<void> {
  const next = [...(await readIndex(store, userId)).filter((item) => item.hash !== entry.hash), entry];
  await store.put(indexKey(userId), JSON.stringify(next), {
    expirationTtl: Math.max(maxAge, sessionTtlSeconds(30)) + 60 * 60 * 24,
  });
}

async function removeFromIndex(store: KVNamespace, userId: string, hash: string): Promise<void> {
  const next = (await readIndex(store, userId)).filter((entry) => entry.hash !== hash);
  await writeIndex(store, userId, next);
}

export type { SessionTtlDays };

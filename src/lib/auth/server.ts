import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb, type Database } from "@/lib/db";
import { env } from "@/lib/env";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "./session";

export type RequestContext = {
  user: SessionUser;
  db: Database;
  env: CloudflareEnv;
};

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return resolveSession(env(), token);
}

export async function requireUser(): Promise<RequestContext> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const cloudflare = env();
  return { user, db: createDb(cloudflare.DB), env: cloudflare };
}

export async function requireAdmin(): Promise<RequestContext> {
  const context = await requireUser();
  if (context.user.role !== "admin") redirect("/mail");
  return context;
}

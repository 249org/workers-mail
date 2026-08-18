import { and, eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { readCookie, resolveSession, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Authenticates a WebSocket upgrade and hands it to the mailbox's Durable Object.
 * This lives in the Worker entry rather than a route handler because Next cannot
 * return a 101 response.
 */
export async function handleStream(request: Request, env: CloudflareEnv): Promise<Response> {
  const url = new URL(request.url);
  const mailboxId = url.searchParams.get("mailbox");
  if (!mailboxId) return new Response("mailbox is required", { status: 400 });

  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const user = await resolveSession(env, token);
  if (!user) return new Response("Not signed in", { status: 401 });

  const db = createDb(env.DB);
  const owned = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.ownerId, user.id)))
    .limit(1);
  if (owned.length === 0) return new Response("Mailbox not found", { status: 404 });

  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
  return stub.fetch(request);
}

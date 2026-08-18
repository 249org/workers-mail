import { createDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { createSession, findUserByEmail, hasAnyUser, sessionCookie } from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isEmailAddress } from "@/lib/mail/address";

type RegisterBody = { email?: string; password?: string; name?: string };

/**
 * Open only until the first account exists. After that the deployment is closed and
 * further accounts are created by an admin from settings.
 */
export async function POST(request: Request): Promise<Response> {
  const cloudflare = env();
  const limit = await rateLimit(cloudflare.SESSION_STORE, clientKey(request, "register"), 5, 900);
  if (!limit.allowed) {
    return Response.json({ error: "Too many attempts." }, { status: 429 });
  }

  const db = createDb(cloudflare.DB);
  if (await hasAnyUser(db)) {
    return Response.json({ error: "This workspace is already set up." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as RegisterBody;
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!isEmailAddress(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 10) {
    return Response.json({ error: "Use a password of at least 10 characters." }, { status: 400 });
  }
  if (await findUserByEmail(db, email)) {
    return Response.json({ error: "That address is already registered." }, { status: 409 });
  }

  const id = newId("usr");
  await db.insert(users).values({
    id,
    email,
    name: body.name?.trim() || null,
    passwordHash: await hashPassword(password),
    role: "admin",
  });

  const session = await createSession(cloudflare.SESSION_STORE, id);
  return Response.json(
    { ok: true },
    {
      headers: {
        "set-cookie": sessionCookie(
          session.token,
          session.maxAge,
          new URL(request.url).protocol === "https:",
        ),
      },
    },
  );
}

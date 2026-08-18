import { env } from "@/lib/env";
import { clearedSessionCookie, destroySession, readCookie, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) await destroySession(env().SESSION_STORE, token);

  return Response.json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearedSessionCookie(new URL(request.url).protocol === "https:"),
      },
    },
  );
}

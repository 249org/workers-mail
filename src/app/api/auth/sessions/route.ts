import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { listSessions, readCookie, revokeOtherSessions, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    const sessions = await listSessions(env.SESSION_STORE, user.id, token);
    return Response.json({ sessions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) throw new ApiError(401, "Not signed in");
    const revoked = await revokeOtherSessions(env.SESSION_STORE, user.id, token);
    return Response.json({ ok: true, revoked });
  } catch (error) {
    return errorResponse(error);
  }
}

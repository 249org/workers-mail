import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { parseOverrides, type ShortcutOverrides } from "@/lib/keyboard/bindings";

function shortcutsKey(userId: string): string {
  return `shortcuts:${userId}`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const stored = await env.SESSION_STORE.get(shortcutsKey(user.id));
    let overrides = {};
    if (stored) {
      try {
        overrides = parseOverrides(JSON.parse(stored));
      } catch {
        overrides = {};
      }
    }
    return Response.json({ overrides });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<{ overrides?: unknown }>(request);
    if (!body || typeof body !== "object") {
      throw new ApiError(400, "Send the shortcut map.");
    }

    const overrides: ShortcutOverrides = parseOverrides(body.overrides);
    await env.SESSION_STORE.put(shortcutsKey(user.id), JSON.stringify(overrides));
    return Response.json({ overrides });
  } catch (error) {
    return errorResponse(error);
  }
}

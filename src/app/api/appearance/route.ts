import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import {
  appearanceCookie,
  isPaletteId,
  isSchemeId,
  parseAppearance,
  type AppearancePrefs,
} from "@/lib/appearance";

function appearanceKey(userId: string): string {
  return `appearance:${userId}`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const stored = await env.SESSION_STORE.get(appearanceKey(user.id));
    return Response.json({ prefs: stored ? parseAppearance(stored) : null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<Partial<AppearancePrefs>>(request);
    if (!body.palette || !isPaletteId(body.palette)) {
      throw new ApiError(400, "Choose a colour template.");
    }
    if (!body.scheme || !isSchemeId(body.scheme)) {
      throw new ApiError(400, "Choose light, dark, or system.");
    }

    const prefs: AppearancePrefs = { palette: body.palette, scheme: body.scheme };
    await env.SESSION_STORE.put(appearanceKey(user.id), JSON.stringify(prefs));

    const secure = new URL(request.url).protocol === "https:";
    return Response.json(prefs, {
      headers: { "set-cookie": appearanceCookie(prefs, secure) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

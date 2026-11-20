import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { appearanceCookie, parseAppearance, serializeAppearance } from "@/lib/appearance";

function appearanceKey(userId: string): string {
  return `appearance:${userId}`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const stored = await env.SESSION_STORE.get(appearanceKey(user.id));
    // Re-serialised so a value saved by an older build comes back in the current shape.
    return Response.json({ value: stored ? serializeAppearance(parseAppearance(stored)) : null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<{ value?: string }>(request);
    if (typeof body.value !== "string" || body.value.length > 200) {
      throw new ApiError(400, "Choose a theme.");
    }

    // Parsing is the validation: whatever comes back is a known preset or checked hex.
    const appearance = parseAppearance(body.value);
    const value = serializeAppearance(appearance);
    await env.SESSION_STORE.put(appearanceKey(user.id), value);

    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { value },
      { headers: { "set-cookie": appearanceCookie(appearance, secure) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

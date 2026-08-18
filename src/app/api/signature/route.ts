import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { parseSignature, type SignaturePrefs } from "@/lib/signature";

function signatureKey(userId: string): string {
  return `signature:${userId}`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const stored = await env.SESSION_STORE.get(signatureKey(user.id));
    let prefs: SignaturePrefs | null = null;
    if (stored) {
      try {
        prefs = parseSignature(JSON.parse(stored));
      } catch {
        prefs = parseSignature(null);
      }
    }
    return Response.json({ prefs: prefs ?? parseSignature(null) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<{ prefs?: unknown }>(request);
    if (!body || typeof body !== "object") {
      throw new ApiError(400, "Send the signature.");
    }

    const prefs = parseSignature(body.prefs);
    await env.SESSION_STORE.put(signatureKey(user.id), JSON.stringify(prefs));
    return Response.json({ prefs });
  } catch (error) {
    return errorResponse(error);
  }
}

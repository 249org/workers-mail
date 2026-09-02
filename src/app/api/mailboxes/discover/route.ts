import { createDb } from "@/lib/db";
import { authenticate } from "@/lib/auth/api";
import { hasAnyUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { isEmailAddress } from "@/lib/mail/address";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { discoverMailServers } from "@/lib/transport/autodiscover";

export async function GET(request: Request): Promise<Response> {
  const cloudflare = env();
  const limit = await rateLimit(cloudflare.SESSION_STORE, clientKey(request, "discover"), 30, 300);
  if (!limit.allowed) {
    return Response.json(
      { found: false, detail: "Too many lookups. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  /*
   * This reaches out to whatever domain it is handed, so it is not left open once there
   * is an account to sign in to. It stays open before that only because the first mailbox
   * is connected from the setup screen, where nobody can be signed in yet.
   */
  if (await hasAnyUser(createDb(cloudflare.DB))) {
    try {
      await authenticate(request, cloudflare);
    } catch {
      return Response.json({ found: false, detail: "Sign in first." }, { status: 401 });
    }
  }

  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!isEmailAddress(address)) {
    return Response.json({ found: false, detail: "Enter a valid email address." }, { status: 400 });
  }

  const result = await discoverMailServers(address);
  return Response.json(result);
}

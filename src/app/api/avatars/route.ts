import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { mailboxes } from "@/lib/db/schema";
import { isEmailAddress, normalizeAddress } from "@/lib/mail/address";
import { serveAvatar } from "@/lib/mail/avatar-store";

export async function GET(request: Request): Promise<Response> {
  try {
    const { db, env } = await authenticate(request, cloudflareEnv());
    const address = new URL(request.url).searchParams.get("address") ?? "";
    if (!isEmailAddress(address)) throw new ApiError(404, "No photo.");
    const mailbox = await db
      .select({ ownerId: mailboxes.ownerId })
      .from(mailboxes)
      .where(eq(mailboxes.address, normalizeAddress(address)))
      .limit(1);
    const ownerId = mailbox[0]?.ownerId;
    if (!ownerId) throw new ApiError(404, "No photo.");
    return await serveAvatar(db, env.MAIL_BUCKET, ownerId);
  } catch (error) {
    return errorResponse(error);
  }
}

import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { users } from "@/lib/db/schema";
import { serveAvatar } from "@/lib/mail/avatar-store";
import {
  AVATAR_MAX_BYTES,
  avatarObjectKey,
  sniffImageType,
} from "@/lib/mail/profile-photo";

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    return await serveAvatar(db, env.MAIL_BUCKET, user.id);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const buffer = await request.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength === 0) throw new ApiError(400, "Choose a photo to upload.");
    if (bytes.byteLength > AVATAR_MAX_BYTES) throw new ApiError(413, "Keep the photo under 1 MB.");

    const type = sniffImageType(bytes);
    if (!type) throw new ApiError(400, "Use a JPEG, PNG, or WebP photo.");

    const key = avatarObjectKey(user.id);
    await env.MAIL_BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
    const updatedAt = Math.floor(Date.now() / 1000);
    await db
      .update(users)
      .set({ avatarKey: key, avatarType: type, avatarUpdatedAt: updatedAt })
      .where(eq(users.id, user.id));

    return Response.json({ ok: true, avatarUpdatedAt: updatedAt });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const rows = await db
      .select({ avatarKey: users.avatarKey })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const key = rows[0]?.avatarKey;
    if (key) await env.MAIL_BUCKET.delete(key);
    await db
      .update(users)
      .set({ avatarKey: null, avatarType: null, avatarUpdatedAt: null })
      .where(eq(users.id, user.id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

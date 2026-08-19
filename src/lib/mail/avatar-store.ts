import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ApiError } from "@/lib/auth/api";

export async function serveAvatar(db: Database, bucket: R2Bucket, userId: string): Promise<Response> {
  const rows = await db
    .select({
      avatarKey: users.avatarKey,
      avatarType: users.avatarType,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row?.avatarKey) throw new ApiError(404, "No photo.");

  const object = await bucket.get(row.avatarKey);
  if (!object) throw new ApiError(404, "No photo.");

  return new Response(object.body, {
    headers: {
      "content-type": row.avatarType ?? object.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": "private, max-age=3600",
      etag: row.avatarUpdatedAt ? String(row.avatarUpdatedAt) : "0",
    },
  });
}

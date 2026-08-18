import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { attachments, mailboxes, messages } from "@/lib/db/schema";

type Params = { params: Promise<{ attachmentId: string }> };

const INLINE_TYPES = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain)$/i;

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { attachmentId } = await params;

    const rows = await db
      .select({
        filename: attachments.filename,
        mimeType: attachments.mimeType,
        r2Key: attachments.r2Key,
      })
      .from(attachments)
      .innerJoin(messages, eq(attachments.messageId, messages.id))
      .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
      .where(and(eq(attachments.id, attachmentId), eq(mailboxes.ownerId, user.id)))
      .limit(1);

    const attachment = rows[0];
    if (!attachment) throw new ApiError(404, "Attachment not found");

    const object = await env.MAIL_BUCKET.get(attachment.r2Key);
    if (!object) throw new ApiError(410, "The stored file is gone");

    const disposition = INLINE_TYPES.test(attachment.mimeType) ? "inline" : "attachment";
    return new Response(object.body, {
      headers: {
        "content-type": attachment.mimeType,
        "content-length": String(object.size),
        "content-disposition": `${disposition}; filename="${attachment.filename.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=3600",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

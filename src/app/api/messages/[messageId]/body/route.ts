import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { parseMime, stripHtml } from "@/lib/mail/mime";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { getMessage } from "@/lib/mail/queries";
import { plainTextToHtml, sanitizeMessageHtml } from "@/lib/mail/sanitize";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Renders a stored message body. Parsing happens on demand from the raw MIME in R2
 * rather than at index time, which keeps the hot inbox list small.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { messageId } = await params;
    const url = new URL(request.url);
    const mailboxId = url.searchParams.get("mailbox");
    const allowRemoteImages = url.searchParams.get("images") === "1";

    if (!mailboxId) throw new ApiError(400, "mailbox is required");
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const message = await getMessage(db, mailboxId, messageId);
    if (!message) throw new ApiError(404, "Message not found");
    if (!message.rawKey) {
      return Response.json({ html: plainTextToHtml(message.snippet), blockedImages: 0, text: message.snippet });
    }

    const object = await env.MAIL_BUCKET.get(message.rawKey);
    if (!object) throw new ApiError(410, "The stored copy of this message is gone");

    const parsed = await parseMime(await object.arrayBuffer());
    const source = parsed.html ?? plainTextToHtml(parsed.text);
    const sanitized = sanitizeMessageHtml(source, allowRemoteImages);

    return Response.json({
      html: sanitized.html,
      blockedImages: sanitized.blockedImages,
      text: parsed.text || stripHtml(parsed.html ?? ""),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

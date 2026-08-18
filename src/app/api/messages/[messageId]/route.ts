import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { messages } from "@/lib/db/schema";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { getMessage, listThread } from "@/lib/mail/queries";
import { parseMime, stripHtml } from "@/lib/mail/mime";
import { plainTextToHtml, sanitizeMessageHtml } from "@/lib/mail/sanitize";

type Params = { params: Promise<{ messageId: string }> };
type PatchBody = { mailboxId?: string; seen?: boolean; flagged?: boolean; folderId?: string };

/**
 * `include=body` returns the rendered body alongside the index row, so opening a
 * message costs one round trip rather than a detail request followed by a body one.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { messageId } = await params;
    const url = new URL(request.url);
    const mailboxId = url.searchParams.get("mailbox");
    if (!mailboxId) throw new ApiError(400, "mailbox is required");
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const detail = await getMessage(db, mailboxId, messageId);
    if (!detail) throw new ApiError(404, "Message not found");

    const thread = await listThread(db, mailboxId, detail.threadId);
    if (url.searchParams.get("include") !== "body") {
      return Response.json({ detail, thread, body: null });
    }

    const body = await renderBody(
      env.MAIL_BUCKET,
      detail,
      url.searchParams.get("images") === "1",
    );
    return Response.json({ detail, thread, body });
  } catch (error) {
    return errorResponse(error);
  }
}

async function renderBody(
  bucket: R2Bucket,
  detail: Awaited<ReturnType<typeof getMessage>>,
  allowRemoteImages: boolean,
) {
  if (!detail) return null;
  if (!detail.rawKey) {
    return { html: plainTextToHtml(detail.snippet), blockedImages: 0, text: detail.snippet };
  }

  const object = await bucket.get(detail.rawKey);
  if (!object) {
    return {
      html: plainTextToHtml("The stored copy of this message is no longer available."),
      blockedImages: 0,
      text: "",
    };
  }

  const parsed = await parseMime(await object.arrayBuffer());
  const sanitized = sanitizeMessageHtml(
    parsed.html ?? plainTextToHtml(parsed.text),
    allowRemoteImages,
  );

  return {
    html: sanitized.html,
    blockedImages: sanitized.blockedImages,
    text: parsed.text || stripHtml(parsed.html ?? ""),
  };
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { messageId } = await params;
    const body = await readJson<PatchBody>(request);
    if (!body.mailboxId) throw new ApiError(400, "mailboxId is required");
    if (!(await getOwnedMailbox(db, user.id, body.mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const patch: Partial<typeof messages.$inferInsert> = {};
    if (typeof body.seen === "boolean") patch.seen = body.seen;
    if (typeof body.flagged === "boolean") patch.flagged = body.flagged;
    if (body.folderId) patch.folderId = body.folderId;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update");

    await db
      .update(messages)
      .set(patch)
      .where(and(eq(messages.id, messageId), eq(messages.mailboxId, body.mailboxId)));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

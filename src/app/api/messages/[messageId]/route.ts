import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { messages } from "@/lib/db/schema";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { getMessage, listThread } from "@/lib/mail/queries";

type Params = { params: Promise<{ messageId: string }> };
type PatchBody = { mailboxId?: string; seen?: boolean; flagged?: boolean; folderId?: string };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { messageId } = await params;
    const mailboxId = new URL(request.url).searchParams.get("mailbox");
    if (!mailboxId) throw new ApiError(400, "mailbox is required");
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const message = await getMessage(db, mailboxId, messageId);
    if (!message) throw new ApiError(404, "Message not found");

    const thread = await listThread(db, mailboxId, message.threadId);
    return Response.json({ message, thread });
  } catch (error) {
    return errorResponse(error);
  }
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

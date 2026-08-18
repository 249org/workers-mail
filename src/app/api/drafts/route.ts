import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { messages } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { parseAddressList } from "@/lib/mail/address";
import { buildSnippet } from "@/lib/mail/mime";
import { folderByRole, getOwnedMailbox } from "@/lib/mail/mailboxes";

type DraftBody = {
  id?: string;
  mailboxId?: string;
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  inReplyTo?: string;
  threadId?: string;
};

export async function PUT(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const body = await readJson<DraftBody>(request);
    if (!body.mailboxId) throw new ApiError(400, "mailboxId is required");

    const mailbox = await getOwnedMailbox(db, user.id, body.mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const drafts = await folderByRole(db, mailbox.id, "drafts");
    if (!drafts) throw new ApiError(409, "This mailbox has no drafts folder");

    const now = Math.floor(Date.now() / 1000);
    const values = {
      subject: body.subject?.trim() ?? "",
      toAddresses: parseAddressList(body.to ?? ""),
      ccAddresses: parseAddressList(body.cc ?? ""),
      snippet: buildSnippet(body.text ?? ""),
      sentAt: now,
      inReplyTo: body.inReplyTo ?? null,
    };

    if (body.id) {
      await db
        .update(messages)
        .set(values)
        .where(and(eq(messages.id, body.id), eq(messages.mailboxId, mailbox.id)));
      return Response.json({ id: body.id });
    }

    const id = newId("msg");
    await db.insert(messages).values({
      ...values,
      id,
      mailboxId: mailbox.id,
      folderId: drafts.id,
      threadId: body.threadId ?? newId("thr"),
      fromAddress: mailbox.address,
      fromName: mailbox.displayName,
      receivedAt: now,
      seen: true,
      draft: true,
    });

    return Response.json({ id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const mailboxId = url.searchParams.get("mailbox");
    if (!id || !mailboxId) throw new ApiError(400, "id and mailbox are required");
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    await db
      .delete(messages)
      .where(and(eq(messages.id, id), eq(messages.mailboxId, mailboxId), eq(messages.draft, true)));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

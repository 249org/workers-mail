import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { messages } from "@/lib/db/schema";
import { getOwnedMailbox, listFolders } from "@/lib/mail/mailboxes";
import { parseMime, stripHtml, type ParsedAttachment } from "@/lib/mail/mime";
import { getMessage, listThread } from "@/lib/mail/queries";
import { pushImapChanges } from "@/lib/transport/imap-push";
import { plainTextToHtml, sanitizeMessageHtml, inlineSrcMap, normalizeCid } from "@/lib/mail/sanitize";

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
    return {
      html: plainTextToHtml(detail.snippet),
      blockedImages: 0,
      text: detail.snippet,
      kind: "plain" as const,
    };
  }

  const object = await bucket.get(detail.rawKey);
  if (!object) {
    return {
      html: plainTextToHtml("The stored copy of this message is no longer available."),
      blockedImages: 0,
      text: "",
      kind: "plain" as const,
    };
  }

  const parsed = await parseMime(await object.arrayBuffer());
  const fromHtml = Boolean(parsed.html?.trim());
  const sanitized = sanitizeMessageHtml(
    fromHtml ? parsed.html! : plainTextToHtml(parsed.text),
    allowRemoteImages,
    cidMapFrom(detail.attachments, parsed.attachments),
  );

  return {
    html: sanitized.html,
    blockedImages: sanitized.blockedImages,
    text: parsed.text || stripHtml(parsed.html ?? ""),
    kind: fromHtml ? ("html" as const) : ("plain" as const),
  };
}

function cidMapFrom(
  stored: Array<{ id: string; filename: string; contentId: string | null }>,
  parsed: ParsedAttachment[],
) {
  const unused = [...stored];
  const files = parsed.map((att) => {
    const cid = att.contentId ? normalizeCid(att.contentId) : "";
    const idx = unused.findIndex((file) => {
      if (cid && file.contentId && normalizeCid(file.contentId) === cid) return true;
      return file.filename === att.filename;
    });
    const file = (idx >= 0 ? unused.splice(idx, 1)[0] : unused.shift()) ?? null;
    if (!file) return null;
    return {
      id: file.id,
      filename: att.filename || file.filename,
      contentId: file.contentId ?? att.contentId ?? null,
    };
  }).filter((file): file is NonNullable<typeof file> => Boolean(file));

  for (const leftover of unused) files.push(leftover);
  return inlineSrcMap(files);
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { messageId } = await params;
    const body = await readJson<PatchBody>(request);
    if (!body.mailboxId) throw new ApiError(400, "mailboxId is required");
    const mailbox = await getOwnedMailbox(db, user.id, body.mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const patch: Partial<typeof messages.$inferInsert> = {};
    if (typeof body.seen === "boolean") patch.seen = body.seen;
    if (typeof body.flagged === "boolean") patch.flagged = body.flagged;
    if (body.folderId) patch.folderId = body.folderId;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update");

    const current = await db
      .select({ id: messages.id, folderId: messages.folderId, remoteUid: messages.remoteUid })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.mailboxId, body.mailboxId)))
      .limit(1);
    const row = current[0];
    if (!row) throw new ApiError(404, "Message not found");

    if (mailbox.type === "external_imap") {
      const folders = await listFolders(db, mailbox.id);
      try {
        if (body.folderId) {
          const destination = folders.find((folder) => folder.id === body.folderId);
          if (!destination) throw new ApiError(404, "Folder not found");
          const uids = await pushImapChanges(mailbox, env, db, folders, [row], {
            action: "move",
            destination,
          });
          if (uids.has(row.id)) patch.remoteUid = uids.get(row.id) ?? null;
        } else {
          await pushImapChanges(mailbox, env, db, folders, [row], {
            action: "flags",
            seen: typeof body.seen === "boolean" ? body.seen : undefined,
            flagged: typeof body.flagged === "boolean" ? body.flagged : undefined,
          });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, "The mail server could not apply that change.");
      }
    }

    await db
      .update(messages)
      .set(patch)
      .where(and(eq(messages.id, messageId), eq(messages.mailboxId, body.mailboxId)));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

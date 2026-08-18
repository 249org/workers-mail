import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { attachments, messages } from "@/lib/db/schema";
import { folderByRole, getOwnedMailbox } from "@/lib/mail/mailboxes";
import { folderInMailbox, ownedMessageIds } from "@/lib/mail/queries";

type BulkBody = {
  mailboxId?: string;
  ids?: string[];
  action?: "read" | "unread" | "flag" | "unflag" | "move" | "trash" | "delete" | "empty-trash";
  folderId?: string;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<BulkBody>(request);

    if (!body.mailboxId || !body.action) {
      throw new ApiError(400, "mailboxId and action are required");
    }
    const mailbox = await getOwnedMailbox(db, user.id, body.mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    if (body.action === "empty-trash") {
      const trash = await folderByRole(db, mailbox.id, "trash");
      if (!trash) throw new ApiError(409, "This mailbox has no trash folder");
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.mailboxId, mailbox.id), eq(messages.folderId, trash.id)));
      const trashIds = rows.map((row) => row.id);
      if (trashIds.length === 0) return Response.json({ updated: 0 });
      await purgeObjects(db, env.MAIL_BUCKET, trashIds);
      await db
        .delete(messages)
        .where(and(eq(messages.mailboxId, mailbox.id), eq(messages.folderId, trash.id)));
      return Response.json({ updated: trashIds.length });
    }

    const ids = await ownedMessageIds(db, mailbox.id, body.ids ?? []);
    if (ids.length === 0) return Response.json({ updated: 0 });

    const scope = and(eq(messages.mailboxId, mailbox.id), inArray(messages.id, ids));

    switch (body.action) {
      case "read":
        await db.update(messages).set({ seen: true }).where(scope);
        break;
      case "unread":
        await db.update(messages).set({ seen: false }).where(scope);
        break;
      case "flag":
        await db.update(messages).set({ flagged: true }).where(scope);
        break;
      case "unflag":
        await db.update(messages).set({ flagged: false }).where(scope);
        break;
      case "move": {
        if (!body.folderId) throw new ApiError(400, "folderId is required to move");
        if (!(await folderInMailbox(db, mailbox.id, body.folderId))) {
          throw new ApiError(404, "Folder not found");
        }
        await db.update(messages).set({ folderId: body.folderId }).where(scope);
        break;
      }
      case "trash": {
        const trash = await folderByRole(db, mailbox.id, "trash");
        if (!trash) throw new ApiError(409, "This mailbox has no trash folder");
        await db.update(messages).set({ folderId: trash.id }).where(scope);
        break;
      }
      case "delete": {
        await purgeObjects(db, env.MAIL_BUCKET, ids);
        await db.delete(messages).where(scope);
        break;
      }
      default:
        throw new ApiError(400, "Unknown action");
    }

    return Response.json({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

async function purgeObjects(
  db: Database,
  bucket: R2Bucket,
  ids: string[],
): Promise<void> {
  const rows = await db
    .select({ rawKey: messages.rawKey })
    .from(messages)
    .where(inArray(messages.id, ids));
  const files = await db
    .select({ r2Key: attachments.r2Key })
    .from(attachments)
    .where(inArray(attachments.messageId, ids));

  const keys = [
    ...rows.map((row) => row.rawKey).filter((key): key is string => Boolean(key)),
    ...files.map((file) => file.r2Key),
  ];
  if (keys.length > 0) await bucket.delete(keys);
}

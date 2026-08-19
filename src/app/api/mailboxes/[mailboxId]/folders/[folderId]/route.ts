import { and, eq, inArray } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { attachments, folders, messages } from "@/lib/db/schema";
import { parseFolderName } from "@/lib/mail/folder-name";
import { getOwnedMailbox, listFolders } from "@/lib/mail/mailboxes";
import { mutateRemoteFolder } from "@/lib/transport/imap-remote";

type Params = { params: Promise<{ mailboxId: string; folderId: string }> };
type PatchBody = { name?: string; icon?: string | null; color?: string | null };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { mailboxId, folderId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const all = await listFolders(db, mailboxId);
    const target = all.find((folder) => folder.id === folderId);
    if (!target) throw new ApiError(404, "Folder not found");

    const body = await readJson<PatchBody>(request);
    const patch: Partial<typeof folders.$inferInsert> = {};

    // Appearance is local to this app, so it applies to system folders too.
    if (body.icon !== undefined) patch.icon = body.icon || null;
    if (body.color !== undefined) patch.color = body.color || null;

    if (body.name !== undefined) {
      if (target.role !== "custom") throw new ApiError(400, "System folders cannot be renamed.");

      const parsed = parseFolderName(body.name);
      if (!parsed.ok) throw new ApiError(400, parsed.error);

      const conflict = all.find(
        (folder) =>
          folder.id !== folderId && folder.name.toLowerCase() === parsed.name.toLowerCase(),
      );
      if (conflict) throw new ApiError(409, `A folder named ${parsed.name} already exists.`);

      // Rename on the server first: if that fails the local name would be a lie.
      if (mailbox.type === "external_imap") {
        const result = await mutateRemoteFolder(env, mailboxId, folderId, "rename", parsed.name);
        if (!result.ok) throw new ApiError(502, remoteMessage(result.error, "renamed"));
        if (result.remotePath) patch.remotePath = result.remotePath;
      }
      patch.name = parsed.name;
    }

    if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update");

    await db
      .update(folders)
      .set(patch)
      .where(and(eq(folders.id, folderId), eq(folders.mailboxId, mailboxId)));

    return Response.json({ ok: true, folder: { ...target, ...patch } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { mailboxId, folderId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const all = await listFolders(db, mailboxId);
    const target = all.find((folder) => folder.id === folderId);
    if (!target) throw new ApiError(404, "Folder not found");
    if (target.role !== "custom") throw new ApiError(400, "System folders cannot be deleted.");

    /*
     * Delete on the server before the local row. Removing it locally first would let the
     * next sync see the folder still listed remotely and recreate it, which is why
     * deletions used to reappear and never reached other clients.
     */
    if (mailbox.type === "external_imap") {
      const result = await mutateRemoteFolder(env, mailboxId, folderId, "delete");
      if (!result.ok) throw new ApiError(502, remoteMessage(result.error, "deleted"));
    }

    await purgeFolderObjects(db, env.MAIL_BUCKET, folderId);
    await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.mailboxId, mailboxId)));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Drops raw MIME and attachment bytes so deleting a folder does not orphan R2 objects. */
async function purgeFolderObjects(
  db: Awaited<ReturnType<typeof authenticate>>["db"],
  bucket: R2Bucket,
  folderId: string,
): Promise<void> {
  const rows = await db
    .select({ id: messages.id, rawKey: messages.rawKey })
    .from(messages)
    .where(eq(messages.folderId, folderId));
  if (rows.length === 0) return;

  const ids = rows.map((row) => row.id);
  const files = await db
    .select({ r2Key: attachments.r2Key })
    .from(attachments)
    .where(inArray(attachments.messageId, ids));

  const keys = [
    ...rows.map((row) => row.rawKey).filter((key): key is string => Boolean(key)),
    ...files.map((file) => file.r2Key),
  ];

  // R2 caps a bulk delete at 1000 keys per call.
  for (let index = 0; index < keys.length; index += 1000) {
    await bucket.delete(keys.slice(index, index + 1000));
  }
}

function remoteMessage(error: string, verb: string): string {
  return `The mail server refused: ${error}. The folder was not ${verb}.`;
}

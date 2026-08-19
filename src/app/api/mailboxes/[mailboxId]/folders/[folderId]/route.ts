import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { folders } from "@/lib/db/schema";
import { parseFolderName } from "@/lib/mail/folder-name";
import { getOwnedMailbox, listFolders } from "@/lib/mail/mailboxes";

type Params = { params: Promise<{ mailboxId: string; folderId: string }> };
type PatchBody = { name?: string };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { mailboxId, folderId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const body = await readJson<PatchBody>(request);
    if (!body.name) throw new ApiError(400, "name is required");

    const parsed = parseFolderName(body.name);
    if (!parsed.ok) throw new ApiError(400, parsed.error);

    const all = await listFolders(db, mailboxId);
    const target = all.find((folder) => folder.id === folderId);
    if (!target) throw new ApiError(404, "Folder not found");
    if (target.role !== "custom") throw new ApiError(400, "System folders cannot be renamed.");

    const conflict = all.find(
      (folder) => folder.id !== folderId && folder.name.toLowerCase() === parsed.name.toLowerCase(),
    );
    if (conflict) throw new ApiError(409, `A folder named ${parsed.name} already exists.`);

    await db
      .update(folders)
      .set({ name: parsed.name })
      .where(and(eq(folders.id, folderId), eq(folders.mailboxId, mailboxId)));

    return Response.json({ ok: true, folder: { ...target, name: parsed.name } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(_request, cloudflareEnv());
    const { mailboxId, folderId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const all = await listFolders(db, mailboxId);
    const target = all.find((folder) => folder.id === folderId);
    if (!target) throw new ApiError(404, "Folder not found");
    if (target.role !== "custom") throw new ApiError(400, "System folders cannot be deleted.");

    await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.mailboxId, mailboxId)));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

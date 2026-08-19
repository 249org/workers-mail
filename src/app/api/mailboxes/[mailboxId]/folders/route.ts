import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { parseFolderName } from "@/lib/mail/folder-name";
import {
  FolderExistsError,
  getOwnedMailbox,
  insertCustomFolder,
  listFolders,
} from "@/lib/mail/mailboxes";
import { createRemoteFolder } from "@/lib/transport/imap-remote";

type Params = { params: Promise<{ mailboxId: string }> };
type Body = { name?: string };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { mailboxId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const parsed = parseFolderName((await readJson<Body>(request)).name ?? "");
    if (!parsed.ok) throw new ApiError(400, parsed.error);

    const existing = await listFolders(db, mailbox.id);
    if (existing.some((folder) => folder.name.toLowerCase() === parsed.name.toLowerCase())) {
      throw new ApiError(409, `A folder named ${parsed.name} already exists.`);
    }

    if (mailbox.type === "external_imap") {
      try {
        const folder = await createRemoteFolder(env, mailbox.id, parsed.name);
        return Response.json({ folder });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not create the folder on the mail server.";
        throw new ApiError(502, message);
      }
    }

    try {
      const folder = await insertCustomFolder(db, mailbox.id, parsed.name);
      return Response.json({
        folder: { id: folder.id, name: folder.name, role: folder.role, unread: 0 },
      });
    } catch (error) {
      if (error instanceof FolderExistsError) throw new ApiError(409, error.message);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

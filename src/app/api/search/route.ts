import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { getOwnedMailbox, listFolders } from "@/lib/mail/mailboxes";
import { listMessages } from "@/lib/mail/queries";
import { parseSearch } from "@/lib/mail/search";

const PALETTE_LIMIT = 12;

/**
 * Backs the command palette. Unlike /api/messages this searches across folders by
 * default, and resolves an `in:` operator to a folder id on the way through.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const url = new URL(request.url);

    const mailboxId = url.searchParams.get("mailbox");
    const query = url.searchParams.get("q") ?? "";
    if (!mailboxId) throw new ApiError(400, "mailbox is required");
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const parsed = parseSearch(query);
    if (parsed.empty) return Response.json({ items: [], folderId: null });

    let folderId: string | undefined;
    if (parsed.folder) {
      const folders = await listFolders(db, mailboxId);
      folderId = folders.find(
        (folder) => folder.name.toLowerCase() === parsed.folder,
      )?.id;
      // An `in:` naming no folder should return nothing rather than everything.
      if (!folderId) return Response.json({ items: [], folderId: null });
    }

    const page = await listMessages(db, mailboxId, {
      search: query,
      folderId,
      limit: Number(url.searchParams.get("limit") ?? PALETTE_LIMIT),
    });

    return Response.json({ items: page.items, folderId: folderId ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}

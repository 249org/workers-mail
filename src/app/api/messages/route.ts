import { authenticate, errorResponse, ApiError } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { listMessages } from "@/lib/mail/queries";

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const url = new URL(request.url);

    const mailboxId = url.searchParams.get("mailbox");
    if (!mailboxId) throw new ApiError(400, "mailbox is required");
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const before = url.searchParams.get("before");
    const page = await listMessages(db, mailboxId, {
      folderId: url.searchParams.get("folder") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      unreadOnly: url.searchParams.get("unread") === "1",
      flaggedOnly: url.searchParams.get("flagged") === "1",
      limit: Number(url.searchParams.get("limit") ?? 50),
      before: before ? Number(before) : undefined,
    });

    return Response.json(page);
  } catch (error) {
    return errorResponse(error);
  }
}

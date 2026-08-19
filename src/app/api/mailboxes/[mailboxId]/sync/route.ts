import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { withTimeout } from "@/lib/timeout";

type Params = { params: Promise<{ mailboxId: string }> };

const POKE_TIMEOUT_MS = 15_000;

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { mailboxId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");
    if (mailbox.type !== "external_imap") {
      return Response.json({ state: "idle", note: "Native mailboxes receive mail as it arrives." });
    }

    const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailbox.id));
    let folderId: string | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as { folderId?: unknown };
      if (typeof body.folderId === "string" && body.folderId) folderId = body.folderId;
    }

    const status = await withTimeout(
      stub.poke({
        backfill: !mailbox.backfillComplete || Boolean(folderId),
        mailboxId: mailbox.id,
        folderId,
      }),
      folderId ? 25_000 : POKE_TIMEOUT_MS,
    ).catch(() => ({ state: "syncing" as const, lastSyncedAt: null, lastError: null, connections: 0 }));

    return Response.json(status);
  } catch (error) {
    return errorResponse(error);
  }
}

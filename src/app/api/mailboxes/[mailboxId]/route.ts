import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { mailboxes } from "@/lib/db/schema";
import { getOwnedMailbox, listFolders, publicMailbox } from "@/lib/mail/mailboxes";
import { unreadCounts } from "@/lib/mail/queries";

type Params = { params: Promise<{ mailboxId: string }> };
type PatchBody = { displayName?: string | null };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { mailboxId } = await params;
    const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    const [folders, unread] = await Promise.all([
      listFolders(db, mailbox.id),
      unreadCounts(db, mailbox.id),
    ]);

    return Response.json({
      mailbox: publicMailbox(mailbox),
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        role: folder.role,
        unread: unread.get(folder.id) ?? 0,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { mailboxId } = await params;
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    const body = await readJson<PatchBody>(request);
    await db
      .update(mailboxes)
      .set({ displayName: body.displayName?.trim() || null })
      .where(eq(mailboxes.id, mailboxId));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { mailboxId } = await params;
    if (!(await getOwnedMailbox(db, user.id, mailboxId))) {
      throw new ApiError(404, "Mailbox not found");
    }

    await purgeStoredObjects(env.MAIL_BUCKET, `mail/${mailboxId}/`);
    await db.delete(mailboxes).where(eq(mailboxes.id, mailboxId));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function purgeStoredObjects(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix, cursor, limit: 500 });
    if (listing.objects.length > 0) {
      await bucket.delete(listing.objects.map((object) => object.key));
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
}

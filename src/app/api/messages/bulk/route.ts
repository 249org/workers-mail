import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { attachments, messages } from "@/lib/db/schema";
import { folderByRole, getOwnedMailbox, listFolders, type Mailbox } from "@/lib/mail/mailboxes";
import { ownedMessageRefs } from "@/lib/mail/queries";
import { applyRemoteMail, type ImapMessageRef, type RemoteMailChange } from "@/lib/transport/imap-remote";

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
    const folders = await listFolders(db, mailbox.id);

    if (body.action === "empty-trash") {
      const trash = await folderByRole(db, mailbox.id, "trash");
      if (!trash) throw new ApiError(409, "This mailbox has no trash folder");
      const rows = await db
        .select({ id: messages.id, folderId: messages.folderId, remoteUid: messages.remoteUid })
        .from(messages)
        .where(and(eq(messages.mailboxId, mailbox.id), eq(messages.folderId, trash.id)));
      if (rows.length === 0) return Response.json({ updated: 0 });
      await applyImap(mailbox, env, rows, { action: "delete" });
      const trashIds = rows.map((row) => row.id);
      await purgeObjects(db, env.MAIL_BUCKET, trashIds);
      await db
        .delete(messages)
        .where(and(eq(messages.mailboxId, mailbox.id), eq(messages.folderId, trash.id)));
      return Response.json({ updated: trashIds.length });
    }

    const refs = await ownedMessageRefs(db, mailbox.id, body.ids ?? []);
    if (refs.length === 0) return Response.json({ updated: 0 });
    const ids = refs.map((row) => row.id);
    const scope = and(eq(messages.mailboxId, mailbox.id), inArray(messages.id, ids));

    switch (body.action) {
      /*
       * Flags are saved locally first and pushed afterwards, and a refused push does not
       * fail the request. Reading is driven by the cursor, so walking a list with the
       * arrow keys asks the server to set `\\Seen` once per message and a busy host starts
       * turning those connections away; pushing first meant every refusal also threw away
       * the local read, and the message the user had just read came back unread. Moving
       * or deleting still has to reach the server, since those cannot be replayed.
       */
      case "read":
        await db.update(messages).set({ seen: true }).where(scope);
        await pushFlags(mailbox, env, refs, { action: "flags", seen: true });
        break;
      case "unread":
        await db.update(messages).set({ seen: false }).where(scope);
        await pushFlags(mailbox, env, refs, { action: "flags", seen: false });
        break;
      case "flag":
        await db.update(messages).set({ flagged: true }).where(scope);
        await pushFlags(mailbox, env, refs, { action: "flags", flagged: true });
        break;
      case "unflag":
        await db.update(messages).set({ flagged: false }).where(scope);
        await pushFlags(mailbox, env, refs, { action: "flags", flagged: false });
        break;
      case "move": {
        if (!body.folderId) throw new ApiError(400, "folderId is required to move");
        const destination = folders.find((folder) => folder.id === body.folderId);
        if (!destination) throw new ApiError(404, "Folder not found");
        const uids = await applyImap(mailbox, env, refs, {
          action: "move",
          folderId: destination.id,
        });
        await applyMoveLocally(db, mailbox.id, refs, destination.id, uids);
        break;
      }
      case "trash": {
        const trash = folders.find((folder) => folder.role === "trash");
        if (!trash) throw new ApiError(409, "This mailbox has no trash folder");
        const uids = await applyImap(mailbox, env, refs, {
          action: "move",
          folderId: trash.id,
        });
        await applyMoveLocally(db, mailbox.id, refs, trash.id, uids);
        break;
      }
      case "delete": {
        await applyImap(mailbox, env, refs, { action: "delete" });
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

/** Best-effort flag mirroring: the local change stands even when the server refuses. */
async function pushFlags(
  mailbox: Mailbox,
  env: CloudflareEnv,
  refs: ImapMessageRef[],
  change: RemoteMailChange,
): Promise<void> {
  if (mailbox.type !== "external_imap") return;
  try {
    await applyRemoteMail(env, mailbox.id, refs, change);
  } catch (error) {
    console.warn("imap flag push failed", { mailboxId: mailbox.id, error });
  }
}

async function applyImap(
  mailbox: Mailbox,
  env: CloudflareEnv,
  refs: ImapMessageRef[],
  change: RemoteMailChange,
): Promise<Map<string, number | null>> {
  if (mailbox.type !== "external_imap") return new Map();
  try {
    return await applyRemoteMail(env, mailbox.id, refs, change);
  } catch {
    throw new ApiError(502, "The mail server could not apply that change.");
  }
}

async function applyMoveLocally(
  db: Database,
  mailboxId: string,
  refs: ImapMessageRef[],
  folderId: string,
  uids: Map<string, number | null>,
): Promise<void> {
  for (const ref of refs) {
    const patch: { folderId: string; remoteUid?: number | null } = { folderId };
    if (uids.has(ref.id)) patch.remoteUid = uids.get(ref.id) ?? null;
    else if (ref.remoteUid != null) patch.remoteUid = null;
    await db
      .update(messages)
      .set(patch)
      .where(and(eq(messages.id, ref.id), eq(messages.mailboxId, mailboxId)));
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

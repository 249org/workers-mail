import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import {
  ensureDefaultFolders,
  getOwnedMailbox,
  listMailboxes,
  publicMailbox,
} from "@/lib/mail/mailboxes";
import { listMessages, unreadCounts } from "@/lib/mail/queries";
import { MailWorkspace } from "@/components/mail/mail-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ mailboxId: string; folderId: string }>;
  searchParams: Promise<{ q?: string; message?: string }>;
};

export default async function FolderPage({ params, searchParams }: PageProps) {
  const { mailboxId, folderId } = await params;
  const { q, message } = await searchParams;
  const { user, db } = await requireUser();

  const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
  if (!mailbox) notFound();

  const folders = await ensureDefaultFolders(db, mailbox.id);
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) notFound();

  const [all, page, unread] = await Promise.all([
    listMailboxes(db, user.id),
    listMessages(db, mailbox.id, { folderId: folder.id, search: q, limit: 50 }),
    unreadCounts(db, mailbox.id),
  ]);

  return (
    <MailWorkspace
      mailbox={publicMailbox(mailbox)}
      mailboxes={all.map(publicMailbox)}
      folders={folders.map((entry) => ({
        id: entry.id,
        name: entry.name,
        role: entry.role,
        unread: unread.get(entry.id) ?? 0,
      }))}
      activeFolderId={folder.id}
      initialMessages={page.items}
      initialCursor={page.nextCursor}
      initialSearch={q ?? ""}
      initialSelectedId={message ?? null}
      initialLastSyncedAt={mailbox.lastSyncedAt}
      initialSyncError={mailbox.syncError}
    />
  );
}

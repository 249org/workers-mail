import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import {
  ensureDefaultFolders,
  getOwnedMailbox,
  listMailboxes,
  publicMailbox,
} from "@/lib/mail/mailboxes";
import { unreadCounts } from "@/lib/mail/queries";
import { MailWorkspace } from "@/components/mail/mail-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ mailboxId: string }>;
};

export default async function MailboxLayout({ children, params }: LayoutProps) {
  const { mailboxId } = await params;
  const { user, db } = await requireUser();

  const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
  if (!mailbox) notFound();

  const [all, folders, unread] = await Promise.all([
    listMailboxes(db, user.id),
    ensureDefaultFolders(db, mailbox.id),
    unreadCounts(db, mailbox.id),
  ]);

  return (
    <div className="h-full">
      <MailWorkspace
        mailbox={publicMailbox(mailbox)}
        mailboxes={all.map(publicMailbox)}
        folders={folders.map((entry) => ({
          id: entry.id,
          name: entry.name,
          role: entry.role,
          unread: unread.get(entry.id) ?? 0,
          icon: entry.icon,
          color: entry.color,
        }))}
        initialLastSyncedAt={mailbox.lastSyncedAt}
        initialSyncError={mailbox.syncError}
      />
      {children}
    </div>
  );
}

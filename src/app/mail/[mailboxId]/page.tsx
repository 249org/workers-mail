import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { ensureDefaultFolders, getOwnedMailbox } from "@/lib/mail/mailboxes";

export default async function MailboxPage({
  params,
}: {
  params: Promise<{ mailboxId: string }>;
}) {
  const { mailboxId } = await params;
  const { user, db } = await requireUser();

  const mailbox = await getOwnedMailbox(db, user.id, mailboxId);
  if (!mailbox) notFound();

  const folders = await ensureDefaultFolders(db, mailbox.id);
  const inbox = folders.find((folder) => folder.role === "inbox") ?? folders[0];
  if (!inbox) notFound();

  redirect(`/mail/${mailbox.id}/${inbox.id}`);
}

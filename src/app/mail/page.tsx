import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { ensureDefaultFolders, listMailboxes } from "@/lib/mail/mailboxes";

export default async function MailIndexPage() {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  const first = mailboxes[0];
  if (first) {
    const folders = await ensureDefaultFolders(db, first.id);
    const inbox = folders.find((folder) => folder.role === "inbox") ?? folders[0];
    if (inbox) redirect(`/mail/${first.id}/${inbox.id}`);
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="card max-w-md p-8 text-center">
        <h2 className="text-base font-semibold">No mailboxes yet</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Connect a domain to receive mail on your own addresses, or attach an existing
          IMAP account to read it here.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/settings/domains" className="btn btn-primary">
            Add a domain
          </Link>
          <Link href="/settings/mailboxes/new" className="btn btn-ghost">
            Connect IMAP
          </Link>
        </div>
      </div>
    </div>
  );
}

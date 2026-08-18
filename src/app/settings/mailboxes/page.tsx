import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { MailboxList } from "@/components/settings/mailbox-list";

export default async function MailboxesPage() {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Mailboxes</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Addresses on your own domains, plus any external accounts you read over IMAP.
          </p>
        </div>
        <Link href="/settings/mailboxes/new" className="btn btn-primary shrink-0">
          Add mailbox
        </Link>
      </div>

      <MailboxList mailboxes={mailboxes.map(publicMailbox)} />
    </div>
  );
}

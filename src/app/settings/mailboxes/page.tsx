import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { MailboxList } from "@/components/settings/mailbox-list";
import { PageHeader } from "@/components/settings/page-header";

export default async function MailboxesPage() {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        action={
          <Link href="/settings/mailboxes/new" className="btn btn-primary shrink-0">
            Add mailbox
          </Link>
        }
      >
        Addresses on your own domains, plus any external accounts you read over IMAP.
      </PageHeader>

      <MailboxList mailboxes={mailboxes.map(publicMailbox)} />
    </div>
  );
}

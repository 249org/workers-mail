import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { MailboxList } from "@/components/settings/mailbox-list";
import { OauthErrorNotice } from "@/components/settings/oauth-error-notice";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mailboxes" };

export default async function MailboxesPage() {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <>
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
      <OauthErrorNotice />
      <SettingsBody flush>
        <MailboxList mailboxes={mailboxes.map(publicMailbox)} />
      </SettingsBody>
    </>
  );
}

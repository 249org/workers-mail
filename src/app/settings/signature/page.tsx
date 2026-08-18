import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import { SignatureForm } from "@/components/settings/signature-form";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signature" };

export default async function SignaturePage() {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <>
      <PageHeader title="Signature">
        The sign-off appended to mail you send. Plain text. Optional wording per mailbox.
      </PageHeader>
      <SettingsBody flush>
        <SignatureForm mailboxes={mailboxes.map(publicMailbox)} />
      </SettingsBody>
    </>
  );
}

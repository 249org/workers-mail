import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { domains } from "@/lib/db/schema";
import { NewMailboxForm } from "@/components/settings/new-mailbox-form";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Add a mailbox" };

export default async function NewMailboxPage() {
  const { user, db } = await requireUser();

  const available = await db
    .select({ id: domains.id, name: domains.name, status: domains.status })
    .from(domains)
    .where(eq(domains.ownerId, user.id))
    .orderBy(asc(domains.name));

  return (
    <>
      <PageHeader title="Add a mailbox">
        Connect Google or Microsoft in a couple of fields, add any other IMAP account, or create an address on a domain you already run.
      </PageHeader>
      <SettingsBody>
        <NewMailboxForm domains={available} />
      </SettingsBody>
    </>
  );
}

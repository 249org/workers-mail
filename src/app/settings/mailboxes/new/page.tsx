import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { domains } from "@/lib/db/schema";
import { NewMailboxForm } from "@/components/settings/new-mailbox-form";
import { PageHeader } from "@/components/settings/page-header";

export default async function NewMailboxPage() {
  const { user, db } = await requireUser();

  const available = await db
    .select({ id: domains.id, name: domains.name, status: domains.status })
    .from(domains)
    .where(eq(domains.ownerId, user.id))
    .orderBy(asc(domains.name));

  return (
    <div>
      <PageHeader title="Add a mailbox">
        Create an address on a domain you have connected, or read an existing account over IMAP.
      </PageHeader>
      <NewMailboxForm domains={available} />
    </div>
  );
}

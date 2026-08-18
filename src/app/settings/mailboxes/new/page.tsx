import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { domains } from "@/lib/db/schema";
import { NewMailboxForm } from "@/components/settings/new-mailbox-form";

export default async function NewMailboxPage() {
  const { user, db } = await requireUser();

  const available = await db
    .select({ id: domains.id, name: domains.name, status: domains.status })
    .from(domains)
    .where(eq(domains.ownerId, user.id))
    .orderBy(asc(domains.name));

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">Add a mailbox</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Create an address on a domain you have connected, or read an existing account over IMAP.
      </p>
      <NewMailboxForm domains={available} />
    </div>
  );
}

import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { contacts } from "@/lib/db/schema";
import { ContactList } from "@/components/settings/contact-list";

export default async function ContactsPage() {
  const { user, db } = await requireUser();

  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.ownerId, user.id))
    .orderBy(desc(contacts.lastSeenAt))
    .limit(500);

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">Contacts</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Collected automatically from the mail you receive and send.
      </p>
      <ContactList
        contacts={rows.map((contact) => ({
          id: contact.id,
          email: contact.email,
          name: contact.name,
          notes: contact.notes,
          lastSeenAt: contact.lastSeenAt,
        }))}
      />
    </div>
  );
}

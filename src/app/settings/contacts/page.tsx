import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { contacts } from "@/lib/db/schema";
import { ContactList } from "@/components/settings/contact-list";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const { user, db } = await requireUser();

  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.ownerId, user.id))
    .orderBy(desc(contacts.lastSeenAt))
    .limit(500);

  return (
    <>
      <PageHeader title="Contacts">
        Collected automatically from the mail you receive and send.
      </PageHeader>
      <SettingsBody flush>
        <ContactList
          contacts={rows.map((contact) => ({
            id: contact.id,
            email: contact.email,
            name: contact.name,
            notes: contact.notes,
            lastSeenAt: contact.lastSeenAt,
          }))}
        />
      </SettingsBody>
    </>
  );
}

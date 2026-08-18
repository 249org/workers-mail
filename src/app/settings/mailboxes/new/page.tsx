import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { domains } from "@/lib/db/schema";
import { NewMailboxForm } from "@/components/settings/new-mailbox-form";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import { oauthAvailability } from "@/lib/oauth/providers";
import { env } from "@/lib/env";
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
        One-click Google or Microsoft, any other IMAP host, or an address on a domain you already run.
      </PageHeader>
      <SettingsBody>
        <NewMailboxForm domains={available} oauth={oauthAvailability(env())} />
      </SettingsBody>
    </>
  );
}

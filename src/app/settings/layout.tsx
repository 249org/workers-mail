import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { AppHeader } from "@/components/app-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        email={user.email}
        name={user.name}
        mailboxes={mailboxes.map(publicMailbox)}
        context="settings"
      />

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-8 py-8">
        <SettingsNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

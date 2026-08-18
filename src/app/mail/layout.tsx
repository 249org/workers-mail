import { Toaster } from "sonner";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { AppHeader } from "@/components/app-header";
import { privateMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = privateMetadata("Mail");

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader
        email={user.email}
        name={user.name}
        mailboxes={mailboxes.map(publicMailbox)}
        context="mail"
      />
      <div className="min-h-0 flex-1">{children}</div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            boxShadow: "var(--shadow-pop)",
            borderRadius: "4px",
          },
        }}
      />
    </div>
  );
}

import Link from "next/link";
import { Toaster } from "sonner";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-8 py-3">
        <div className="flex items-center gap-3">
          <Link href="/mail" className="text-[14px] font-semibold tracking-tight">
            Workers Mail
          </Link>
          {mailboxes.length > 0 && (
            <span className="hidden font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:inline">
              {mailboxes.length} mailbox{mailboxes.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[12px] text-muted-foreground sm:inline">{user.email}</span>
          <Link href="/settings" className="btn btn-ghost">
            Settings
          </Link>
          <SignOutButton />
        </div>
      </header>
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

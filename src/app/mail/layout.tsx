import Link from "next/link";
import { Toaster } from "sonner";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { SignOutButton } from "@/components/sign-out-button";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  return (
    <div className="flex h-screen flex-col bg-[var(--surface)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--raised)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/mail" className="text-sm font-semibold tracking-tight">
            Workers Mail
          </Link>
          {mailboxes.length > 0 && (
            <span className="hidden text-xs text-[var(--ink-faint)] sm:inline">
              {mailboxes.length} mailbox{mailboxes.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="btn btn-ghost !py-1.5 text-xs">
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
            background: "var(--raised)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
            boxShadow: "var(--shadow-pop)",
          },
        }}
      />
    </div>
  );
}

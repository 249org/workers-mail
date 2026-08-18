import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { SignOutButton } from "@/components/sign-out-button";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-8 py-3">
        <div className="flex items-center gap-3">
          <Link href="/mail" className="text-[14px] font-semibold tracking-tight">
            Workers Mail
          </Link>
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Settings
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[12px] text-muted-foreground sm:inline">{user.email}</span>
          <Link href="/mail" className="btn btn-ghost">
            Back to mail
          </Link>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-8 py-8">
        <SettingsNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

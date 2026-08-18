import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { SignOutButton } from "@/components/sign-out-button";

const SECTIONS = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/domains", label: "Domains" },
  { href: "/settings/mailboxes", label: "Mailboxes" },
  { href: "/settings/contacts", label: "Contacts" },
  { href: "/settings/api-keys", label: "API keys" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--raised)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/mail" className="text-sm font-semibold tracking-tight">
            Workers Mail
          </Link>
          <span className="text-xs text-[var(--ink-faint)]">Settings</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[var(--ink-muted)] sm:inline">{user.email}</span>
          <Link href="/mail" className="btn btn-ghost !py-1.5 text-xs">
            Back to mail
          </Link>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-4 py-8 sm:px-6">
        <nav className="hidden w-40 shrink-0 sm:block">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="mb-0.5 block rounded-md px-2.5 py-1.5 text-sm text-[var(--ink-muted)] hover:bg-[var(--raised)] hover:text-[var(--ink)]"
            >
              {section.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

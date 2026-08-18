"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/domains", label: "Domains" },
  { href: "/settings/mailboxes", label: "Mailboxes" },
  { href: "/settings/contacts", label: "Contacts" },
  { href: "/settings/api-keys", label: "API keys" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-44 shrink-0 sm:block">
      {SECTIONS.map((section) => {
        const active =
          section.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className="mb-0.5 flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px]"
            style={{
              background: active ? "var(--accent-subtle)" : "transparent",
              color: active ? "var(--primary)" : "var(--muted-foreground)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <span className="flex-1">{section.label}</span>
            {active && (
              <span
                aria-hidden
                className="h-1 w-1 rounded-full"
                style={{ background: "var(--primary)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

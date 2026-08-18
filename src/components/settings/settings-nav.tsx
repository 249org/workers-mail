"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SETTINGS_PAGES = [
  {
    href: "/settings",
    label: "Overview",
    command: "Open settings overview",
    keywords: ["overview", "health", "usage"],
    group: "Workspace",
  },
  {
    href: "/settings/appearance",
    label: "Appearance",
    command: "Open appearance settings",
    keywords: ["theme", "dark", "light", "palette", "colour", "color"],
    group: "Workspace",
  },
  {
    href: "/settings/domains",
    label: "Domains",
    command: "Open domains",
    keywords: ["dns", "routing", "domain"],
    group: "Mail",
  },
  {
    href: "/settings/mailboxes",
    label: "Mailboxes",
    command: "Open mailboxes",
    keywords: ["accounts", "imap", "smtp"],
    group: "Mail",
  },
  {
    href: "/settings/mailboxes/new",
    label: "Add mailbox",
    command: "Add mailbox",
    keywords: ["connect", "imap", "new", "account"],
    group: "Mail",
  },
  {
    href: "/settings/contacts",
    label: "Contacts",
    command: "Open contacts",
    keywords: ["people", "address book"],
    group: "Mail",
  },
  {
    href: "/settings/api-keys",
    label: "API keys",
    command: "Open API keys",
    keywords: ["token", "access", "developer"],
    group: "Access",
  },
] as const;

const NAV_GROUPS = [
  { label: "Workspace", hrefs: ["/settings", "/settings/appearance"] },
  { label: "Mail", hrefs: ["/settings/domains", "/settings/mailboxes", "/settings/contacts"] },
  { label: "Access", hrefs: ["/settings/api-keys"] },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-44 shrink-0 sm:block">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="label px-2.5 pb-1">{group.label}</p>
          {SETTINGS_PAGES.filter((item) => (group.hrefs as readonly string[]).includes(item.href)).map((item) => {
            const active =
              item.href === "/settings"
                ? pathname === "/settings"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="nav-row"
                data-active={active ? "true" : undefined}
              >
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

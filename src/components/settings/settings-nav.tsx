"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Overview" },
      { href: "/settings/appearance", label: "Appearance" },
    ],
  },
  {
    label: "Mail",
    items: [
      { href: "/settings/domains", label: "Domains" },
      { href: "/settings/mailboxes", label: "Mailboxes" },
      { href: "/settings/contacts", label: "Contacts" },
    ],
  },
  {
    label: "Access",
    items: [{ href: "/settings/api-keys", label: "API keys" }],
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-44 shrink-0 sm:block">
      {GROUPS.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="label px-2.5 pb-1">{group.label}</p>
          {group.items.map((item) => {
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

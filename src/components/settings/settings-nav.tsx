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
    href: "/settings/shortcuts",
    label: "Shortcuts",
    command: "Open shortcut settings",
    keywords: ["keyboard", "hotkeys", "bindings", "keys"],
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
    href: "/settings/signature",
    label: "Signature",
    command: "Open signature settings",
    keywords: ["sign-off", "footer", "closing", "signature"],
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
    href: "/settings/privacy",
    label: "Privacy",
    command: "Open privacy settings",
    keywords: ["images", "contacts", "tracking", "data"],
    group: "Account",
  },
  {
    href: "/settings/security",
    label: "Security",
    command: "Open security settings",
    keywords: ["password", "2fa", "totp", "session", "two-factor"],
    group: "Account",
  },
  {
    href: "/settings/api-keys",
    label: "API keys",
    command: "Open API keys",
    keywords: ["token", "access", "developer"],
    group: "Account",
  },
] as const;

const NAV_GROUPS = [
  { label: "Workspace", hrefs: ["/settings", "/settings/appearance", "/settings/shortcuts"] },
  {
    label: "Mail",
    hrefs: ["/settings/domains", "/settings/mailboxes", "/settings/signature", "/settings/contacts"],
  },
  { label: "Account", hrefs: ["/settings/privacy", "/settings/security", "/settings/api-keys"] },
] as const;

export type SettingsIndex = {
  appearance: string;
  mailboxCount: number;
  mailboxHint: string;
  domainCount: number;
  contactCount: number;
  keyCount: number;
  twoFactor: boolean;
  remoteImages: "ask" | "allow";
  signatureOn: boolean;
};

export function SettingsNav({ index, view }: { index: SettingsIndex; view?: string }) {
  const pathname = usePathname();
  const current = view ?? pathname;

  return (
    <nav className="settings-index" aria-label="Settings">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="settings-index-group">
          <p className="label px-2.5 pb-1">{group.label}</p>
          {SETTINGS_PAGES.filter((item) => (group.hrefs as readonly string[]).includes(item.href)).map((item) => {
            const active =
              item.href === "/settings"
                ? current === "/settings"
                : item.href === "/settings/mailboxes"
                  ? current.startsWith("/settings/mailboxes")
                  : current.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                scroll={false}
                className="settings-index-item"
                data-active={active ? "true" : undefined}
              >
                <span className="settings-index-label">{item.label}</span>
                <span className="settings-index-hint">{hintFor(item.href, index)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function hintFor(href: string, index: SettingsIndex): string {
  switch (href) {
    case "/settings":
      return index.mailboxCount === 0
        ? "Nothing connected"
        : `${index.mailboxCount} mailbox${index.mailboxCount === 1 ? "" : "es"}`;
    case "/settings/appearance":
      return index.appearance;
    case "/settings/shortcuts":
      return "Keys and jumps";
    case "/settings/domains":
      return index.domainCount === 0 ? "None connected" : `${index.domainCount} connected`;
    case "/settings/mailboxes":
      return index.mailboxHint;
    case "/settings/signature":
      return index.signatureOn ? "On" : "None";
    case "/settings/contacts":
      return index.contactCount === 0 ? "Empty" : `${index.contactCount} people`;
    case "/settings/privacy":
      return index.remoteImages === "allow" ? "Images load" : "Images blocked";
    case "/settings/security":
      return index.twoFactor ? "2FA on" : "Password";
    case "/settings/api-keys":
      return index.keyCount === 0 ? "None issued" : `${index.keyCount} issued`;
    default:
      return "";
  }
}

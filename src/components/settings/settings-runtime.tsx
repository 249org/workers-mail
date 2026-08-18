"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SETTINGS_PAGES, SettingsNav, type SettingsIndex } from "./settings-nav";
import { PageHeader, SettingsBody } from "./page-header";
import { useSettingsViewStore } from "./settings-view-store";

const SETTINGS_COPY: Record<string, { title: string; lede: string }> = {
  "/settings": {
    title: "Overview",
    lede: "This deployment runs on your Cloudflare account.",
  },
  "/settings/appearance": {
    title: "Appearance",
    lede: "Pick a colour template and whether the workspace follows the OS, or stays light or dark.",
  },
  "/settings/shortcuts": {
    title: "Shortcuts",
    lede: "The same keys as ?. Reassign any of them; they save to this workspace.",
  },
  "/settings/domains": {
    title: "Domains",
    lede: "Connect a domain you already run on Cloudflare. Verification enables Email Routing and points your addresses at this Worker.",
  },
  "/settings/mailboxes": {
    title: "Mailboxes",
    lede: "Addresses on your own domains, plus any external accounts you read over IMAP.",
  },
  "/settings/mailboxes/new": {
    title: "Add a mailbox",
    lede: "One-click Google or Microsoft, any other IMAP host, or an address on a domain you already run.",
  },
  "/settings/signature": {
    title: "Signature",
    lede: "The sign-off appended to mail you send. Plain text. Optional wording per mailbox.",
  },
  "/settings/contacts": {
    title: "Contacts",
    lede: "Collected automatically from the mail you receive and send.",
  },
  "/settings/privacy": {
    title: "Privacy",
    lede: "How mail is shown, whether people are added to the address book, and where this workspace keeps its data.",
  },
  "/settings/security": {
    title: "Security",
    lede: "Password, two-factor authentication, and the browsers signed in to this workspace.",
  },
  "/settings/api-keys": {
    title: "API keys",
    lede: "Send a key as Authorization: Bearer … to use the mail API from scripts.",
  },
};

export function SettingsRuntime({
  index,
  children,
}: {
  index: SettingsIndex;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const prepared = useSettingsViewStore((state) => state.view);
  const view = prepared ?? pathname;
  const [visited, setVisited] = useState([pathname]);
  if (!visited.includes(pathname)) {
    setVisited((current) => (current.includes(pathname) ? current : [...current, pathname]));
  }

  useEffect(() => {
    useSettingsViewStore.getState().sync(pathname);
  }, [pathname]);

  useEffect(() => {
    for (const page of SETTINGS_PAGES) {
      void router.prefetch(page.href);
    }
  }, [router]);

  const waiting = !visited.includes(view);

  return (
    <div
      className="settings-shell"
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (!anchor || (anchor.target && anchor.target !== "_self")) return;
        const href = anchor.getAttribute("href");
        if (!href?.startsWith("/settings")) return;
        useSettingsViewStore.getState().prepare(href);
      }}
    >
      <SettingsNav index={index} view={view} />
      <main className="settings-spread">
        {visited.map((href) => (
          <SettingsSlot key={href} active={href === view} live={href === pathname}>
            {href === pathname ? children : null}
          </SettingsSlot>
        ))}
        {waiting ? <SettingsFallback href={view} /> : null}
      </main>
    </div>
  );
}

function SettingsSlot({
  active,
  live,
  children,
}: {
  active: boolean;
  live: boolean;
  children: ReactNode;
}) {
  const frozen = useRef<ReactNode>(children);
  if (live) frozen.current = children;

  return (
    <div className="settings-spread-slot" hidden={!active} inert={!active}>
      {frozen.current}
    </div>
  );
}

function SettingsFallback({ href }: { href: string }) {
  const copy = SETTINGS_COPY[href] ?? {
    title: SETTINGS_PAGES.find((page) => page.href === href)?.label ?? "Settings",
    lede: "",
  };

  return (
    <div className="settings-spread-slot">
      <PageHeader title={copy.title}>{copy.lede || null}</PageHeader>
      <SettingsBody flush>{null}</SettingsBody>
    </div>
  );
}

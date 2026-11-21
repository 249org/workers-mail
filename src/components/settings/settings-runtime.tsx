"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { usePaletteStore } from "@/lib/palette/store";
import { Frame, FrameSidebar } from "@/components/shell/frame";
import { Rail, type RailUser } from "@/components/shell/rail";
import { CommandCenter } from "@/components/palette/command-center";
import { MailIcon } from "@/components/mail/icons";
import { SETTINGS_PAGES, SettingsNav, type SettingsIndex } from "./settings-nav";
import { PageHeader, SettingsBody } from "./page-header";
import { useSettingsViewStore } from "./settings-view-store";

const SETTINGS_COPY: Record<string, { title: string; lede: string }> = {
  "/settings": {
    title: "Overview",
    lede: "Everything here runs on infrastructure you control.",
  },
  "/settings/appearance": {
    title: "Appearance",
    lede: "Every theme comes in light and dark. Pick one, set the mode, or mix your own.",
  },
  "/settings/shortcuts": {
    title: "Shortcuts",
    lede: "The same keys as ?. Reassign any of them; they save to this workspace.",
  },
  "/settings/domains": {
    title: "Domains",
    lede: "Connect a domain whose DNS you control. Verification sets up inbound routing and points your addresses here.",
  },
  "/settings/mailboxes": {
    title: "Mailboxes",
    lede: "Addresses on your own domains, plus any external accounts you read over IMAP.",
  },
  "/settings/mailboxes/new": {
    title: "Add a mailbox",
    lede: "One-click Google, any other IMAP host, or an address on a domain you already run.",
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
    lede: "Your name and photo, password, two-factor authentication, and the browsers signed in to this workspace.",
  },
  "/settings/api-keys": {
    title: "API keys",
    lede: "Send a key as Authorization: Bearer … to use the mail API from scripts.",
  },
};

/** The page's name for the breadcrumb, whichever page is showing or on its way. */
function titleFor(href: string): string {
  return (
    SETTINGS_COPY[href]?.title ??
    SETTINGS_PAGES.find((page) => page.href !== "/settings" && href.startsWith(page.href))?.label ??
    "Overview"
  );
}

export function SettingsRuntime({
  index,
  mailboxes,
  user,
  children,
}: {
  index: SettingsIndex;
  mailboxes: PublicMailbox[];
  user: RailUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
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
  const closeNav = () => setNavOpen(false);

  return (
    <div
      className="h-full"
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (!anchor || (anchor.target && anchor.target !== "_self")) return;
        const href = anchor.getAttribute("href");
        if (!href?.startsWith("/settings")) return;
        useSettingsViewStore.getState().prepare(href);
        closeNav();
      }}
    >
      <Frame
        navOpen={navOpen}
        onCloseNav={closeNav}
        nav={
          <>
            <Rail
              mailboxes={mailboxes}
              activeMailboxId={null}
              settingsActive
              user={user}
              onSearch={() => {
                closeNav();
                usePaletteStore.getState().openPalette();
              }}
              onNavigate={closeNav}
            />
            <FrameSidebar label="Settings">
              <div className="sidebar-head">
                <p className="sidebar-title">Settings</p>
              </div>
              <SettingsNav index={index} view={view} />
            </FrameSidebar>
          </>
        }
      >
        <header className="frame-header">
          <button
            type="button"
            className="btn btn-quiet btn-icon frame-menu"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <MailIcon name="sidebar" />
          </button>
          <nav aria-label="Breadcrumb" className="frame-crumbs">
            <Link href="/settings">Settings</Link>
            {view !== "/settings" ? (
              <>
                <span aria-hidden>/</span>
                <span className="frame-crumb-current">{titleFor(view)}</span>
              </>
            ) : null}
          </nav>
          <Link href="/mail" className="btn btn-ghost ml-auto">
            Back to mail
          </Link>
        </header>
        <main className="settings-spread">
          {visited.map((href) => (
            <SettingsSlot key={href} active={href === view} live={href === pathname}>
              {href === pathname ? children : null}
            </SettingsSlot>
          ))}
          {waiting ? <SettingsFallback href={view} /> : null}
        </main>
      </Frame>
      <CommandCenter mailboxes={mailboxes} />
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

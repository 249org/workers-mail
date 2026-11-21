"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { resolveDark } from "@/lib/appearance";
import { useAppearanceStore } from "@/lib/appearance-store";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand/wordmark";
import { MailIcon } from "@/components/mail/icons";

export type RailUser = {
  email: string;
  name: string | null;
  avatarUpdatedAt?: number | null;
};

/** One letter for a mailbox, from its name if it has one. */
function initial(mailbox: PublicMailbox): string {
  const source = mailbox.displayName?.trim() || mailbox.address;
  return (source.match(/[\p{L}\p{N}]/u)?.[0] ?? "@").toUpperCase();
}

/**
 * The thin column down the edge: home, search, compose, one tile per mailbox, then
 * settings and the account at the foot. Each mailbox is to this app what an app is to a
 * launcher — the sidebar beside it shows whichever one is open.
 */
export function Rail({
  mailboxes,
  activeMailboxId,
  settingsActive = false,
  user,
  onSearch,
  onCompose,
  onNavigate,
}: {
  mailboxes: PublicMailbox[];
  activeMailboxId: string | null;
  settingsActive?: boolean;
  user: RailUser;
  onSearch: () => void;
  onCompose?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="rail" aria-label="Workspace">
      <Link href="/mail" className="rail-home tip tip-side" data-tip="Workers Mail" aria-label="Mail" onClick={onNavigate}>
        <BrandMark className="size-4" />
      </Link>

      <button type="button" className="rail-btn pressable tip tip-side" data-tip="Search  ⌘K" aria-label="Search" onClick={onSearch}>
        <MailIcon name="search" />
      </button>
      {onCompose ? (
        <button type="button" className="rail-btn pressable tip tip-side" data-tip="Compose  C" aria-label="Compose" onClick={onCompose}>
          <MailIcon name="compose" />
        </button>
      ) : null}

      <span className="rail-rule" aria-hidden />

      {mailboxes.map((mailbox) => (
        <Link
          key={mailbox.id}
          href={`/mail/${mailbox.id}`}
          className="rail-btn rail-mailbox pressable tip tip-side"
          data-tip={mailbox.address}
          aria-label={mailbox.address}
          aria-current={mailbox.id === activeMailboxId ? "true" : undefined}
          onClick={onNavigate}
        >
          {initial(mailbox)}
        </Link>
      ))}
      <Link
        href="/settings/mailboxes/new"
        className="rail-btn pressable tip tip-side"
        data-tip="Add mailbox"
        aria-label="Add mailbox"
        onClick={onNavigate}
      >
        <MailIcon name="plus" />
      </Link>

      <div className="rail-foot">
        <ModeToggle />
        <Link
          href="/settings"
          className="rail-btn pressable tip tip-side"
          data-tip="Settings"
          aria-label="Settings"
          aria-current={settingsActive ? "page" : undefined}
          onClick={onNavigate}
        >
          <MailIcon name="settings" />
        </Link>
        <AccountMenu
          email={user.email}
          name={user.name}
          mailboxes={mailboxes}
          avatarUpdatedAt={user.avatarUpdatedAt}
          placement="rail"
        />
      </div>
    </nav>
  );
}

/** Whether the device is in dark mode, kept current as it changes at dusk and dawn. */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/**
 * Light or dark in one press, keeping the theme: dark Nord becomes light Nord. The icon
 * is the mode it will switch to, as a light switch shows where it goes.
 */
function ModeToggle() {
  const prefs = useAppearanceStore((state) => state.prefs);
  const setPrefs = useAppearanceStore((state) => state.setPrefs);
  const dark = resolveDark(prefs.mode, usePrefersDark());
  const label = dark ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      className="rail-btn pressable tip tip-side"
      data-tip={label}
      aria-label={label}
      onClick={() => setPrefs({ ...prefs, mode: dark ? "light" : "dark" })}
    >
      <MailIcon name={dark ? "sun" : "moon"} />
    </button>
  );
}

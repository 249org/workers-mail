"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { avatarSrc } from "@/lib/mail/profile-photo";
import { PersonAvatar } from "./person-avatar";
import { useDismiss } from "./ui/use-dismiss";

type Props = {
  email: string;
  name: string | null;
  mailboxes: PublicMailbox[];
  avatarUpdatedAt?: number | null;
  /** On the rail the menu opens beside the button and upwards, away from the screen edge. */
  placement?: "header" | "rail";
};

export function AccountMenu({ email, name, mailboxes, avatarUpdatedAt, placement = "header" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useDismiss(open, root, useCallback(() => setOpen(false), []));

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <PersonAvatar
          name={name?.trim() || email}
          src={avatarSrc(avatarUpdatedAt)}
          className="contents"
        />
        <span className="sr-only">Account menu for {email}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="account-menu"
          data-placement={placement}
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-[13px] font-medium">{name?.trim() || email}</p>
            {name?.trim() && (
              <p className="truncate text-[13px] text-muted-foreground">{email}</p>
            )}
          </div>

          {mailboxes.length > 0 && (
            <div className="border-b border-border py-1">
              <p className="label px-3 py-1.5">Accounts</p>
              {mailboxes.map((mailbox) => (
                <Link
                  key={mailbox.id}
                  href={`/mail/${mailbox.id}`}
                  role="menuitem"
                  className="account-item"
                  onClick={() => setOpen(false)}
                >
                  <span className="min-w-0 flex-1 truncate">{mailbox.address}</span>
                  <span className="label mb-0 shrink-0">
                    {mailbox.type === "native" ? "Domain" : "IMAP"}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <div className="py-1">
            <Link
              href="/settings"
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
            <Link
              href="/settings/mailboxes/new"
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              Add account
            </Link>
            <Link
              href="/settings/mailboxes"
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              Manage accounts
            </Link>
            <Link
              href="/settings/security"
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              Security
            </Link>
            <Link
              href="/settings/privacy"
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              Privacy
            </Link>
            <Link
              href="/settings/appearance"
              role="menuitem"
              className="account-item"
              onClick={() => setOpen(false)}
            >
              Appearance
            </Link>
          </div>

          <div className="border-t border-border py-1">
            <button
              type="button"
              role="menuitem"
              className="account-item w-full text-left"
              style={{ color: "var(--danger)" }}
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

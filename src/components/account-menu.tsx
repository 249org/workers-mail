"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";

type Props = {
  email: string;
  name: string | null;
  mailboxes: PublicMailbox[];
};

function initials(email: string, name: string | null): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "W") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase().slice(0, 2);
}

export function AccountMenu({ email, name, mailboxes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        <span aria-hidden>{initials(email, name)}</span>
        <span className="sr-only">Account menu for {email}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="account-menu"
          style={{
            boxShadow: "var(--shadow-pop)",
          }}
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

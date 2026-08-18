"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { formatRelative } from "@/lib/format";
import { MailIcon } from "@/components/mail/icons";

export function MailboxList({ mailboxes }: { mailboxes: PublicMailbox[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (mailboxes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
        <span className="icon-well" aria-hidden>
          <MailIcon name="mailbox" />
        </span>
        <p className="text-[13px] text-muted-foreground">
          No mailboxes yet. Add a domain address or connect an existing IMAP account.
        </p>
        <Link href="/settings/mailboxes/new" className="btn btn-primary">
          Add mailbox
        </Link>
      </div>
    );
  }

  async function remove(mailboxId: string) {
    setPending(mailboxId);
    await fetch(`/api/mailboxes/${mailboxId}`, { method: "DELETE" });
    setConfirming(null);
    setPending(null);
    router.refresh();
  }

  return (
    <div className="settings-ledger">
      <div className="settings-ledger-head" aria-hidden>
        <span>Address</span>
        <span>Kind</span>
        <span className="max-md:hidden">Source</span>
        <span>Synced</span>
        <span />
      </div>
      {mailboxes.map((mailbox) => (
        <div key={mailbox.id} className="settings-ledger-row">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{mailbox.address}</p>
            {mailbox.syncError ? (
              <p className="mt-0.5 truncate text-[13px] text-[var(--danger)]">{mailbox.syncError}</p>
            ) : null}
          </div>
          <span className="text-[13px] text-muted-foreground">
            {mailbox.type === "native" ? "Domain" : "IMAP"}
          </span>
          <span className="truncate text-[13px] text-muted-foreground max-md:hidden">
            {mailbox.type === "native" ? "Cloudflare" : mailbox.imapHost ?? "—"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {mailbox.type === "external_imap" ? formatRelative(mailbox.lastSyncedAt) : "Live"}
          </span>
          <div className="flex justify-end gap-2">
            <Link href={`/mail/${mailbox.id}`} className="btn btn-ghost !h-8 !px-3">
              Open
            </Link>
            {confirming === mailbox.id ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger !h-8 !px-3"
                  disabled={pending === mailbox.id}
                  onClick={() => void remove(mailbox.id)}
                >
                  {pending === mailbox.id ? "Deleting…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !h-8 !px-3"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-danger !h-8 !px-3"
                onClick={() => setConfirming(mailbox.id)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

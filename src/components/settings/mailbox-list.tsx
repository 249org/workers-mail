"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { formatRelative } from "@/lib/format";

export function MailboxList({ mailboxes }: { mailboxes: PublicMailbox[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (mailboxes.length === 0) {
    return (
      <p className="card mt-6 p-6 text-center text-sm text-[var(--ink-muted)]">
        No mailboxes yet. Add a domain mailbox or connect an existing IMAP account.
      </p>
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
    <ul className="card mt-6 divide-y divide-[var(--border)]">
      {mailboxes.map((mailbox) => (
        <li key={mailbox.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{mailbox.address}</p>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {mailbox.type === "native"
                ? "Cloudflare domain mailbox"
                : `IMAP · ${mailbox.imapHost} · synced ${formatRelative(mailbox.lastSyncedAt)}`}
            </p>
            {mailbox.syncError && (
              <p className="mt-0.5 text-xs text-[var(--danger)]">{mailbox.syncError}</p>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <Link href={`/mail/${mailbox.id}`} className="btn btn-ghost !py-1.5 text-xs">
              Open
            </Link>
            {confirming === mailbox.id ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger !py-1.5 text-xs"
                  disabled={pending === mailbox.id}
                  onClick={() => void remove(mailbox.id)}
                >
                  {pending === mailbox.id ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !py-1.5 text-xs"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-danger !py-1.5 text-xs"
                onClick={() => setConfirming(mailbox.id)}
              >
                Delete
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

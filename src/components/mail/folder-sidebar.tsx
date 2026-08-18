"use client";

import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { formatRelative } from "@/lib/format";
import type { StreamState } from "./use-mail-stream";

export type FolderSummary = {
  id: string;
  name: string;
  role: string;
  unread: number;
};

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  folders: FolderSummary[];
  activeFolderId: string;
  streamState: StreamState;
  syncing: boolean;
  syncError: string | null;
  onCompose: () => void;
  onSync: () => void;
};

export function FolderSidebar({
  mailbox,
  mailboxes,
  folders,
  activeFolderId,
  streamState,
  syncing,
  syncError,
  onCompose,
  onSync,
}: Props) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="p-3">
        <button type="button" className="btn btn-primary w-full" onClick={onCompose}>
          Compose
        </button>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {folders.map((folder) => {
          const active = folder.id === activeFolderId;
          return (
            <Link
              key={folder.id}
              href={`/mail/${mailbox.id}/${folder.id}`}
              className="mb-0.5 flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm"
              style={{
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--ink)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span className="truncate">{folder.name}</span>
              {folder.unread > 0 && (
                <span className="ml-2 shrink-0 text-xs text-[var(--ink-muted)]">
                  {folder.unread}
                </span>
              )}
            </Link>
          );
        })}

        {mailboxes.length > 1 && (
          <div className="mt-5">
            <p className="label px-2.5">Mailboxes</p>
            {mailboxes.map((entry) => (
              <Link
                key={entry.id}
                href={`/mail/${entry.id}`}
                className="mb-0.5 block truncate rounded-md px-2.5 py-1.5 text-sm"
                style={{
                  color: entry.id === mailbox.id ? "var(--ink)" : "var(--ink-muted)",
                  fontWeight: entry.id === mailbox.id ? 600 : 400,
                }}
              >
                {entry.address}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-3 text-xs text-[var(--ink-muted)]">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: streamState === "open" ? "var(--success)" : "var(--warning)" }}
            />
            {streamState === "open" ? "Live" : streamState === "polling" ? "Polling" : "Connecting"}
          </span>
          {mailbox.type === "external_imap" && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="text-[var(--accent)] disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>

        {mailbox.type === "external_imap" && (
          <p className="mt-1.5 truncate">Last synced {formatRelative(mailbox.lastSyncedAt)}</p>
        )}
        {syncError && <p className="mt-1.5 text-[var(--danger)]">{syncError}</p>}
        {mailbox.type === "external_imap" && !mailbox.backfillComplete && !syncError && (
          <p className="mt-1.5">Backfilling older mail…</p>
        )}
      </div>
    </aside>
  );
}

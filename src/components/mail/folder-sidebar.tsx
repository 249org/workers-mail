"use client";

import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { useMailStore } from "@/lib/mail/view-store";
import { formatRelative } from "@/lib/format";
import type { StreamState } from "./use-mail-stream";

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  streamState: StreamState;
  onCompose: () => void;
  onSync: () => void;
  onOpenPalette: () => void;
};

export function FolderSidebar({
  mailbox,
  mailboxes,
  streamState,
  onCompose,
  onSync,
  onOpenPalette,
}: Props) {
  const folders = useMailStore((state) => state.folders);
  const activeFolderId = useMailStore((state) => state.folderId);
  const syncing = useMailStore((state) => state.syncing);
  const syncError = useMailStore((state) => state.syncError);

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="space-y-1.5 p-2.5">
        <button type="button" className="btn btn-primary w-full" onClick={onCompose}>
          Compose
          <span className="kbd" style={{ background: "transparent", color: "inherit", opacity: 0.75 }}>
            C
          </span>
        </button>
        <button type="button" className="btn btn-ghost w-full !justify-between" onClick={onOpenPalette}>
          <span className="text-[var(--ink-muted)]">Search</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {folders.map((folder) => {
          const active = folder.id === activeFolderId;
          return (
            <Link
              key={folder.id}
              href={`/mail/${mailbox.id}/${folder.id}`}
              className="mb-0.5 flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px]"
              style={{
                background: active ? "var(--selected)" : "transparent",
                color: active ? "var(--accent)" : "var(--ink)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span className="truncate">{folder.name}</span>
              {folder.unread > 0 && (
                <span className="ml-2 shrink-0 text-[11px] tabular-nums text-[var(--ink-muted)]">
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
                className="mb-0.5 block truncate rounded-md px-2.5 py-1.5 text-[13px]"
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

      <div className="border-t border-[var(--border)] p-2.5 text-[11px] text-[var(--ink-muted)]">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: streamState === "open" ? "var(--success)" : "var(--warning)",
              }}
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
              {syncing ? "Syncing" : "Sync"}
            </button>
          )}
        </div>

        {mailbox.type === "external_imap" && (
          <p className="mt-1.5 truncate">Synced {formatRelative(mailbox.lastSyncedAt)}</p>
        )}
        {syncError && <p className="mt-1.5 text-[var(--danger)]">{syncError}</p>}
      </div>
    </aside>
  );
}

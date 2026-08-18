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
  const lastSyncedAt = useMailStore((state) => state.lastSyncedAt);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
        <button type="button" className="btn btn-primary w-full" onClick={onCompose}>
          Compose
          <span
            className="kbd"
            style={{
              background: "transparent",
              color: "inherit",
              borderColor: "color-mix(in srgb, white 32%, transparent)",
              opacity: 0.85,
            }}
          >
            C
          </span>
        </button>
        <button type="button" className="field flex items-center justify-between" onClick={onOpenPalette}>
          <span className="text-[var(--ink-faint)]">Search</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {folders.map((folder) => {
          const active = folder.id === activeFolderId;
          return (
            <Link
              key={folder.id}
              href={`/mail/${mailbox.id}/${folder.id}`}
              prefetch={false}
              className="nav-row"
              data-active={active ? "true" : undefined}
            >
              <span className="truncate">{folder.name}</span>
              {folder.unread > 0 && (
                <span className="shrink-0 tabular-nums text-[var(--ink-muted)]">
                  {folder.unread}
                </span>
              )}
            </Link>
          );
        })}

        {mailboxes.length > 1 && (
          <div className="mt-4">
            <p className="label px-2.5">Mailboxes</p>
            {mailboxes.map((entry) => (
              <Link
                key={entry.id}
                href={`/mail/${entry.id}`}
                className="nav-row"
                data-active={entry.id === mailbox.id ? "true" : undefined}
              >
                <span className="truncate">{entry.address}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3 text-[13px] text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: streamState === "open" ? "var(--success)" : "var(--warning)",
              }}
            />
            <span className="truncate">
              {streamState === "open" ? "Live" : streamState === "polling" ? "Polling" : "Connecting"}
            </span>
          </span>
          {mailbox.type === "external_imap" && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="shrink-0 text-primary disabled:opacity-50"
            >
              {syncing ? "Syncing" : "Sync"}
            </button>
          )}
        </div>

        {mailbox.type === "external_imap" && (
          <p className="mt-1.5 truncate text-[var(--ink-faint)]">
            Synced {formatRelative(lastSyncedAt)}
          </p>
        )}
        {syncError && <p className="mt-1.5 text-[var(--danger)]">{syncError}</p>}
      </div>
    </aside>
  );
}

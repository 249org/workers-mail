"use client";

import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { navigateMailFolder, useMailStore } from "@/lib/mail/view-store";
import { formatRelative } from "@/lib/format";
import { folderIconName, MailIcon } from "./icons";
import type { StreamState } from "./use-mail-stream";

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  streamState: StreamState;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCompose: () => void;
  onSync: () => void;
  onOpenPalette: () => void;
};

export function FolderSidebar({
  mailbox,
  mailboxes,
  streamState,
  collapsed,
  onToggleCollapsed,
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
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-card ${collapsed ? "w-14" : "w-56"}`}
      data-collapsed={collapsed ? "true" : undefined}
    >
      <div className={`flex flex-col gap-2 pt-3 pb-2 ${collapsed ? "items-center px-1.5" : "px-3"}`}>
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          onClick={onToggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand folder sidebar" : "Collapse folder sidebar"}
          title={collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
        >
          <MailIcon name="sidebar" />
        </button>

        <button
          type="button"
          className={collapsed ? "btn btn-primary btn-icon" : "btn btn-primary w-full"}
          onClick={onCompose}
          aria-label="Compose"
          title="Compose (C)"
        >
          <MailIcon name="compose" />
          {!collapsed && (
            <>
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
            </>
          )}
        </button>
        <button
          type="button"
          className={
            collapsed
              ? "btn btn-ghost btn-icon"
              : "field flex items-center justify-between"
          }
          onClick={onOpenPalette}
          aria-label="Search"
          title="Search (⌘K)"
        >
          {collapsed ? (
            <MailIcon name="search" />
          ) : (
            <>
              <span className="text-[var(--ink-faint)]">Search</span>
              <span className="kbd">⌘K</span>
            </>
          )}
        </button>
      </div>

      <nav className={`scroll-thin min-h-0 flex-1 overflow-y-auto py-2 ${collapsed ? "px-1.5" : "px-3"}`}>
        {folders.map((folder) => {
          const active = folder.id === activeFolderId;
          const unread = folder.unread > 0 ? (folder.unread > 99 ? "99+" : String(folder.unread)) : null;
          return (
            <Link
              key={folder.id}
              href={`/mail/${mailbox.id}/${folder.id}`}
              className="nav-row"
              data-active={active ? "true" : undefined}
              data-compact={collapsed ? "true" : undefined}
              title={collapsed ? folder.name : undefined}
              aria-label={unread ? `${folder.name}, ${folder.unread} unread` : folder.name}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigateMailFolder(mailbox.id, folder.id);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <MailIcon name={folderIconName(folder)} />
                {!collapsed && <span className="truncate">{folder.name}</span>}
              </span>
              {unread && <span className="folder-count">{unread}</span>}
            </Link>
          );
        })}

        {mailboxes.length > 1 && (
          <div className={collapsed ? "mt-3" : "mt-4"}>
            {!collapsed && <p className="label px-2.5">Mailboxes</p>}
            {mailboxes.map((entry) => (
              <Link
                key={entry.id}
                href={`/mail/${entry.id}`}
                className="nav-row"
                data-active={entry.id === mailbox.id ? "true" : undefined}
                data-compact={collapsed ? "true" : undefined}
                title={collapsed ? entry.address : undefined}
                aria-label={entry.address}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MailIcon name="mailbox" />
                  {!collapsed && <span className="truncate">{entry.address}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className={`border-t border-border py-3 text-[13px] text-muted-foreground ${collapsed ? "px-1.5" : "px-3"}`}>
        <div className={`flex items-center gap-3 ${collapsed ? "flex-col" : "justify-between"}`}>
          <span
            className="flex min-w-0 items-center gap-2"
            title={streamState === "open" ? "Live" : streamState === "polling" ? "Polling" : "Connecting"}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: streamState === "open" ? "var(--success)" : "var(--warning)",
              }}
            />
            {!collapsed && (
              <span className="truncate">
                {streamState === "open" ? "Live" : streamState === "polling" ? "Polling" : "Connecting"}
              </span>
            )}
          </span>
          {mailbox.type === "external_imap" && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className={
                collapsed
                  ? "btn btn-quiet btn-icon disabled:opacity-50"
                  : "shrink-0 text-primary disabled:opacity-50"
              }
              aria-label={syncing ? "Syncing" : "Sync"}
              title={syncing ? "Syncing" : "Sync now (⇧R)"}
            >
              {collapsed ? <MailIcon name="sync" /> : syncing ? "Syncing" : "Sync"}
            </button>
          )}
        </div>

        {!collapsed && mailbox.type === "external_imap" && (
          <p className="mt-1.5 truncate text-[var(--ink-faint)]">
            Synced {formatRelative(lastSyncedAt)}
          </p>
        )}
        {!collapsed && syncError && <p className="mt-1.5 text-[var(--danger)]">{syncError}</p>}
      </div>
    </aside>
  );
}

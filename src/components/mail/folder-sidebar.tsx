"use client";

import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { navigateMailFolder, useMailStore } from "@/lib/mail/view-store";
import { formatRelative } from "@/lib/format";
import { primaryCombo } from "@/lib/keyboard/bindings";
import { formatComboHint, type ShortcutAction } from "@/lib/keyboard/shortcuts";
import { useShortcutStore } from "@/lib/keyboard/store";
import { ChromeButton } from "./chrome-button";
import { folderIconName, MailIcon } from "./icons";
import { useIsMac } from "./key-caps";
import type { StreamState } from "./use-mail-stream";

const JUMP_HINT: Record<string, ShortcutAction> = {
  inbox: "goInbox",
  sent: "goSent",
  drafts: "goDrafts",
  archive: "goArchive",
};

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  streamState: StreamState;
  collapsed: boolean;
  onCompose: () => void;
  onSync: () => void;
  onOpenPalette: () => void;
  onNavigate?: () => void;
};

export function FolderSidebar({
  mailbox,
  mailboxes,
  streamState,
  collapsed,
  onCompose,
  onSync,
  onOpenPalette,
  onNavigate,
}: Props) {
  const folders = useMailStore((state) => state.folders);
  const activeFolderId = useMailStore((state) => state.folderId);
  const syncing = useMailStore((state) => state.syncing);
  const syncError = useMailStore((state) => state.syncError);
  const lastSyncedAt = useMailStore((state) => state.lastSyncedAt);
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const isMac = useIsMac();
  const hint = (action: ShortcutAction) => {
    const combo = primaryCombo(action, shortcuts);
    return combo ? formatComboHint(combo, isMac) : undefined;
  };
  const labeled = (label: string, action: ShortcutAction) => {
    const keys = hint(action);
    return keys ? `${label} (${keys})` : label;
  };

  return (
    <aside
      className={`mail-sidebar flex shrink-0 flex-col border-r border-border bg-card ${collapsed ? "w-14" : "w-56"}`}
      data-collapsed={collapsed ? "true" : undefined}
    >
      <div className={`pane-toolbar border-b border-border ${collapsed ? "justify-center" : ""}`}>
        {collapsed ? (
          <button
            type="button"
            className="tip btn btn-primary btn-icon"
            onClick={onCompose}
            aria-label="Compose"
            data-tip={labeled("Compose", "compose")}
          >
            <MailIcon name="compose" />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary w-full min-w-0"
            onClick={onCompose}
            aria-label="Compose"
          >
            <MailIcon name="compose" />
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
        )}
      </div>

      <div className={`flex flex-col gap-2 py-2 ${collapsed ? "items-center px-2" : "px-2"}`}>
        <button
          type="button"
          className={
            collapsed
              ? "tip btn btn-ghost btn-icon"
              : "field flex items-center justify-between"
          }
          onClick={onOpenPalette}
          aria-label="Search"
          data-tip={collapsed ? labeled("Search", "palette") : undefined}
        >
          {collapsed ? (
            <MailIcon name="search" />
          ) : (
            <>
              <span className="text-muted-foreground">Search</span>
              <span className="kbd">⌘K</span>
            </>
          )}
        </button>
      </div>

      <nav className={`min-h-0 flex-1 py-2 px-2 ${collapsed ? "overflow-visible" : "scroll-thin overflow-y-auto"}`}>
        {folders.map((folder) => {
          const active = folder.id === activeFolderId;
          const unread = folder.unread > 0 ? (folder.unread > 99 ? "99+" : String(folder.unread)) : null;
          const jump = JUMP_HINT[folder.role];
          const tip = collapsed ? (jump ? labeled(folder.name, jump) : folder.name) : undefined;
          return (
            <Link
              key={folder.id}
              href={`/mail/${mailbox.id}/${folder.id}`}
              className={`nav-row${collapsed ? " tip" : ""}`}
              data-active={active ? "true" : undefined}
              data-compact={collapsed ? "true" : undefined}
              data-tip={tip}
              aria-label={unread ? `${folder.name}, ${folder.unread} unread` : folder.name}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigateMailFolder(mailbox.id, folder.id);
                onNavigate?.();
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
                className={`nav-row${collapsed ? " tip" : ""}`}
                data-active={entry.id === mailbox.id ? "true" : undefined}
                data-compact={collapsed ? "true" : undefined}
                data-tip={collapsed ? entry.address : undefined}
                aria-label={entry.address}
                onClick={() => onNavigate?.()}
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

      <div className={`border-t border-border py-3 text-[13px] text-muted-foreground ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`flex items-center gap-3 ${collapsed ? "flex-col" : "justify-between"}`}>
          <span
            className={`flex min-w-0 items-center gap-2${collapsed ? " tip" : ""}`}
            data-tip={
              collapsed
                ? streamState === "open"
                  ? "Live"
                  : streamState === "polling"
                    ? "Polling"
                    : "Connecting"
                : undefined
            }
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
            collapsed ? (
              <ChromeButton
                icon="sync"
                label={syncing ? "Syncing" : "Sync now"}
                hint="⇧R"
                disabled={syncing}
                onClick={onSync}
              />
            ) : (
              <button
                type="button"
                onClick={onSync}
                disabled={syncing}
                className="shrink-0 text-primary disabled:opacity-50"
              >
                {syncing ? "Syncing" : "Sync"}
              </button>
            )
          )}
        </div>

        {!collapsed && mailbox.type === "external_imap" && (
          <p className="mt-1.5 truncate text-muted-foreground">
            Synced {formatRelative(lastSyncedAt)}
          </p>
        )}
        {!collapsed && syncError && <p className="mt-1.5 text-[var(--danger)]">{syncError}</p>}
      </div>
    </aside>
  );
}

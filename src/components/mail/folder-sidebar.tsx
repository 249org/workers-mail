"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { parseFolderName, partitionFolders } from "@/lib/mail/folder-name";
import { navigateMailFolder, useMailStore, type FolderSummary } from "@/lib/mail/view-store";
import { formatRelative } from "@/lib/format";
import { describeImapError } from "@/lib/transport/imap-error";
import { primaryCombo } from "@/lib/keyboard/bindings";
import { formatComboHint, type ShortcutAction } from "@/lib/keyboard/shortcuts";
import { useShortcutStore } from "@/lib/keyboard/store";
import { toast } from "sonner";
import { ChromeButton } from "./chrome-button";
import { folderIconName, MailIcon } from "./icons";
import { FolderAppearancePicker } from "./folder-appearance-picker";
import { folderColorVar, isFolderIcon } from "@/lib/mail/folder-appearance";
import { useIsMac } from "./key-caps";
import { useContextMenu } from "@/components/ui/context-menu";
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
  onExpand?: () => void;
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
  onExpand,
}: Props) {
  const folders = useMailStore((state) => state.folders);
  const activeFolderId = useMailStore((state) => state.folderId);
  const syncing = useMailStore((state) => state.syncing);
  const syncError = useMailStore((state) => state.syncError);
  const lastSyncedAt = useMailStore((state) => state.lastSyncedAt);
  const creating = useMailStore((state) => state.creatingFolder);
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
  const { system, custom } = useMemo(() => partitionFolders(folders), [folders]);

  function startCreate() {
    if (collapsed) onExpand?.();
    useMailStore.getState().setCreatingFolder(true);
  }

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
        {system.map((folder) => (
          <FolderLink
            key={folder.id}
            mailboxId={mailbox.id}
            folder={folder}
            active={folder.id === activeFolderId}
            collapsed={collapsed}
            labeled={labeled}
            onNavigate={onNavigate}
          />
        ))}

        <div className={collapsed ? "mt-3" : "mt-4"}>
          {!collapsed && <p className="label px-2.5">Folders</p>}
          {custom.map((folder) => (
            <FolderLink
              key={folder.id}
              mailboxId={mailbox.id}
              folder={folder}
              active={folder.id === activeFolderId}
              collapsed={collapsed}
              labeled={labeled}
              onNavigate={onNavigate}
            />
          ))}
          {creating && !collapsed ? (
            <CreateFolderForm mailboxId={mailbox.id} onCreated={onNavigate} />
          ) : collapsed ? (
            <button
              type="button"
              className="nav-row tip"
              data-compact="true"
              data-tip="New folder"
              aria-label="New folder"
              onClick={startCreate}
            >
              <MailIcon name="plus" />
            </button>
          ) : (
            <button type="button" className="nav-row" onClick={startCreate}>
              <span className="flex min-w-0 items-center gap-2">
                <MailIcon name="plus" />
                <span className="truncate">New folder</span>
              </span>
            </button>
          )}
        </div>

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
        {!collapsed && syncError && (
          <p className="mt-1.5 text-[var(--danger)]">{describeImapError(syncError)}</p>
        )}
      </div>
    </aside>
  );
}

function FolderLink({
  mailboxId,
  folder,
  active,
  collapsed,
  labeled,
  onNavigate,
}: {
  mailboxId: string;
  folder: FolderSummary;
  active: boolean;
  collapsed: boolean;
  labeled: (label: string, action: ShortcutAction) => string;
  onNavigate?: () => void;
}) {
  const unread = folder.unread > 0 ? (folder.unread > 99 ? "99+" : String(folder.unread)) : null;
  const jump = JUMP_HINT[folder.role];
  const tip = collapsed ? (jump ? labeled(folder.name, jump) : folder.name) : undefined;
  const isCustom = folder.role === "custom";
  const [renaming, setRenaming] = useState(false);
  const { bind } = useContextMenu();

  const menuItems = [
    { type: "label" as const, label: folder.name },
    {
      type: "item" as const,
      label: "Open folder",
      onSelect: () => { navigateMailFolder(mailboxId, folder.id); onNavigate?.(); },
    },
    { type: "separator" as const },
    ...(isCustom
      ? [
          {
            type: "item" as const,
            label: "Rename",
            onSelect: () => setRenaming(true),
          },
          {
            type: "item" as const,
            label: "Delete folder",
            danger: true,
            onSelect: async () => {
              try {
                await useMailStore.getState().deleteFolder(folder.id);
                toast(`"${folder.name}" deleted`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not delete folder");
              }
            },
          },
          { type: "separator" as const },
        ]
      : []),
    {
      type: "item" as const,
      label: "Copy folder name",
      onSelect: () => {
        void navigator.clipboard.writeText(folder.name);
        toast("Copied");
      },
    },
    { type: "separator" as const },
    {
      type: "custom" as const,
      id: "appearance",
      render: () => (
        <FolderAppearancePicker folderId={folder.id} fallbackIcon={folderIconName(folder)} />
      ),
    },
    ...(folder.icon || folder.color
      ? [
          {
            type: "item" as const,
            label: "Reset appearance",
            onSelect: () =>
              void useMailStore
                .getState()
                .setFolderAppearance(folder.id, { icon: null, color: null }),
          },
        ]
      : []),
  ];

  if (renaming) {
    return (
      <RenameFolderForm
        folder={folder}
        mailboxId={mailboxId}
        onDone={() => setRenaming(false)}
      />
    );
  }

  return (
    <Link
      href={`/mail/${mailboxId}/${folder.id}`}
      className={`nav-row${collapsed ? " tip" : ""}`}
      data-active={active ? "true" : undefined}
      data-compact={collapsed ? "true" : undefined}
      data-tip={tip}
      aria-label={unread ? `${folder.name}, ${folder.unread} unread` : folder.name}
      {...bind(menuItems)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateMailFolder(mailboxId, folder.id);
        onNavigate?.();
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <MailIcon
          name={isFolderIcon(folder.icon) ? folder.icon : folderIconName(folder)}
          style={{ color: folderColorVar(folder.color) ?? undefined }}
        />
        {!collapsed && <span className="truncate">{folder.name}</span>}
      </span>
      {unread && <span className="folder-count">{unread}</span>}
    </Link>
  );
}

function RenameFolderForm({
  folder,
  mailboxId,
  onDone,
}: {
  folder: FolderSummary;
  mailboxId: string;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseFolderName(name);
    if (!parsed.ok) { setError(parsed.error); return; }
    setSaving(true);
    try {
      await useMailStore.getState().renameFolder(folder.id, parsed.name);
      toast(`Renamed to "${parsed.name}"`);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename.");
      setSaving(false);
    }
  }

  return (
    <form className="px-0.5 pt-0.5 pb-1" onSubmit={(e) => void submit(e)}>
      <input
        ref={inputRef}
        className="field !h-8"
        value={name}
        disabled={saving}
        aria-label="Rename folder"
        onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onDone(); } }}
      />
      {error && <p className="mt-1 px-2 text-[12px] text-[var(--danger)]">{error}</p>}
    </form>
  );
}

function CreateFolderForm({
  mailboxId,
  onCreated,
}: {
  mailboxId: string;
  onCreated?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseFolderName(name);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const folder = await useMailStore.getState().createFolder(parsed.name);
      navigateMailFolder(mailboxId, folder.id);
      onCreated?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the folder.");
      setSaving(false);
    }
  }

  return (
    <form className="px-0.5 pt-1" onSubmit={(event) => void submit(event)}>
      <input
        ref={inputRef}
        className="field"
        value={name}
        disabled={saving}
        placeholder="Folder name"
        aria-label="Folder name"
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            useMailStore.getState().setCreatingFolder(false);
          }
        }}
      />
      {error && <p className="mt-1 px-2.5 text-[12px] text-[var(--danger)]">{error}</p>}
    </form>
  );
}

"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { parseFolderName, partitionFolders } from "@/lib/mail/folder-name";
import { navigateMailFolder, useMailStore, type FolderSummary } from "@/lib/mail/view-store";
import { formatRelative } from "@/lib/format";
import { describeImapError } from "@/lib/transport/imap-error";
import { toast } from "sonner";
import { folderIconName, MailIcon } from "./icons";
import { FolderAppearancePicker } from "./folder-appearance-picker";
import { folderColorVar, isFolderIcon } from "@/lib/mail/folder-appearance";
import { useContextMenu } from "@/components/ui/context-menu";
import { useDismiss } from "@/components/ui/use-dismiss";
import { FrameSidebar } from "@/components/shell/frame";
import type { StreamState } from "./use-mail-stream";

const FOLDERS_GROUP_KEY = "workers-mail.sidebar.folders";

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  streamState: StreamState;
  onSync: () => void;
  onNavigate?: () => void;
};

const STREAM_LABEL: Record<StreamState, string> = {
  open: "Live",
  polling: "Polling",
  connecting: "Connecting",
};

/** Whether the Folders group is folded away. A per-browser preference, nothing more. */
function useFoldedGroup(): [boolean, () => void] {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLDERS_GROUP_KEY) === "folded");
    } catch {
      // Storage can be refused; the group simply starts open.
    }
  }, []);
  const toggle = useCallback(() => {
    setFolded((current) => {
      try {
        localStorage.setItem(FOLDERS_GROUP_KEY, current ? "open" : "folded");
      } catch {
        // As above.
      }
      return !current;
    });
  }, []);
  return [folded, toggle];
}

/**
 * The open mailbox's own sidebar: which mailbox it is, its folders, and how its sync is
 * doing. Composing and searching live on the rail beside it, so they stay in reach when
 * this panel is folded away.
 */
export function FolderSidebar({ mailbox, mailboxes, streamState, onSync, onNavigate }: Props) {
  const folders = useMailStore((state) => state.folders);
  const activeFolderId = useMailStore((state) => state.folderId);
  const syncing = useMailStore((state) => state.syncing);
  const syncError = useMailStore((state) => state.syncError);
  const lastSyncedAt = useMailStore((state) => state.lastSyncedAt);
  const creating = useMailStore((state) => state.creatingFolder);
  const { system, custom } = useMemo(() => partitionFolders(folders), [folders]);
  const [folded, toggleFolded] = useFoldedGroup();
  // A group holding the folder on screen never hides it.
  const groupOpen = !folded || custom.some((folder) => folder.id === activeFolderId) || creating;

  return (
    <FrameSidebar label={`${mailbox.address} folders`}>
      <MailboxSwitcher mailbox={mailbox} mailboxes={mailboxes} onNavigate={onNavigate} />

      <nav className="sidebar-nav scroll-thin" aria-label="Folders">
        {system.map((folder) => (
          <FolderLink
            key={folder.id}
            mailboxId={mailbox.id}
            folder={folder}
            active={folder.id === activeFolderId}
            onNavigate={onNavigate}
          />
        ))}

        <div className="sidebar-group">
          <button
            type="button"
            className="sidebar-group-toggle"
            aria-expanded={groupOpen}
            onClick={toggleFolded}
          >
            <span>Folders</span>
            <MailIcon name="chevron" className="sidebar-group-chevron" />
          </button>
          {groupOpen ? (
            <div className="sidebar-group-items">
              {custom.map((folder) => (
                <FolderLink
                  key={folder.id}
                  mailboxId={mailbox.id}
                  folder={folder}
                  active={folder.id === activeFolderId}
                  onNavigate={onNavigate}
                />
              ))}
              {creating ? (
                <CreateFolderForm mailboxId={mailbox.id} onCreated={onNavigate} />
              ) : (
                <button
                  type="button"
                  className="nav-row nav-row-quiet"
                  onClick={() => useMailStore.getState().setCreatingFolder(true)}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <MailIcon name="plus" />
                    <span className="truncate">New folder</span>
                  </span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="sidebar-foot">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="status-dot" data-state={streamState} aria-hidden />
            <span className="truncate">{STREAM_LABEL[streamState]}</span>
          </span>
          {mailbox.type === "external_imap" && (
            <button type="button" onClick={onSync} disabled={syncing} className="sidebar-foot-action">
              <MailIcon name="sync" />
              {syncing ? "Syncing" : "Sync"}
            </button>
          )}
        </div>
        {mailbox.type === "external_imap" && (
          <p className="num mt-1 truncate">Synced {formatRelative(lastSyncedAt)}</p>
        )}
        {syncError && <p className="mt-1.5 text-[var(--danger)]">{describeImapError(syncError)}</p>}
      </div>
    </FrameSidebar>
  );
}

/** The mailbox's name at the head of its sidebar, and a way to the others. */
function MailboxSwitcher({
  mailbox,
  mailboxes,
  onNavigate,
}: {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, root, close);

  const pick = () => {
    close();
    onNavigate?.();
  };

  return (
    <div ref={root} className="sidebar-head">
      <button
        type="button"
        className="sidebar-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <MailIcon name="mailbox" className="shrink-0 text-[var(--frame-muted)]" />
        <span className="min-w-0 flex-1 truncate text-left">{mailbox.address}</span>
        <MailIcon name="chevron" className="shrink-0 text-[var(--frame-muted)]" />
      </button>
      {open ? (
        <div id={menuId} role="menu" className="menu sidebar-switcher-menu">
          {mailboxes.map((entry) => (
            <Link
              key={entry.id}
              href={`/mail/${entry.id}`}
              role="menuitem"
              className="menu-item"
              aria-current={entry.id === mailbox.id ? "true" : undefined}
              onClick={pick}
            >
              <span className="min-w-0 flex-1 truncate">{entry.address}</span>
              <span className="eyebrow shrink-0 text-muted-foreground">
                {entry.type === "native" ? "Domain" : "IMAP"}
              </span>
            </Link>
          ))}
          <div className="menu-rule" />
          <Link href="/settings/mailboxes/new" role="menuitem" className="menu-item" onClick={pick}>
            Add mailbox
          </Link>
          <Link href="/settings/mailboxes" role="menuitem" className="menu-item" onClick={pick}>
            Manage mailboxes
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FolderLink({
  mailboxId,
  folder,
  active,
  onNavigate,
}: {
  mailboxId: string;
  folder: FolderSummary;
  active: boolean;
  onNavigate?: () => void;
}) {
  const unread = folder.unread > 0 ? (folder.unread > 99 ? "99+" : String(folder.unread)) : null;
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
      className="nav-row pressable"
      aria-current={active ? "page" : undefined}
      aria-label={unread ? `${folder.name}, ${folder.unread} unread` : folder.name}
      {...bind(menuItems)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateMailFolder(mailboxId, folder.id);
        onNavigate?.();
      }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <MailIcon
          name={isFolderIcon(folder.icon) ? folder.icon : folderIconName(folder)}
          style={{ color: folderColorVar(folder.color) ?? undefined }}
        />
        <span className="truncate">{folder.name}</span>
      </span>
      {unread && <span className="folder-count num">{unread}</span>}
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

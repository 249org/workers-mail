"use client";

import { useEffect, useRef, useState } from "react";
import { displayName } from "@/lib/mail/address";
import type { MessageSummary } from "@/lib/mail/queries";
import { isSystemFolderRole, partitionFolders } from "@/lib/mail/folder-name";
import { SEARCH_FILTERS, hasSearchToken, toggleSearchToken } from "@/lib/mail/search";
import { navigateMailFolder, useMailStore, type FolderSummary } from "@/lib/mail/view-store";
import { formatMessageDate } from "@/lib/format";
import { toast } from "sonner";
import { ChromeButton } from "./chrome-button";
import { useContextMenu } from "@/components/ui/context-menu";

type Props = {
  onOpenSearch: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  hidden?: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onCompose?: () => void;
};

export function MessageList({
  onOpenSearch,
  searchRef,
  hidden,
  sidebarCollapsed,
  onToggleSidebar,
  onCompose,
}: Props) {
  const messages = useMailStore((state) => state.messages);
  const selectedId = useMailStore((state) => state.selectedId);
  const checked = useMailStore((state) => state.checked);
  const loading = useMailStore((state) => state.loading);
  const cursor = useMailStore((state) => state.cursor);
  const search = useMailStore((state) => state.search);
  const mailboxId = useMailStore((state) => state.mailboxId);
  const folderId = useMailStore((state) => state.folderId);
  const folders = useMailStore((state) => state.folders);
  const currentFolder = folders.find((folder) => folder.id === folderId);
  const inTrash = currentFolder?.role === "trash";

  const select = useMailStore((state) => state.select);
  const setSearch = useMailStore((state) => state.setSearch);
  const toggleChecked = useMailStore((state) => state.toggleChecked);
  const fetchPage = useMailStore((state) => state.fetchPage);
  const prefetchAround = useMailStore((state) => state.prefetchAround);

  const listRef = useRef<HTMLUListElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // The filters stay up while a query is on, so what is narrowing the list is never
  // hidden just because focus moved to the results.
  const filtersVisible = searchOpen || search.trim().length > 0;

  // Keep the cursor row on screen as j/k walks past the fold. `nearest` avoids the
  // jump-to-centre that makes keyboard navigation feel like it is fighting you.
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <section
      className={`mail-list flex w-full min-h-0 shrink-0 flex-col border-r border-border bg-card md:w-[21rem] lg:w-[25rem] ${
        hidden ? "hidden" : ""
      }`}
    >
      <div className="pane-toolbar border-b border-border">
        <ChromeButton
          icon="sidebar"
          label={sidebarCollapsed ? "Expand folder sidebar" : "Collapse folder sidebar"}
          hint="["
          start
          pressed={sidebarCollapsed}
          onClick={onToggleSidebar}
        />
        <div className="relative min-w-0 flex-1">
          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder="Search, or try from:sam is:unread"
            onChange={(event) => setSearch(event.target.value)}
            onFocus={() => {
              setSearchOpen(true);
              onOpenSearch?.();
            }}
            onBlur={(event) => {
              // Moving to a chip is still using search; only leaving the pair closes it.
              if ((event.relatedTarget as HTMLElement | null)?.closest(".filter-row")) return;
              setSearchOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && search) {
                event.stopPropagation();
                setSearch("");
              }
            }}
            className="field pr-12"
            aria-label="Search messages"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 max-md:hidden">
            <span className="kbd">/</span>
          </span>
        </div>
        {onCompose ? (
          <span className="md:hidden">
            <ChromeButton icon="compose" label="Compose" hint="C" onClick={onCompose} />
          </span>
        ) : null}
        {inTrash && messages.length > 0 && <EmptyTrashButton />}
      </div>

      {filtersVisible && <SearchFilters search={search} onChange={setSearch} />}

      {checked.size > 0 && (
        <BulkBar count={checked.size} total={messages.length} inTrash={inTrash} />
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !loading && (
          <EmptyFolder
            search={search}
            mailboxId={mailboxId}
            folderId={folderId}
            folders={folders}
          />
        )}

        <ul ref={listRef} role="listbox" aria-label="Messages" tabIndex={-1}>
          {messages.map((message) => (
            <Row
              key={message.id}
              message={message}
              active={message.id === selectedId}
              checked={checked.has(message.id)}
              onSelect={() => select(message.id)}
              onToggle={() => toggleChecked(message.id)}
              onHover={() => prefetchAround(message.id)}
            />
          ))}
        </ul>

        {cursor !== null && (
          <div className="p-3">
            <button
              type="button"
              className="btn btn-ghost w-full text-xs"
              onClick={() => void fetchPage({ append: true })}
              disabled={loading}
            >
              {loading ? "Loading" : "Load older"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  message,
  active,
  checked,
  onSelect,
  onToggle,
  onHover,
}: {
  message: MessageSummary;
  active: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onHover: () => void;
}) {
  const { bind } = useContextMenu();
  const store = useMailStore.getState();
  const folders = useMailStore((state) => state.folders);
  const { system, custom } = partitionFolders(folders);
  const inTrash = folders.find((f) => f.id === message.folderId)?.role === "trash";

  const moveFolders = [...system.filter((f) => f.role !== "inbox"), ...custom].filter(
    (f) => f.id !== message.folderId,
  );

  const menuItems = [
    {
      type: "item" as const,
      label: message.seen ? "Mark as unread" : "Mark as read",
      onSelect: () => store.markRead([message.id], !message.seen),
    },
    {
      type: "item" as const,
      label: message.flagged ? "Unstar" : "Star",
      onSelect: () => store.star([message.id], !message.flagged),
    },
    { type: "separator" as const },
    ...(moveFolders.length > 0
      ? [
          { type: "label" as const, label: "Move to" },
          ...moveFolders.slice(0, 8).map((folder) => ({
            type: "item" as const,
            label: folder.name,
            onSelect: () => store.moveTo([message.id], folder.id, `Moved to ${folder.name}`),
          })),
          { type: "separator" as const },
        ]
      : []),
    {
      type: "item" as const,
      label: inTrash ? "Delete forever" : "Move to trash",
      danger: true,
      onSelect: () => {
        if (inTrash) {
          store.deleteForever([message.id]);
          toast("Deleted forever");
        } else {
          store.trash([message.id]);
        }
      },
    },
    { type: "separator" as const },
    {
      type: "item" as const,
      label: "Copy subject",
      onSelect: () => { void navigator.clipboard.writeText(message.subject ?? ""); toast("Copied"); },
    },
    {
      type: "item" as const,
      label: "Select",
      onSelect: () => onToggle(),
    },
  ];

  return (
    <li>
      {/*
        No transition on selection: this row changes hundreds of times a day under
        j/k, and any easing here reads as lag rather than polish.
      */}
      <div
        data-id={message.id}
        role="option"
        aria-selected={active}
        tabIndex={-1}
        onClick={onSelect}
        onMouseEnter={onHover}
        {...bind(menuItems)}
        className="flex cursor-pointer gap-2.5 border-b border-border px-3 py-2.5 md:py-2"
        style={{
          background: active ? "var(--accent-subtle)" : "transparent",
        }}
      >
        <input
          type="checkbox"
          className="check"
          checked={checked}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          aria-label={`Select ${message.subject || "message"}`}
          tabIndex={-1}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {!message.seen && (
              <span
                aria-label="Unread"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            )}
            <span
              className="truncate text-[13px]"
              style={{ fontWeight: message.seen ? 400 : 600 }}
            >
              {message.draft ? "Draft" : displayName(message.from)}
            </span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--ink-faint)]">
              {formatMessageDate(message.sentAt)}
            </span>
          </div>

          <p
            className="truncate text-[13px]"
            style={{
              fontWeight: message.seen ? 400 : 600,
              color: message.subject ? "var(--ink)" : "var(--ink-faint)",
            }}
          >
            {message.subject || "(no subject)"}
            {message.threadCount > 1 && (
              <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-faint)]">
                {message.threadCount}
              </span>
            )}
          </p>

          <p className="truncate text-[12px] text-[var(--ink-muted)]">
            {message.snippet || "No preview"}
          </p>

          {(message.flagged || message.hasAttachments) && (
            <div className="mt-1 flex gap-1.5 text-[11px] text-[var(--ink-faint)]">
              {message.flagged && <span style={{ color: "var(--warning)" }}>Starred</span>}
              {message.hasAttachments && <span>Attachment</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Filters offered as buttons, so narrowing a search does not depend on remembering the
 * operator. Each writes its own token into the query rather than holding state beside
 * it, which is what keeps a clicked chip and a typed `is:unread` the same thing.
 */
function SearchFilters({
  search,
  onChange,
}: {
  search: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="filter-row" role="group" aria-label="Search filters">
      {SEARCH_FILTERS.map((filter) => {
        const active = hasSearchToken(search, filter.token);
        return (
          <button
            key={filter.id}
            type="button"
            className="filter-chip"
            aria-pressed={active}
            title={filter.token}
            // Keep the caret in the search field so a chip never costs a click back.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(toggleSearchToken(search, filter.token, filter.replaces))}
          >
            {filter.label}
          </button>
        );
      })}
      {search.trim() ? (
        <button
          type="button"
          className="filter-chip-clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange("")}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function EmptyFolder({
  search,
  mailboxId,
  folderId,
  folders,
}: {
  search: string;
  mailboxId: string;
  folderId: string;
  folders: FolderSummary[];
}) {
  const folder = folders.find((entry) => entry.id === folderId);
  const inbox = folders.find((entry) => entry.role === "inbox");
  const syncing = useMailStore((state) => state.syncing);
  const copy =
    search.trim().length > 0
      ? "Nothing matched that search."
      : folder?.role === "drafts"
        ? "No drafts."
        : folder?.role === "trash"
          ? "Trash is empty."
          : folder?.role === "sent"
            ? "No sent mail."
            : folder?.role === "archive"
              ? "Archive is empty."
              : folder && !isSystemFolderRole(folder.role) && syncing
                ? "Loading this folder…"
                : "Nothing here yet.";

  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[13px] text-[var(--ink-muted)]">{copy}</p>
      {!search && folder?.role !== "inbox" && inbox && !(folder && !isSystemFolderRole(folder.role) && syncing) && (
        <button
          type="button"
          className="btn btn-ghost mt-4"
          onClick={() => navigateMailFolder(mailboxId, inbox.id)}
        >
          Open Inbox
        </button>
      )}
    </div>
  );
}

function undoLastAction(): boolean {
  const did = useMailStore.getState().undo();
  if (!did) return false;
  toast.dismiss("mail-action");
  toast("Undone");
  return true;
}

function BulkBar({
  count,
  total,
  inTrash,
}: {
  count: number;
  total: number;
  inTrash: boolean;
}) {
  const star = useMailStore((state) => state.star);
  const markRead = useMailStore((state) => state.markRead);
  const trash = useMailStore((state) => state.trash);
  const deleteForever = useMailStore((state) => state.deleteForever);
  const moveTo = useMailStore((state) => state.moveTo);
  const folders = useMailStore((state) => state.folders);
  const folderId = useMailStore((state) => state.folderId);
  const checked = useMailStore((state) => state.checked);
  const messages = useMailStore((state) => state.messages);
  const ids = [...checked];
  const allStarred = ids.length > 0 && ids.every((id) => messages.find((message) => message.id === id)?.flagged);
  const destinations = partitionFolders(folders).custom.filter((folder) => folder.id !== folderId);

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1">
      <SelectAllBox checkedCount={count} total={total} />
      <p className="text-[13px] text-[var(--ink-muted)]">
        {count} selected
      </p>
      <div className="ml-auto flex items-center gap-1">
        <ChromeButton icon="seen" label="Mark read" onClick={() => markRead(ids, true)} />
        <ChromeButton icon="unseen" label="Mark unread" hint="U" onClick={() => markRead(ids, false)} />
        <ChromeButton
          icon="star"
          label={allStarred ? "Unstar" : "Star"}
          hint="S"
          pressed={allStarred}
          onClick={() => star(ids, !allStarred)}
        />
        {destinations.length > 0 && !inTrash && (
          <select
            className="field !h-8 !w-auto max-w-[9rem] !px-2 text-[12px]"
            value=""
            aria-label="Move to folder"
            onChange={(event) => {
              const next = event.target.value;
              const folder = destinations.find((entry) => entry.id === next);
              if (!folder) return;
              moveTo(ids, folder.id, `Moved to ${folder.name}`);
              toast(`Moved to ${folder.name}`, {
                id: "mail-action",
                action: { label: "Undo", onClick: () => undoLastAction() },
              });
              void useMailStore.getState().refreshFolders();
            }}
          >
            <option value="">Move to</option>
            {destinations.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        )}
        {inTrash ? (
          <button
            type="button"
            className="btn btn-danger !h-8 !px-3 text-[12px]"
            onClick={() => {
              deleteForever(ids);
              toast("Deleted forever");
            }}
          >
            Delete forever
          </button>
        ) : (
          <ChromeButton icon="trash" label="Move to trash" hint="#" danger end onClick={() => trash(ids)} />
        )}
      </div>
    </div>
  );
}

function SelectAllBox({ checkedCount, total }: { checkedCount: number; total: number }) {
  const toggleAllChecked = useMailStore((state) => state.toggleAllChecked);
  const ref = useRef<HTMLInputElement>(null);
  const all = total > 0 && checkedCount === total;
  const some = checkedCount > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="check !mt-0"
      checked={all}
      onChange={toggleAllChecked}
      aria-label="Select all"
    />
  );
}

function EmptyTrashButton() {
  const emptyTrash = useMailStore((state) => state.emptyTrash);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`btn shrink-0 !h-8 !px-3 text-[12px] ${armed ? "btn-danger" : "btn-ghost"}`}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        emptyTrash();
        toast("Trash emptied");
        setArmed(false);
      }}
    >
      {armed ? "Confirm empty" : "Empty trash"}
    </button>
  );
}

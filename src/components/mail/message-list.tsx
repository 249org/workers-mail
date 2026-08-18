"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { displayName } from "@/lib/mail/address";
import type { MessageSummary } from "@/lib/mail/queries";
import { useMailStore, type FolderSummary } from "@/lib/mail/view-store";
import { formatMessageDate } from "@/lib/format";

type Props = {
  onOpenSearch: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

export function MessageList({ onOpenSearch, searchRef }: Props) {
  const messages = useMailStore((state) => state.messages);
  const selectedId = useMailStore((state) => state.selectedId);
  const checked = useMailStore((state) => state.checked);
  const loading = useMailStore((state) => state.loading);
  const cursor = useMailStore((state) => state.cursor);
  const search = useMailStore((state) => state.search);
  const mailboxId = useMailStore((state) => state.mailboxId);
  const folderId = useMailStore((state) => state.folderId);
  const folders = useMailStore((state) => state.folders);

  const select = useMailStore((state) => state.select);
  const setSearch = useMailStore((state) => state.setSearch);
  const toggleChecked = useMailStore((state) => state.toggleChecked);
  const toggleAllChecked = useMailStore((state) => state.toggleAllChecked);
  const fetchPage = useMailStore((state) => state.fetchPage);
  const prefetchAround = useMailStore((state) => state.prefetchAround);

  const listRef = useRef<HTMLUListElement>(null);

  // Keep the cursor row on screen as j/k walks past the fold. `nearest` avoids the
  // jump-to-centre that makes keyboard navigation feel like it is fighting you.
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <section className="flex w-full shrink-0 flex-col border-r border-border bg-card md:w-[21rem] lg:w-[25rem]">
      <div className="shrink-0 border-b border-[var(--border)] p-2.5">
        <div className="relative">
          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder="Search, or try from:sam is:unread"
            onChange={(event) => setSearch(event.target.value)}
            onFocus={onOpenSearch}
            className="field pr-12"
            aria-label="Search messages"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
            <span className="kbd">/</span>
          </span>
        </div>
      </div>

      {checked.size > 0 && <BulkBar count={checked.size} onToggleAll={toggleAllChecked} />}

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
        className="flex cursor-pointer gap-2 border-b border-border px-3 py-2"
        style={{
          background: active ? "var(--accent-subtle)" : "transparent",
        }}
      >
        <input
          type="checkbox"
          className="mt-1 shrink-0"
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
              : "Nothing here yet.";

  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[13px] text-[var(--ink-muted)]">{copy}</p>
      {!search && folder?.role !== "inbox" && inbox && (
        <Link href={`/mail/${mailboxId}/${inbox.id}`} prefetch={false} className="btn btn-ghost mt-4">
          Open Inbox
        </Link>
      )}
    </div>
  );
}

function BulkBar({ count, onToggleAll }: { count: number; onToggleAll: () => void }) {
  const checked = useMailStore((state) => state.checked);
  const star = useMailStore((state) => state.star);
  const markRead = useMailStore((state) => state.markRead);
  const trash = useMailStore((state) => state.trash);
  const ids = [...checked];

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs">
      <button type="button" className="hover:underline" onClick={onToggleAll}>
        {count} selected
      </button>
      <div className="ml-auto flex gap-2.5">
        <button type="button" className="hover:underline" onClick={() => markRead(ids, true)}>
          Read
        </button>
        <button type="button" className="hover:underline" onClick={() => markRead(ids, false)}>
          Unread
        </button>
        <button type="button" className="hover:underline" onClick={() => star(ids, true)}>
          Star
        </button>
        <button
          type="button"
          className="hover:underline"
          style={{ color: "var(--danger)" }}
          onClick={() => trash(ids)}
        >
          Trash
        </button>
      </div>
    </div>
  );
}

"use client";

import type { MessageSummary } from "@/lib/mail/queries";
import { displayName } from "@/lib/mail/address";
import { formatMessageDate } from "@/lib/format";

type Props = {
  messages: MessageSummary[];
  selectedId: string | null;
  selection: Set<string>;
  loading: boolean;
  hasMore: boolean;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (message: MessageSummary) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onLoadMore: () => void;
  onBulk: (action: "read" | "unread" | "flag" | "trash") => void;
};

export function MessageList({
  messages,
  selectedId,
  selection,
  loading,
  hasMore,
  search,
  onSearch,
  onSelect,
  onToggle,
  onToggleAll,
  onLoadMore,
  onBulk,
}: Props) {
  const allSelected = messages.length > 0 && selection.size === messages.length;

  return (
    <section className="flex w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--raised)] md:w-[22rem] lg:w-[26rem]">
      <div className="shrink-0 border-b border-[var(--border)] p-2.5">
        <input
          type="search"
          value={search}
          placeholder="Search subject, sender or snippet"
          onChange={(event) => onSearch(event.target.value)}
          className="field !py-1.5 text-[13px]"
        />
      </div>

      {selection.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            {selection.size} selected
          </label>
          <div className="ml-auto flex gap-1.5">
            <button type="button" className="hover:underline" onClick={() => onBulk("read")}>
              Read
            </button>
            <button type="button" className="hover:underline" onClick={() => onBulk("unread")}>
              Unread
            </button>
            <button type="button" className="hover:underline" onClick={() => onBulk("flag")}>
              Star
            </button>
            <button
              type="button"
              className="text-[var(--danger)] hover:underline"
              onClick={() => onBulk("trash")}
            >
              Trash
            </button>
          </div>
        </div>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !loading && (
          <p className="p-6 text-center text-sm text-[var(--ink-muted)]">
            {search ? "Nothing matched that search." : "This folder is empty."}
          </p>
        )}

        <ul>
          {messages.map((message) => {
            const active = message.id === selectedId;
            return (
              <li key={message.id}>
                <div
                  className="flex cursor-pointer gap-2 border-b border-[var(--border)] px-2.5 py-2.5"
                  style={{ background: active ? "var(--accent-soft)" : "transparent" }}
                  onClick={() => onSelect(message)}
                >
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={selection.has(message.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggle(message.id)}
                    aria-label={`Select ${message.subject || "message"}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="truncate text-[13px]"
                        style={{ fontWeight: message.seen ? 400 : 600 }}
                      >
                        {message.draft ? "Draft" : displayName(message.from)}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-faint)]">
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
                        <span className="ml-1.5 text-[11px] text-[var(--ink-faint)]">
                          {message.threadCount}
                        </span>
                      )}
                    </p>

                    <p className="truncate text-[12px] text-[var(--ink-muted)]">
                      {message.snippet || "No preview available"}
                    </p>

                    {(message.flagged || message.hasAttachments) && (
                      <div className="mt-1 flex gap-1.5 text-[11px] text-[var(--ink-faint)]">
                        {message.flagged && <span>Starred</span>}
                        {message.hasAttachments && <span>Attachment</span>}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <div className="p-3">
            <button
              type="button"
              className="btn btn-ghost w-full text-xs"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

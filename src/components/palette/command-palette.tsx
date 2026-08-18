"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { displayName } from "@/lib/mail/address";
import type { MessageSummary } from "@/lib/mail/queries";
import { SEARCH_OPERATORS } from "@/lib/mail/search";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { navigateMailFolder, useMailStore } from "@/lib/mail/view-store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { formatMessageDate } from "@/lib/format";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string[];
  suffix?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  initialQuery: string;
  mailbox: PublicMailbox | null;
  mailboxes: PublicMailbox[];
  commands: PaletteCommand[];
  onClose: () => void;
};

const SEARCH_DEBOUNCE_MS = 120;
const GROUP_ORDER = ["Appearance", "Settings", "Actions", "Application"];

/**
 * Commands, message search and jump-to in one surface.
 *
 * Deliberately unanimated: this opens dozens of times a day, and at that frequency an
 * entrance transition reads as latency. Raycast ships none for the same reason.
 */
export function CommandPalette({
  open,
  initialQuery,
  mailbox,
  mailboxes,
  commands,
  onClose,
}: Props) {
  const router = useRouter();
  const folders = useMailStore((state) => state.folders);
  const select = useMailStore((state) => state.select);

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MessageSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeys("modal", { back: onClose }, open);

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) {
      setResults([]);
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  const trimmed = query.trim();
  const commandMode = trimmed.startsWith(">");
  const mailboxId = mailbox?.id ?? mailboxes[0]?.id ?? null;

  useEffect(() => {
    if (!open || commandMode || !mailboxId || trimmed.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ mailbox: mailboxId, q: trimmed });
        const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as { items: MessageSummary[] };
        setResults(payload.items);
      } catch {
        // An aborted request is the normal case while typing.
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, trimmed, commandMode, mailboxId]);

  const needle = trimmed.replace(/^>\s*/, "");

  const commandGroups = useMemo(() => {
    const visible = commands.filter((command) => matchesCommand(command, needle));
    const grouped = new Map<string, PaletteCommand[]>();
    for (const command of visible) {
      const list = grouped.get(command.group) ?? [];
      list.push(command);
      grouped.set(command.group, list);
    }
    const known = GROUP_ORDER.filter((group) => grouped.has(group)).map((group) => ({
      heading: group,
      items: grouped.get(group) ?? [],
    }));
    const rest = [...grouped.keys()]
      .filter((group) => !GROUP_ORDER.includes(group))
      .map((group) => ({ heading: group, items: grouped.get(group) ?? [] }));
    return [...known, ...rest];
  }, [commands, needle]);

  const visibleFolders = useMemo(
    () =>
      commandMode || !mailbox
        ? []
        : folders.filter((folder) => matches(folder.name, trimmed)),
    [commandMode, folders, mailbox, trimmed],
  );

  const visibleMailboxes = useMemo(
    () =>
      commandMode
        ? []
        : mailboxes.filter(
            (entry) => entry.id !== mailbox?.id && matches(entry.address, trimmed),
          ),
    [commandMode, mailboxes, mailbox?.id, trimmed],
  );

  if (!open) return null;

  function runAndClose(action: () => void) {
    onClose();
    action();
  }

  return (
    <div
      className="palette-instant fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        style={{ background: "rgb(9 12 17 / 0.32)" }}
        onClick={onClose}
      />

      <Command
        label="Command palette"
        shouldFilter={false}
        className="panel relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-2.5">
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Search mail, appearance, settings…"
            className="field min-w-0 flex-1"
          />
          {searching && <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">…</span>}
          <span className="kbd shrink-0">Esc</span>
        </div>

        <Command.List className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-[var(--ink-muted)]">
            No matches.
          </Command.Empty>

          {results.length > 0 && (
            <Group heading="Messages">
              {results.map((message) => (
                <Item
                  key={message.id}
                  value={`message-${message.id}`}
                  onSelect={() => {
                    runAndClose(() => {
                      if (mailboxId) {
                        router.push(`/mail/${mailboxId}/${message.folderId}?message=${message.id}`);
                      }
                      select(message.id);
                    });
                  }}
                >
                  <span className="w-28 shrink-0 truncate text-[var(--ink-muted)]">
                    {displayName(message.from)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {message.subject || "(no subject)"}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-faint)]">
                    {formatMessageDate(message.sentAt)}
                  </span>
                </Item>
              ))}
            </Group>
          )}

          {commandGroups.map((group) => (
            <Group key={group.heading} heading={group.heading}>
              {group.items.map((command) => (
                <Item
                  key={command.id}
                  value={`command-${command.id}`}
                  onSelect={() => runAndClose(command.run)}
                >
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.suffix && (
                    <span className="font-mono text-[10px] font-medium tracking-[0.15em] text-primary uppercase">
                      {command.suffix}
                    </span>
                  )}
                  {command.hint && <span className="kbd">{command.hint}</span>}
                </Item>
              ))}
            </Group>
          ))}

          {visibleFolders.length + visibleMailboxes.length > 0 && mailbox && (
            <Group heading="Jump to">
              {visibleFolders.map((folder) => (
                <Item
                  key={folder.id}
                  value={`folder-${folder.id}`}
                  onSelect={() =>
                    runAndClose(() => navigateMailFolder(mailbox.id, folder.id))
                  }
                >
                  <span className="flex-1 truncate">{folder.name}</span>
                  {folder.unread > 0 && (
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      {folder.unread}
                    </span>
                  )}
                </Item>
              ))}

              {visibleMailboxes.map((entry) => (
                <Item
                  key={entry.id}
                  value={`mailbox-${entry.id}`}
                  onSelect={() => runAndClose(() => router.push(`/mail/${entry.id}`))}
                >
                  <span className="flex-1 truncate">{entry.address}</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">Mailbox</span>
                </Item>
              ))}
            </Group>
          )}

          {trimmed.length === 0 && mailboxId && (
            <div className="px-3 py-2.5">
              <p className="label">Search operators</p>
              <div className="flex flex-wrap gap-1.5">
                {SEARCH_OPERATORS.map((operator) => (
                  <button
                    key={operator.token}
                    type="button"
                    className="badge"
                    onClick={() => setQuery(operator.token)}
                    title={operator.hint}
                  >
                    <code className="font-mono">{operator.token}</code>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.15em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] data-[selected=true]:bg-accent-subtle data-[selected=true]:text-primary"
    >
      {children}
    </Command.Item>
  );
}

export function matchesCommand(command: PaletteCommand, query: string): boolean {
  if (!query) return true;
  const haystack = [command.label, command.group, ...(command.keywords ?? [])].join(" ");
  return matches(haystack, query);
}

function matches(candidate: string, query: string): boolean {
  if (!query) return true;
  return candidate.toLowerCase().includes(query.toLowerCase());
}

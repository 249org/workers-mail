"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MailboxEvent } from "@/lib/mail/events";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import type { MessageDetail, MessageSummary } from "@/lib/mail/queries";
import { formatAddressList } from "@/lib/mail/address";
import { normalizeSubject } from "@/lib/mail/thread";
import { ComposeDialog, type ComposeDraft } from "./compose-dialog";
import { FolderSidebar, type FolderSummary } from "./folder-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { useMailStream } from "./use-mail-stream";

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  folders: FolderSummary[];
  activeFolderId: string;
  initialMessages: MessageSummary[];
  initialCursor: number | null;
  initialSearch: string;
  initialSelectedId: string | null;
};

const EMPTY_DRAFT: ComposeDraft = { to: "", cc: "", bcc: "", subject: "", text: "" };
const SEARCH_DEBOUNCE_MS = 300;

export function MailWorkspace({
  mailbox,
  mailboxes,
  folders,
  activeFolderId,
  initialMessages,
  initialCursor,
  initialSearch,
  initialSelectedId,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [cursor, setCursor] = useState(initialCursor);
  const [search, setSearch] = useState(initialSearch);
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? initialMessages[0]?.id ?? null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(mailbox.syncError);
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [composeMailboxId, setComposeMailboxId] = useState(mailbox.id);
  const firstRender = useRef(true);

  useEffect(() => {
    setMessages(initialMessages);
    setCursor(initialCursor);
    setSelection(new Set());
    setSelectedId(initialSelectedId ?? initialMessages[0]?.id ?? null);
  }, [initialMessages, initialCursor, initialSelectedId]);

  const refresh = useCallback(
    async (options: { append?: boolean } = {}) => {
      setLoading(true);
      const params = new URLSearchParams({ mailbox: mailbox.id, folder: activeFolderId });
      if (search.trim()) params.set("q", search.trim());
      if (options.append && cursor) params.set("before", String(cursor));

      const response = await fetch(`/api/messages?${params}`);
      if (response.ok) {
        const page = (await response.json()) as {
          items: MessageSummary[];
          nextCursor: number | null;
        };
        setMessages((current) => (options.append ? [...current, ...page.items] : page.items));
        setCursor(page.nextCursor);
      }
      setLoading(false);
    },
    [mailbox.id, activeFolderId, search, cursor],
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => void refresh(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onEvent = useCallback(
    (event: MailboxEvent) => {
      if (event.type === "sync") {
        setSyncing(event.state === "syncing");
        setSyncError(event.state === "error" ? (event.error ?? "Sync failed") : null);
        if (event.state === "idle") {
          void refresh();
          router.refresh();
        }
        return;
      }
      if (event.type === "new" || event.type === "moved" || event.type === "deleted") {
        void refresh();
        router.refresh();
      }
    },
    [refresh, router],
  );

  const streamState = useMailStream(mailbox.id, onEvent);

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selectedId) ?? null,
    [messages, selectedId],
  );

  async function openMessage(message: MessageSummary) {
    setSelectedId(message.id);
    if (message.seen) return;

    setMessages((current) =>
      current.map((entry) => (entry.id === message.id ? { ...entry, seen: true } : entry)),
    );
    await fetch(`/api/messages/${message.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mailboxId: mailbox.id, seen: true }),
    });
    router.refresh();
  }

  async function bulk(action: "read" | "unread" | "flag" | "trash") {
    const ids = [...selection];
    if (ids.length === 0) return;

    await fetch("/api/messages/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mailboxId: mailbox.id, ids, action }),
    });
    setSelection(new Set());
    await refresh();
    router.refresh();
  }

  async function trashOne(messageId: string) {
    await fetch("/api/messages/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mailboxId: mailbox.id, ids: [messageId], action: "trash" }),
    });
    setSelectedId(null);
    await refresh();
    router.refresh();
  }

  async function syncNow() {
    setSyncing(true);
    await fetch(`/api/mailboxes/${mailbox.id}/sync`, { method: "POST" });
    await refresh();
    setSyncing(false);
  }

  function startReply(message: MessageDetail, mode: "reply" | "replyAll" | "forward") {
    const quoted = `\n\nOn ${new Date(message.sentAt * 1000).toLocaleString()}, ${
      message.from.name ?? message.from.address
    } wrote:\n> ${message.snippet}`;

    const recipients =
      mode === "forward"
        ? ""
        : mode === "replyAll"
          ? formatAddressList([message.from, ...message.to.filter((a) => a.address !== mailbox.address)])
          : message.from.address;

    setComposeMailboxId(mailbox.id);
    setCompose({
      to: recipients,
      cc: mode === "replyAll" ? formatAddressList(message.cc) : "",
      bcc: "",
      subject:
        mode === "forward"
          ? `Fwd: ${normalizeSubject(message.subject)}`
          : `Re: ${normalizeSubject(message.subject)}`,
      text: quoted,
      inReplyTo: message.messageId ?? undefined,
      references: message.messageId ? [message.messageId] : undefined,
      threadId: message.threadId,
    });
  }

  const composeMailbox =
    mailboxes.find((entry) => entry.id === composeMailboxId) ?? mailbox;

  return (
    <div className="flex h-full">
      <FolderSidebar
        mailbox={mailbox}
        mailboxes={mailboxes}
        folders={folders}
        activeFolderId={activeFolderId}
        streamState={streamState}
        syncing={syncing}
        syncError={syncError}
        onCompose={() => {
          setComposeMailboxId(mailbox.id);
          setCompose(EMPTY_DRAFT);
        }}
        onSync={() => void syncNow()}
      />

      <MessageList
        messages={messages}
        selectedId={selectedId}
        selection={selection}
        loading={loading}
        hasMore={cursor !== null}
        search={search}
        onSearch={setSearch}
        onSelect={(message) => void openMessage(message)}
        onToggle={(id) => {
          const next = new Set(selection);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelection(next);
        }}
        onToggleAll={() =>
          setSelection(
            selection.size === messages.length
              ? new Set()
              : new Set(messages.map((message) => message.id)),
          )
        }
        onLoadMore={() => void refresh({ append: true })}
        onBulk={(action) => void bulk(action)}
      />

      {selectedMessage ? (
        <MessageView
          mailboxId={mailbox.id}
          messageId={selectedMessage.id}
          onReply={startReply}
          onTrash={(id) => void trashOne(id)}
          onThreadSelect={setSelectedId}
        />
      ) : (
        <section className="hidden flex-1 items-center justify-center bg-[var(--raised)] md:flex">
          <p className="text-sm text-[var(--ink-muted)]">Select a message to read it.</p>
        </section>
      )}

      {compose && (
        <ComposeDialog
          mailbox={composeMailbox}
          mailboxes={mailboxes}
          draft={compose}
          onMailboxChange={setComposeMailboxId}
          onClose={() => setCompose(null)}
          onSent={async () => {
            setCompose(null);
            await refresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

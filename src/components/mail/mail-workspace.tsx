"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MailboxEvent } from "@/lib/mail/events";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import type { MessageSummary } from "@/lib/mail/queries";
import { formatAddressList } from "@/lib/mail/address";
import { normalizeSubject } from "@/lib/mail/thread";
import { useMailStore, type FolderSummary } from "@/lib/mail/view-store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { CommandPalette, type PaletteCommand } from "@/components/palette/command-palette";
import { ComposeDialog, type ComposeDraft } from "./compose-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { ShortcutHelp } from "./shortcut-help";
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
const SEARCH_DEBOUNCE_MS = 200;

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
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [composeMailboxId, setComposeMailboxId] = useState(mailbox.id);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDirty = useRef(false);

  const hydrate = useMailStore((state) => state.hydrate);
  const messages = useMailStore((state) => state.messages);
  const selectedId = useMailStore((state) => state.selectedId);
  const checked = useMailStore((state) => state.checked);
  const search = useMailStore((state) => state.search);
  const fetchPage = useMailStore((state) => state.fetchPage);
  const refreshFolders = useMailStore((state) => state.refreshFolders);

  useEffect(() => {
    hydrate({
      mailboxId: mailbox.id,
      folderId: activeFolderId,
      messages: initialMessages,
      folders,
      cursor: initialCursor,
      search: initialSearch,
      selectedId: initialSelectedId,
    });
  }, [
    hydrate,
    mailbox.id,
    activeFolderId,
    initialMessages,
    folders,
    initialCursor,
    initialSearch,
    initialSelectedId,
  ]);

  // Re-query on search, but never on the first render — the server already did it.
  useEffect(() => {
    if (!searchDirty.current) {
      searchDirty.current = true;
      return;
    }
    const timer = setTimeout(() => void fetchPage(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, fetchPage]);

  const onEvent = useCallback(
    (event: MailboxEvent) => {
      const store = useMailStore.getState();
      if (event.type === "sync") {
        store.setSyncing(event.state === "syncing");
        store.setSyncError(event.state === "error" ? (event.error ?? "Sync failed") : null);
        if (event.state === "idle") {
          void store.fetchPage();
          void store.refreshFolders();
        }
        return;
      }
      if (event.type === "new") {
        void store.fetchPage();
        void store.refreshFolders();
      }
    },
    [],
  );

  const streamState = useMailStream(mailbox.id, onEvent);

  const targetIds = useMemo(
    () => (checked.size > 0 ? [...checked] : selectedId ? [selectedId] : []),
    [checked, selectedId],
  );

  const archive = useCallback(() => {
    const store = useMailStore.getState();
    const target = store.folders.find((folder) => folder.role === "archive");
    if (!target) {
      toast.error("This mailbox has no archive folder.");
      return;
    }
    if (targetIds.length === 0) return;

    store.moveTo(targetIds, target.id, "Archived");
    toast("Archived", { action: { label: "Undo", onClick: () => void store.undo() } });
    void store.refreshFolders();
  }, [targetIds]);

  const trash = useCallback(() => {
    const store = useMailStore.getState();
    if (targetIds.length === 0) return;
    store.trash(targetIds);
    toast("Moved to trash", { action: { label: "Undo", onClick: () => void store.undo() } });
    void store.refreshFolders();
  }, [targetIds]);

  const startReply = useCallback(
    (mode: "reply" | "replyAll" | "forward") => {
      const store = useMailStore.getState();
      const loaded = store.selectedId ? store.loaded.get(store.selectedId) : undefined;
      if (!loaded) return;

      const { detail } = loaded;
      const quoted = `\n\nOn ${new Date(detail.sentAt * 1000).toLocaleString()}, ${
        detail.from.name ?? detail.from.address
      } wrote:\n> ${detail.snippet}`;

      const recipients =
        mode === "forward"
          ? ""
          : mode === "replyAll"
            ? formatAddressList([
                detail.from,
                ...detail.to.filter((addr) => addr.address !== mailbox.address),
              ])
            : detail.from.address;

      setComposeMailboxId(mailbox.id);
      setCompose({
        to: recipients,
        cc: mode === "replyAll" ? formatAddressList(detail.cc) : "",
        bcc: "",
        subject:
          mode === "forward"
            ? `Fwd: ${normalizeSubject(detail.subject)}`
            : `Re: ${normalizeSubject(detail.subject)}`,
        text: quoted,
        inReplyTo: detail.messageId ?? undefined,
        references: detail.messageId ? [detail.messageId] : undefined,
        threadId: detail.threadId,
      });
    },
    [mailbox.id, mailbox.address],
  );

  const goToRole = useCallback(
    (role: string) => {
      const target = useMailStore.getState().folders.find((folder) => folder.role === role);
      if (target) router.push(`/mail/${mailbox.id}/${target.id}`);
    },
    [router, mailbox.id],
  );

  const syncNow = useCallback(async () => {
    const store = useMailStore.getState();
    store.setSyncing(true);
    await fetch(`/api/mailboxes/${mailbox.id}/sync`, { method: "POST" });
    await store.fetchPage();
    store.setSyncing(false);
  }, [mailbox.id]);

  useHotkeys("global", {
    palette: () => {
      setPaletteQuery("");
      setPaletteOpen(true);
    },
    search: () => searchRef.current?.focus(),
    help: () => setHelpOpen(true),
    compose: () => {
      setComposeMailboxId(mailbox.id);
      setCompose(EMPTY_DRAFT);
    },
    undo: () => {
      void useMailStore.getState().undo().then((did) => {
        if (did) toast("Undone");
      });
    },
    syncNow: () => void syncNow(),
    back: () => {
      const store = useMailStore.getState();
      if (store.checked.size > 0) store.clearChecked();
      else searchRef.current?.blur();
    },
    goInbox: () => goToRole("inbox"),
    goStarred: () => goToRole("archive"),
    goSent: () => goToRole("sent"),
    goDrafts: () => goToRole("drafts"),
    goArchive: () => goToRole("archive"),
    goSettings: () => router.push("/settings"),
  });

  useHotkeys("list", {
    next: () => useMailStore.getState().step(1),
    previous: () => useMailStore.getState().step(-1),
    archive,
    trash,
    star: () => {
      const store = useMailStore.getState();
      const current = store.messages.find((message) => message.id === store.selectedId);
      store.star(targetIds, !current?.flagged);
    },
    unread: () => {
      useMailStore.getState().markRead(targetIds, false);
      void refreshFolders();
    },
    select: () => {
      const store = useMailStore.getState();
      if (store.selectedId) store.toggleChecked(store.selectedId);
    },
    selectAll: () => useMailStore.getState().toggleAllChecked(),
  });

  useHotkeys(
    "reader",
    {
      reply: () => startReply("reply"),
      replyAll: () => startReply("replyAll"),
      forward: () => startReply("forward"),
    },
    Boolean(selectedId),
  );

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: "compose", label: "Compose message", hint: "C", group: "Actions", run: () => setCompose(EMPTY_DRAFT) },
      { id: "archive", label: "Archive selected", hint: "E", group: "Actions", run: archive },
      { id: "trash", label: "Move selected to trash", hint: "#", group: "Actions", run: trash },
      { id: "sync", label: "Sync now", group: "Actions", run: () => void syncNow() },
      { id: "help", label: "Keyboard shortcuts", hint: "?", group: "Application", run: () => setHelpOpen(true) },
      { id: "settings", label: "Open settings", group: "Application", run: () => router.push("/settings") },
      {
        id: "signout",
        label: "Sign out",
        group: "Application",
        run: async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
        },
      },
    ],
    [archive, trash, syncNow, router],
  );

  return (
    <div className="flex h-full">
      <FolderSidebar
        mailbox={mailbox}
        mailboxes={mailboxes}
        streamState={streamState}
        onCompose={() => {
          setComposeMailboxId(mailbox.id);
          setCompose(EMPTY_DRAFT);
        }}
        onSync={() => void syncNow()}
        onOpenPalette={() => {
          setPaletteQuery("");
          setPaletteOpen(true);
        }}
      />

      <MessageList
        searchRef={searchRef}
        onOpenSearch={() => {
          /* focus alone is enough; the palette stays a deliberate ⌘K action */
        }}
      />

      {selectedId && messages.length > 0 ? (
        <MessageView messageId={selectedId} onReply={startReply} />
      ) : (
        <section className="hidden flex-1 items-center justify-center bg-[var(--raised)] md:flex">
          <p className="text-[13px] text-[var(--ink-muted)]">
            Nothing selected. Press <span className="kbd">J</span> to start reading.
          </p>
        </section>
      )}

      <CommandPalette
        open={paletteOpen}
        initialQuery={paletteQuery}
        mailbox={mailbox}
        mailboxes={mailboxes}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {compose && (
        <ComposeDialog
          mailbox={mailboxes.find((entry) => entry.id === composeMailboxId) ?? mailbox}
          mailboxes={mailboxes}
          draft={compose}
          onMailboxChange={setComposeMailboxId}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            toast.success("Message sent");
            void useMailStore.getState().fetchPage();
          }}
        />
      )}
    </div>
  );
}

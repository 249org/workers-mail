"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { MailboxEvent } from "@/lib/mail/events";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { formatAddressList } from "@/lib/mail/address";
import { normalizeSubject } from "@/lib/mail/thread";
import { navigateMailFolder, useMailStore, type FolderSummary } from "@/lib/mail/view-store";
import { readMailLayout, writeMailLayout, type MailLayout } from "@/lib/mail/layout-prefs";
import { usePaletteStore } from "@/lib/palette/store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import type { PaletteCommand } from "@/components/palette/command-palette";
import { ComposeDialog, type ComposeDraft } from "./compose-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { useMailStream } from "./use-mail-stream";

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  folders: FolderSummary[];
  initialLastSyncedAt: number | null;
  initialSyncError: string | null;
};

const EMPTY_DRAFT: ComposeDraft = { to: "", cc: "", bcc: "", subject: "", text: "" };
const SEARCH_DEBOUNCE_MS = 200;

export function MailWorkspace({
  mailbox,
  mailboxes,
  folders,
  initialLastSyncedAt,
  initialSyncError,
}: Props) {
  const router = useRouter();
  const params = useParams<{ mailboxId: string; folderId?: string }>();
  const searchParams = useSearchParams();
  const folderId = params.folderId ?? "";
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [composeMailboxId, setComposeMailboxId] = useState(mailbox.id);
  const [layout, setLayout] = useState<MailLayout>({ sidebarCollapsed: false, listHidden: false });
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDirty = useRef(false);

  useEffect(() => {
    setLayout(readMailLayout());
  }, []);

  const setMailLayout = useCallback((patch: Partial<MailLayout> | ((current: MailLayout) => MailLayout)) => {
    setLayout((current) => {
      const next = typeof patch === "function" ? patch(current) : { ...current, ...patch };
      writeMailLayout(next);
      return next;
    });
  }, []);

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
      folderId,
      messages: [],
      folders,
      cursor: null,
      search: searchParams.get("q") ?? "",
      selectedId: searchParams.get("message"),
      lastSyncedAt: initialLastSyncedAt,
      syncError: initialSyncError,
    });
    if (folderId) void useMailStore.getState().fetchPage();
    // Mailbox layout owns this tree; folder changes go through openFolder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate, mailbox.id, folders, initialLastSyncedAt, initialSyncError]);

  useEffect(() => {
    if (folderId && folderId !== useMailStore.getState().folderId) {
      useMailStore.getState().openFolder(folderId);
    }
  }, [folderId]);

  useEffect(() => {
    const onPopState = () => {
      const match = window.location.pathname.match(/^\/mail\/[^/]+\/([^/]+)/);
      const nextFolder = match?.[1];
      if (nextFolder && nextFolder !== useMailStore.getState().folderId) {
        useMailStore.getState().openFolder(nextFolder);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
        if ((event.stored ?? 0) > 0 || event.state === "idle") {
          void store.fetchPage();
          void store.refreshFolders();
        }
        return;
      }
      if (event.type === "new") {
        void store.refreshFolders();
        if (event.folderId === store.folderId) void store.fetchPage();
        return;
      }
      if (event.type === "sent") {
        const sent = store.folders.find((folder) => folder.role === "sent");
        if (sent && sent.id === store.folderId) void store.fetchPage();
      }
    },
    [],
  );

  const streamState = useMailStream(mailbox.id, onEvent);

  useEffect(() => {
    if (streamState === "connecting") return;
    void fetchPage();
    void refreshFolders();
  }, [streamState, fetchPage, refreshFolders]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void fetchPage();
      void refreshFolders();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const tick = setInterval(onVisible, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(tick);
    };
  }, [fetchPage, refreshFolders]);

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
      if (target) navigateMailFolder(mailbox.id, target.id);
    },
    [mailbox.id],
  );

  const syncNow = useCallback(async () => {
    const store = useMailStore.getState();
    store.setSyncing(true);
    await fetch(`/api/mailboxes/${mailbox.id}/sync`, { method: "POST" });
    await store.fetchPage();
    store.setSyncing(false);
  }, [mailbox.id]);

  const toggleSidebar = useCallback(() => {
    setMailLayout((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }));
  }, [setMailLayout]);

  const setListHidden = useCallback(
    (hidden: boolean) => {
      setMailLayout({ listHidden: hidden });
    },
    [setMailLayout],
  );

  const toggleList = useCallback(() => {
    if (!useMailStore.getState().selectedId) return;
    setMailLayout((current) => ({ ...current, listHidden: !current.listHidden }));
  }, [setMailLayout]);

  useHotkeys("global", {
    search: () => searchRef.current?.focus(),
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
    toggleSidebar,
    toggleList,
    back: () => {
      if (layout.listHidden) {
        setListHidden(false);
        return;
      }
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
    open: () => {
      if (useMailStore.getState().selectedId) setListHidden(true);
    },
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
      { id: "compose", label: "Compose message", hint: "C", group: "Actions", keywords: ["new", "write"], run: () => setCompose(EMPTY_DRAFT) },
      { id: "archive", label: "Archive selected", hint: "E", group: "Actions", run: archive },
      { id: "trash", label: "Move selected to trash", hint: "#", group: "Actions", run: trash },
      { id: "sync", label: "Sync now", hint: "⇧R", group: "Actions", keywords: ["refresh", "imap"], run: () => void syncNow() },
      {
        id: "sidebar",
        label: layout.sidebarCollapsed ? "Expand folder sidebar" : "Collapse folder sidebar",
        hint: "[",
        group: "Application",
        keywords: ["rail", "folders", "nav"],
        run: toggleSidebar,
      },
      {
        id: "reader",
        label: layout.listHidden ? "Show message list" : "Read full width",
        hint: "]",
        group: "Application",
        keywords: ["focus", "wide", "list"],
        run: toggleList,
      },
    ],
    [archive, trash, syncNow, layout.sidebarCollapsed, layout.listHidden, toggleSidebar, toggleList],
  );

  useEffect(() => {
    const store = usePaletteStore.getState();
    store.setMailbox(mailbox);
    store.setExtras(commands);
    return () => {
      store.setMailbox(null);
      store.setExtras([]);
    };
  }, [mailbox, commands]);

  return (
    <div className="flex h-full">
      <FolderSidebar
        mailbox={mailbox}
        mailboxes={mailboxes}
        streamState={streamState}
        collapsed={layout.sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onCompose={() => {
          setComposeMailboxId(mailbox.id);
          setCompose(EMPTY_DRAFT);
        }}
        onSync={() => void syncNow()}
        onOpenPalette={() => usePaletteStore.getState().openPalette()}
      />

      <MessageList
        hidden={layout.listHidden && Boolean(selectedId)}
        searchRef={searchRef}
        onHideList={() => setListHidden(true)}
        onOpenSearch={() => {
          /* focus alone is enough; the palette stays a deliberate ⌘K action */
        }}
      />

      {selectedId && messages.length > 0 ? (
        <MessageView
          messageId={selectedId}
          onReply={startReply}
          listHidden={layout.listHidden}
          onToggleList={toggleList}
        />
      ) : (
        <section className="hidden flex-1 items-center justify-center bg-card md:flex">
          <p className="text-[13px] text-muted-foreground">
            Nothing selected. Press <span className="kbd">J</span> to start reading.
          </p>
        </section>
      )}

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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { MailboxEvent } from "@/lib/mail/events";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { formatAddressList } from "@/lib/mail/address";
import { normalizeSubject } from "@/lib/mail/thread";
import { partitionFolders } from "@/lib/mail/folder-name";
import {
  flushPendingReads,
  navigateMailFolder,
  onMailActionFailure,
  useMailStore,
  type FolderSummary,
} from "@/lib/mail/view-store";
import { readMailLayout, writeMailLayout, type MailLayout } from "@/lib/mail/layout-prefs";
import { usePaletteStore } from "@/lib/palette/store";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { useShortcutStore } from "@/lib/keyboard/store";
import { primaryCombo } from "@/lib/keyboard/bindings";
import { formatComboHint } from "@/lib/keyboard/shortcuts";
import type { PaletteCommand } from "@/components/palette/command-palette";
import { useIsMac } from "./key-caps";
import { ComposeDialog, type ComposeDraft } from "./compose-dialog";
import { FolderSidebar } from "./folder-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { MailIcon } from "./icons";
import { useMailStream } from "./use-mail-stream";
import { NARROW_MAIL, useMediaQuery } from "@/lib/use-media-query";

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  folders: FolderSummary[];
  initialLastSyncedAt: number | null;
  initialSyncError: string | null;
};

const EMPTY_DRAFT: ComposeDraft = {
  mode: "compose",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  text: "",
};
const SEARCH_DEBOUNCE_MS = 200;
const ACTION_TOAST = "mail-action";

function undoLastAction(): boolean {
  const did = useMailStore.getState().undo();
  if (!did) return false;
  toast.dismiss(ACTION_TOAST);
  toast("Undone");
  return true;
}

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
  const [foldersOpen, setFoldersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDirty = useRef(false);
  const narrow = useMediaQuery(NARROW_MAIL);

  useEffect(() => {
    onMailActionFailure((message) => toast.error(message, { id: ACTION_TOAST }));
    return () => onMailActionFailure(null);
  }, []);

  // Reads are batched, so anything still waiting has to go before the page does.
  useEffect(() => {
    const flush = () => flushPendingReads();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, []);

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
  const inTrash = useMailStore(
    (state) => state.folders.find((folder) => folder.id === state.folderId)?.role === "trash",
  );
  const liveFolders = useMailStore((state) => state.folders);
  const isMac = useIsMac();
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const hintFor = (action: "compose" | "archive" | "trash" | "syncNow" | "toggleSidebar" | "toggleList") => {
    const combo = primaryCombo(action, shortcuts);
    return combo ? formatComboHint(combo, isMac) : undefined;
  };

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
    if (!folderId) return;
    void useMailStore.getState().syncOpenFolder();
  }, [folderId, mailbox.id]);

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
    toast("Archived", {
      id: ACTION_TOAST,
      action: { label: "Undo", onClick: () => undoLastAction() },
    });
    void store.refreshFolders();
  }, [targetIds]);

  const trash = useCallback(() => {
    const store = useMailStore.getState();
    if (targetIds.length === 0) return;
    const inTrash = store.folders.find((folder) => folder.id === store.folderId)?.role === "trash";
    if (inTrash) {
      store.deleteForever(targetIds);
      toast("Deleted forever");
    } else {
      store.trash(targetIds);
      toast("Moved to trash", {
        id: ACTION_TOAST,
        action: { label: "Undo", onClick: () => undoLastAction() },
      });
    }
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
        mode,
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

  const closeFolders = useCallback(() => setFoldersOpen(false), []);

  const toggleSidebar = useCallback(() => {
    if (narrow) {
      setFoldersOpen((open) => !open);
      return;
    }
    setMailLayout((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }));
  }, [narrow, setMailLayout]);

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

  const startCompose = useCallback(() => {
    setComposeMailboxId(mailbox.id);
    setCompose(EMPTY_DRAFT);
    setFoldersOpen(false);
  }, [mailbox.id]);

  const leaveReader = useCallback(() => {
    if (narrow) {
      useMailStore.getState().select(null);
      return;
    }
    toggleList();
  }, [narrow, toggleList]);

  useHotkeys("global", {
    search: () => searchRef.current?.focus(),
    compose: () => startCompose(),
    undo: () => {
      undoLastAction();
    },
    syncNow: () => void syncNow(),
    toggleSidebar,
    toggleList,
    back: () => {
      if (foldersOpen) {
        setFoldersOpen(false);
        return;
      }
      if (narrow && useMailStore.getState().selectedId) {
        useMailStore.getState().select(null);
        return;
      }
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
    () => {
      const custom = partitionFolders(liveFolders).custom;
      const moveCommands: PaletteCommand[] = custom.map((folder) => ({
        id: `move-${folder.id}`,
        label: `Move to ${folder.name}`,
        group: "Actions",
        keywords: ["folder", folder.name, "file"],
        run: () => {
          if (targetIds.length === 0) return;
          const store = useMailStore.getState();
          store.moveTo(targetIds, folder.id, `Moved to ${folder.name}`);
          toast(`Moved to ${folder.name}`, {
            id: ACTION_TOAST,
            action: { label: "Undo", onClick: () => undoLastAction() },
          });
          void store.refreshFolders();
        },
      }));

      return [
        { id: "compose", label: "Compose message", hint: hintFor("compose"), group: "Actions", keywords: ["new", "write"], run: startCompose },
        {
          id: "new-folder",
          label: "New folder",
          group: "Actions",
          keywords: ["create", "directory", "label"],
          run: () => {
            if (narrow) setFoldersOpen(true);
            else if (layout.sidebarCollapsed) toggleSidebar();
            useMailStore.getState().setCreatingFolder(true);
          },
        },
        { id: "archive", label: "Archive selected", hint: hintFor("archive"), group: "Actions", run: archive },
        { id: "trash", label: inTrash ? "Delete selected forever" : "Move selected to trash", hint: hintFor("trash"), group: "Actions", run: trash },
        ...moveCommands,
        { id: "sync", label: "Sync now", hint: hintFor("syncNow"), group: "Actions", keywords: ["refresh", "imap"], run: () => void syncNow() },
        {
          id: "sidebar",
          label: layout.sidebarCollapsed ? "Expand folder sidebar" : "Collapse folder sidebar",
          hint: hintFor("toggleSidebar"),
          group: "Application",
          keywords: ["rail", "folders", "nav"],
          run: toggleSidebar,
        },
        {
          id: "reader",
          label: layout.listHidden ? "Show message list" : "Read full width",
          hint: hintFor("toggleList"),
          group: "Application",
          keywords: ["focus", "wide", "list"],
          run: toggleList,
        },
      ];
    },
    [archive, trash, syncNow, inTrash, layout.sidebarCollapsed, layout.listHidden, toggleSidebar, toggleList, startCompose, shortcuts, isMac, liveFolders, targetIds, narrow],
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
    <div
      className="mail-workspace flex h-full min-w-0"
      data-reading={selectedId ? "" : undefined}
      data-folders-open={foldersOpen ? "" : undefined}
    >
      {foldersOpen ? (
        <button
          type="button"
          className="mail-folders-scrim"
          aria-label="Close folders"
          onClick={closeFolders}
        />
      ) : null}

      <FolderSidebar
        mailbox={mailbox}
        mailboxes={mailboxes}
        streamState={streamState}
        collapsed={narrow ? false : layout.sidebarCollapsed}
        onCompose={startCompose}
        onSync={() => void syncNow()}
        onOpenPalette={() => {
          setFoldersOpen(false);
          usePaletteStore.getState().openPalette();
        }}
        onNavigate={() => {
          useMailStore.getState().select(null);
          closeFolders();
        }}
        onExpand={() => {
          if (narrow) setFoldersOpen(true);
          else if (layout.sidebarCollapsed) toggleSidebar();
        }}
      />

      <MessageList
        hidden={layout.listHidden && Boolean(selectedId)}
        searchRef={searchRef}
        sidebarCollapsed={layout.sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onCompose={startCompose}
        onOpenSearch={() => {
          /* focus alone is enough; the palette stays a deliberate ⌘K action */
        }}
      />

      {selectedId && messages.length > 0 ? (
        <MessageView
          messageId={selectedId}
          onReply={startReply}
          listHidden={narrow || layout.listHidden}
          onToggleList={leaveReader}
        />
      ) : (
        <section className="mail-reader hidden flex-1 flex-col items-center justify-center gap-3 bg-card px-8 text-center md:flex">
          <span className="icon-well" aria-hidden>
            <MailIcon name="inbox" />
          </span>
          <p className="text-[13px] text-muted-foreground">
            Press <span className="kbd">J</span> to open a message.
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

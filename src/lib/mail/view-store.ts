"use client";

import { create } from "zustand";
import type { MessageDetail, MessageSummary } from "./queries";

export type MessageBody = {
  html: string;
  blockedImages: number;
  text: string;
  kind: "plain" | "html";
};

export type LoadedMessage = {
  detail: MessageDetail;
  thread: MessageSummary[];
  body: MessageBody | null;
};

export type FolderSummary = {
  id: string;
  name: string;
  role: string;
  unread: number;
};

export type MailAction = "read" | "unread" | "flag" | "unflag" | "move" | "trash" | "delete" | "empty-trash";

type UndoEntry = {
  label: string;
  ids: string[];
  /** Restores the rows immediately; the inverse server call runs in the background. */
  revert: () => void;
};

const BODY_CACHE_LIMIT = 60;
/** Collapses concurrent loads of the same message into one request. */
const inFlight = new Map<string, Promise<void>>();
/** Load another page once the cursor comes within this many rows of the end. */
const PREFETCH_MARGIN = 5;

type FolderPage = {
  messages: MessageSummary[];
  cursor: number | null;
  selectedId: string | null;
};

type RemovedRow = { message: MessageSummary; index: number };

const folderPages = new Map<string, FolderPage>();
let pageRequest = 0;
/** id → folder they were removed from, so a later fetch cannot resurrect them there. */
const optimisticAbsent = new Map<string, string>();
/** Rows restored by undo that the origin folder fetch may not include yet. */
const pendingRestores = new Map<string, RemovedRow>();
/** Last local action ticket per message, so in-flight IMAP calls cannot clobber a newer undo/trash. */
const actionTicket = new Map<string, number>();
let actionSeq = 0;

function folderKey(mailboxId: string, folderId: string, search: string): string {
  return `${mailboxId}:${folderId}:${search.trim()}`;
}

function rememberFolder(state: Pick<State, "mailboxId" | "folderId" | "search" | "messages" | "cursor" | "selectedId">) {
  if (!state.mailboxId || !state.folderId) return;
  folderPages.set(folderKey(state.mailboxId, state.folderId, state.search), {
    messages: state.messages,
    cursor: state.cursor,
    selectedId: state.selectedId,
  });
}

type State = {
  mailboxId: string;
  folderId: string;
  messages: MessageSummary[];
  folders: FolderSummary[];
  cursor: number | null;
  search: string;
  selectedId: string | null;
  checked: Set<string>;
  loading: boolean;
  loaded: Map<string, LoadedMessage>;
  undoStack: UndoEntry[];
  syncing: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  creatingFolder: boolean;
};

type Actions = {
  hydrate: (input: {
    mailboxId: string;
    folderId: string;
    messages: MessageSummary[];
    folders: FolderSummary[];
    cursor: number | null;
    search: string;
    selectedId: string | null;
    lastSyncedAt: number | null;
    syncError: string | null;
  }) => void;

  setSearch: (value: string) => void;
  select: (id: string | null) => void;
  step: (direction: 1 | -1) => void;
  toggleChecked: (id: string) => void;
  toggleAllChecked: () => void;
  clearChecked: () => void;

  fetchPage: (options?: { append?: boolean }) => Promise<void>;
  load: (id: string, options?: { allowRemoteImages?: boolean }) => Promise<void>;
  prefetchAround: (id: string) => void;

  markRead: (ids: string[], seen: boolean) => void;
  removeLocally: (
    ids: string[],
    label: string,
    request: { action: "move" | "trash"; folderId?: string },
  ) => void;
  star: (ids: string[], flagged: boolean) => void;
  moveTo: (ids: string[], folderId: string, label: string) => void;
  trash: (ids: string[]) => void;
  deleteForever: (ids: string[]) => void;
  emptyTrash: () => void;
  undo: () => boolean;

  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
  refreshFolders: () => Promise<void>;
  openFolder: (folderId: string) => void;
  syncOpenFolder: () => Promise<void>;
  setCreatingFolder: (creating: boolean) => void;
  createFolder: (name: string) => Promise<FolderSummary>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
};

export const useMailStore = create<State & Actions>((set, get) => ({
  mailboxId: "",
  folderId: "",
  messages: [],
  folders: [],
  cursor: null,
  search: "",
  selectedId: null,
  checked: new Set(),
  loading: false,
  loaded: new Map(),
  undoStack: [],
  syncing: false,
  syncError: null,
  lastSyncedAt: null,
  creatingFolder: false,

  hydrate: (input) => {
    const current = get();
    const mailboxChanged = current.mailboxId !== input.mailboxId;
    const changedView = mailboxChanged || current.folderId !== input.folderId;

    if (!changedView && current.messages.length > 0) {
      set({
        folders: input.folders,
        lastSyncedAt: input.lastSyncedAt,
        syncError: input.syncError,
      });
      return;
    }

    if (mailboxChanged) {
      optimisticAbsent.clear();
      pendingRestores.clear();
      actionTicket.clear();
    }

    if (current.folderId && !mailboxChanged) rememberFolder(current);

    const cached =
      !mailboxChanged && input.folderId
        ? folderPages.get(folderKey(input.mailboxId, input.folderId, input.search))
        : undefined;

    const messages = applyOptimistic(cached?.messages ?? input.messages, input.folderId);
    set({
      ...input,
      messages,
      cursor: cached?.cursor ?? input.cursor,
      checked: changedView ? new Set() : current.checked,
      loaded: mailboxChanged ? new Map() : current.loaded,
      selectedId: keepSelection(messages, cached ? cached.selectedId : (input.selectedId ?? null)),
    });
  },

  setSearch: (value) => set({ search: value }),

  select: (id) => {
    set({ selectedId: id });
    if (!id) return;

    void get().load(id);
    get().prefetchAround(id);

    // Landing on a message reads it, the way a cursor-driven client is expected to.
    const message = get().messages.find((entry) => entry.id === id);
    if (message && !message.seen) get().markRead([id], true);
  },

  step: (direction) => {
    const { messages, selectedId } = get();
    if (messages.length === 0) return;

    const index = messages.findIndex((message) => message.id === selectedId);
    let next = index === -1 ? 0 : index + direction;
    while (next >= 0 && next < messages.length && messages[next]?.id === selectedId) {
      next += direction;
    }
    const target = next >= 0 && next < messages.length ? messages[next] : undefined;
    if (!target || target.id === selectedId) return;

    get().select(target.id);
    if (next >= messages.length - PREFETCH_MARGIN) void get().fetchPage({ append: true });
  },

  toggleChecked: (id) => {
    const checked = new Set(get().checked);
    if (checked.has(id)) checked.delete(id);
    else checked.add(id);
    set({ checked });
  },

  toggleAllChecked: () => {
    const { checked, messages } = get();
    set({
      checked:
        checked.size === messages.length
          ? new Set()
          : new Set(messages.map((message) => message.id)),
    });
  },

  clearChecked: () => set({ checked: new Set() }),

  fetchPage: async (options = {}) => {
    const { mailboxId, folderId, search, cursor, loading } = get();
    if (!mailboxId || !folderId || (options.append && (loading || cursor === null))) return;

    const requestId = ++pageRequest;
    const requestedFolder = folderId;
    const requestedSearch = search;
    set({ loading: true });
    const params = new URLSearchParams({ mailbox: mailboxId, folder: folderId });
    if (search.trim()) params.set("q", search.trim());
    if (options.append && cursor) params.set("before", String(cursor));

    try {
      const response = await fetch(`/api/messages?${params}`, { cache: "no-store" });
      if (!response.ok) return;
      const page = (await response.json()) as {
        items: MessageSummary[];
        nextCursor: number | null;
      };
      if (requestId !== pageRequest) return;

      set((state) => {
        if (state.folderId !== requestedFolder || state.search !== requestedSearch) return state;
        for (const item of page.items) pendingRestores.delete(item.id);
        const messages = applyOptimistic(
          options.append ? [...state.messages, ...page.items] : page.items,
          requestedFolder,
        );
        const selectedId = keepSelection(messages, state.selectedId);
        folderPages.set(folderKey(state.mailboxId, state.folderId, state.search), {
          messages,
          cursor: page.nextCursor,
          selectedId,
        });
        return { messages, cursor: page.nextCursor, selectedId };
      });
    } finally {
      if (requestId === pageRequest) set({ loading: false });
    }
  },

  load: async (id, options = {}) => {
    const { mailboxId, loaded } = get();
    if (loaded.get(id)?.body && !options.allowRemoteImages) return;

    const key = options.allowRemoteImages ? `${id}:images` : id;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const params = new URLSearchParams({ mailbox: mailboxId, include: "body" });
    if (options.allowRemoteImages) params.set("images", "1");

    const request = (async () => {
      try {
        const response = await fetch(`/api/messages/${id}?${params}`);
        if (!response.ok) return;
        const payload = (await response.json()) as LoadedMessage;
        set((state) => ({ loaded: withCacheLimit(state.loaded, id, payload) }));
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, request);
    return request;
  },

  prefetchAround: (id) => {
    const { messages } = get();
    const index = messages.findIndex((message) => message.id === id);
    if (index === -1) return;

    // Reading is almost always forward, so look two ahead and only one back.
    for (const offset of [1, 2, -1]) {
      const neighbour = messages[index + offset];
      if (neighbour && !get().loaded.has(neighbour.id)) void get().load(neighbour.id);
    }
  },

  markRead: (ids, seen) => {
    if (ids.length === 0) return;
    patchLocal(set, ids, { seen });
    void send({ ids, action: seen ? "read" : "unread" });
  },

  star: (ids, flagged) => {
    if (ids.length === 0) return;
    patchLocal(set, ids, { flagged });
    void send({ ids, action: flagged ? "flag" : "unflag" });
  },

  moveTo: (ids, folderId, label) => {
    if (ids.length === 0) return;
    get().removeLocally(ids, label, { action: "move", folderId });
  },

  trash: (ids) => {
    if (ids.length === 0) return;
    get().removeLocally(ids, "Moved to trash", { action: "trash" });
  },

  deleteForever: (ids) => {
    if (ids.length === 0) return;
    const state = get();
    const removed = state.messages
      .map((message, index) => ({ message, index }))
      .filter((entry) => ids.includes(entry.message.id));
    if (removed.length === 0) return;

    const restore = () =>
      set((current) => ({ messages: reinsert(current.messages, removed) }));

    const loaded = new Map(state.loaded);
    for (const id of ids) loaded.delete(id);

    set({
      messages: state.messages.filter((message) => !ids.includes(message.id)),
      selectedId: selectionAfterRemoval(state.messages, ids, state.selectedId),
      checked: new Set(),
      loaded,
    });

    void send({ ids, action: "delete" }).then((ok) => {
      if (!ok) restore();
    });
  },

  emptyTrash: () => {
    const state = get();
    const trash = state.folders.find((folder) => folder.role === "trash");
    if (!trash || state.folderId !== trash.id) return;

    const snapshot = state.messages;
    const snapshotCursor = state.cursor;
    const snapshotSelected = state.selectedId;
    const snapshotLoaded = state.loaded;
    const loaded = new Map(state.loaded);
    for (const message of snapshot) loaded.delete(message.id);
    folderPages.delete(folderKey(state.mailboxId, trash.id, state.search));
    set({ messages: [], selectedId: null, checked: new Set(), cursor: null, loaded });

    void send({ action: "empty-trash" }).then((ok) => {
      if (!ok) {
        set({
          messages: snapshot,
          cursor: snapshotCursor,
          selectedId: snapshotSelected,
          loaded: snapshotLoaded,
        });
        return;
      }
      void get().refreshFolders();
    });
  },

  undo: () => {
    const stack = [...get().undoStack];
    const entry = stack.pop();
    if (!entry) return false;

    set({ undoStack: stack });
    entry.revert();
    return true;
  },

  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),

  openFolder: (folderId) => {
    const current = get();
    if (!folderId || current.folderId === folderId) return;

    rememberFolder(current);
    const cached = folderPages.get(folderKey(current.mailboxId, folderId, current.search));
    const messages = applyOptimistic(cached?.messages ?? [], folderId);
    set({
      folderId,
      messages,
      cursor: cached?.cursor ?? null,
      selectedId: cached ? keepSelection(messages, cached.selectedId) : null,
      checked: new Set(),
      loading: !cached,
    });
    void get().fetchPage();
  },

  syncOpenFolder: async () => {
    const { mailboxId, folderId, folders } = get();
    const folder = folders.find((entry) => entry.id === folderId);
    if (!mailboxId || !folder || folder.role !== "custom") return;

    set({ syncing: true });
    try {
      await fetch(`/api/mailboxes/${mailboxId}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      await get().fetchPage();
      await get().refreshFolders();
    } finally {
      set({ syncing: false });
    }
  },

  setCreatingFolder: (creatingFolder) => set({ creatingFolder }),

  createFolder: async (name) => {
    const { mailboxId } = get();
    const response = await fetch(`/api/mailboxes/${mailboxId}/folders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json()) as { folder?: FolderSummary; error?: string };
    const folder = payload.folder;
    if (!response.ok || !folder) {
      throw new Error(payload.error ?? "Could not create the folder.");
    }
    set({
      folders: [...get().folders.filter((entry) => entry.id !== folder.id), folder],
      creatingFolder: false,
    });
    return folder;
  },

  renameFolder: async (folderId, name) => {
    const { mailboxId, folders } = get();
    const response = await fetch(`/api/mailboxes/${mailboxId}/folders/${folderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json()) as { folder?: FolderSummary; error?: string };
    if (!response.ok || !payload.folder) {
      throw new Error(payload.error ?? "Could not rename the folder.");
    }
    set({ folders: folders.map((f) => (f.id === folderId ? { ...f, name } : f)) });
  },

  deleteFolder: async (folderId) => {
    const { mailboxId, folders: currentFolders, folderId: currentFolderId } = get();
    const response = await fetch(`/api/mailboxes/${mailboxId}/folders/${folderId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not delete the folder.");
    }
    const nextFolders = currentFolders.filter((f) => f.id !== folderId);
    set({ folders: nextFolders });
    // If we deleted the active folder, navigate to inbox
    if (currentFolderId === folderId) {
      const inbox = nextFolders.find((f) => f.role === "inbox");
      if (inbox) navigateMailFolder(mailboxId, inbox.id);
    }
  },

  refreshFolders: async () => {
    const { mailboxId } = get();
    if (!mailboxId) return;

    const response = await fetch(`/api/mailboxes/${mailboxId}`);
    if (!response.ok) return;
    const payload = (await response.json()) as {
      mailbox?: { lastSyncedAt: number | null; syncError: string | null };
      folders: FolderSummary[];
    };
    set({
      folders: payload.folders,
      lastSyncedAt: payload.mailbox?.lastSyncedAt ?? get().lastSyncedAt,
      syncError: payload.mailbox?.syncError ?? get().syncError,
    });
  },

  /**
   * Drops rows from the current view immediately and pushes an inverse onto the undo
   * stack. The network call runs afterwards; a failure restores the rows in place.
   */
  removeLocally: (
    ids: string[],
    label: string,
    request: { action: "move" | "trash"; folderId?: string },
  ) => {
    const state = get();
    const removed = state.messages
      .map((message, index) => ({ message, index }))
      .filter((entry) => ids.includes(entry.message.id));
    if (removed.length === 0) return;

    const originFolder = state.folderId;
    hideLocally(ids, originFolder);
    const nextSelection = selectionAfterRemoval(state.messages, ids, state.selectedId);
    const messages = state.messages.filter((message) => !ids.includes(message.id));
    set({ messages, selectedId: nextSelection, checked: new Set() });
    rememberFolder({ ...get(), messages, selectedId: nextSelection });

    const restore = () => {
      showLocally(removed);
      set((current) => {
        if (current.folderId !== originFolder) {
          const key = folderKey(current.mailboxId, originFolder, current.search);
          const cached = folderPages.get(key);
          if (cached) {
            const nextMessages = applyOptimistic(reinsert(cached.messages, removed), originFolder);
            folderPages.set(key, {
              ...cached,
              messages: nextMessages,
              selectedId: removed[0]?.message.id ?? cached.selectedId,
            });
          }
          return current;
        }
        const nextMessages = applyOptimistic(reinsert(current.messages, removed), originFolder);
        const selectedId = removed[0]?.message.id ?? current.selectedId;
        rememberFolder({ ...current, messages: nextMessages, selectedId });
        return { messages: nextMessages, selectedId };
      });
    };

    const entry: UndoEntry = {
      label,
      ids,
      revert: () => {
        const ticket = claim(ids);
        restore();
        const original = removed[0]?.message.folderId;
        if (!original) return;
        void send({ ids, action: "move", folderId: original }).then((ok) => {
          if (!claimed(ids, ticket)) return;
          if (ok) return;
          hideLocally(ids, originFolder);
          set((current) => {
            if (current.folderId !== originFolder) return current;
            const nextMessages = current.messages.filter((message) => !ids.includes(message.id));
            const selectedId = selectionAfterRemoval(current.messages, ids, current.selectedId);
            rememberFolder({ ...current, messages: nextMessages, selectedId });
            return { messages: nextMessages, selectedId };
          });
        });
      },
    };
    set((current) => ({ undoStack: [...current.undoStack.slice(-9), entry] }));

    const ticket = claim(ids);
    void send({ ids, ...request }).then((ok) => {
      if (!claimed(ids, ticket)) return;
      if (ok) return;
      restore();
      set((current) => ({
        undoStack: current.undoStack.filter((candidate) => candidate !== entry),
      }));
    });
  },
}));

function claim(ids: string[]): number {
  const ticket = ++actionSeq;
  for (const id of ids) actionTicket.set(id, ticket);
  return ticket;
}

function claimed(ids: string[], ticket: number): boolean {
  return ids.every((id) => actionTicket.get(id) === ticket);
}

function hideLocally(ids: string[], folderId: string): void {
  for (const id of ids) {
    optimisticAbsent.set(id, folderId);
    pendingRestores.delete(id);
  }
}

function showLocally(removed: RemovedRow[]): void {
  for (const entry of removed) {
    optimisticAbsent.delete(entry.message.id);
    pendingRestores.set(entry.message.id, entry);
  }
}

function applyOptimistic(messages: MessageSummary[], folderId: string): MessageSummary[] {
  const seen = new Set<string>();
  const next: MessageSummary[] = [];
  for (const message of messages) {
    if (optimisticAbsent.get(message.id) === folderId || seen.has(message.id)) continue;
    seen.add(message.id);
    next.push(message);
  }
  const restores = [...pendingRestores.values()].filter(
    (row) => row.message.folderId === folderId && !seen.has(row.message.id),
  );
  return restores.length > 0 ? reinsert(next, restores) : next;
}

function reinsert(messages: MessageSummary[], removed: RemovedRow[]): MessageSummary[] {
  const restored = [...messages];
  const existing = new Set(messages.map((message) => message.id));
  for (const entry of [...removed].sort((a, b) => a.index - b.index)) {
    if (existing.has(entry.message.id)) continue;
    existing.add(entry.message.id);
    restored.splice(Math.min(entry.index, restored.length), 0, entry.message);
  }
  return restored;
}

/** Preserve an explicit empty cursor. Only fall back to the first row if a selection vanished. */
function keepSelection(messages: MessageSummary[], selectedId: string | null): string | null {
  if (!selectedId) return null;
  if (messages.some((message) => message.id === selectedId)) return selectedId;
  return messages[0]?.id ?? null;
}

/** Keeps the cursor on a neighbouring row instead of jumping to the top of the list. */
function selectionAfterRemoval(
  messages: MessageSummary[],
  removedIds: string[],
  selectedId: string | null,
): string | null {
  if (!selectedId || !removedIds.includes(selectedId)) return selectedId;

  const index = messages.findIndex((message) => message.id === selectedId);
  const remaining = messages.filter((message) => !removedIds.includes(message.id));
  if (remaining.length === 0) return null;

  const following = messages
    .slice(index + 1)
    .find((message) => !removedIds.includes(message.id));
  if (following) return following.id;

  return remaining[remaining.length - 1]?.id ?? null;
}

function patchLocal(
  set: (updater: (state: State) => Partial<State>) => void,
  ids: string[],
  patch: Partial<MessageSummary>,
): void {
  set((state) => {
    const messages = state.messages.map((message) =>
      ids.includes(message.id) ? { ...message, ...patch } : message,
    );
    const loaded = new Map(state.loaded);
    for (const id of ids) {
      const entry = loaded.get(id);
      if (!entry) continue;
      loaded.set(id, {
        ...entry,
        detail: { ...entry.detail, ...patch },
        thread: entry.thread.map((item) =>
          ids.includes(item.id) ? { ...item, ...patch } : item,
        ),
      });
    }
    if (state.mailboxId && state.folderId) {
      folderPages.set(folderKey(state.mailboxId, state.folderId, state.search), {
        messages,
        cursor: state.cursor,
        selectedId: state.selectedId,
      });
    }
    return { messages, loaded };
  });
}

async function send(body: {
  ids?: string[];
  action: MailAction;
  folderId?: string;
}): Promise<boolean> {
  const mailboxId = useMailStore.getState().mailboxId;
  try {
    const response = await fetch("/api/messages/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mailboxId, ...body }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Instant folder switch: restore the cached list, then refresh in the background. */
export function navigateMailFolder(mailboxId: string, folderId: string): void {
  if (!mailboxId || !folderId) return;
  useMailStore.getState().openFolder(folderId);
  const path = `/mail/${mailboxId}/${folderId}`;
  if (window.location.pathname !== path) {
    window.history.pushState(window.history.state, "", path);
  }
}

function withCacheLimit(
  cache: Map<string, LoadedMessage>,
  id: string,
  value: LoadedMessage,
): Map<string, LoadedMessage> {
  const next = new Map(cache);
  next.delete(id);
  next.set(id, value);
  while (next.size > BODY_CACHE_LIMIT) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

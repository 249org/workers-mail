"use client";

import { create } from "zustand";
import type { MessageDetail, MessageSummary } from "./queries";

export type MessageBody = { html: string; blockedImages: number; text: string };

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

export type MailAction = "read" | "unread" | "flag" | "unflag" | "move" | "trash";

type UndoEntry = {
  label: string;
  ids: string[];
  /** Restores the rows and replays the inverse server-side. */
  revert: () => Promise<void>;
};

const BODY_CACHE_LIMIT = 60;
/** Collapses concurrent loads of the same message into one request. */
const inFlight = new Map<string, Promise<void>>();
/** Load another page once the cursor comes within this many rows of the end. */
const PREFETCH_MARGIN = 5;

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
  undo: () => Promise<boolean>;

  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
  refreshFolders: () => Promise<void>;
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

  hydrate: (input) => {
    const current = get();
    // Server navigation to a different folder resets transient view state.
    const changedView =
      current.mailboxId !== input.mailboxId || current.folderId !== input.folderId;

    // A cached empty RSC payload must not wipe messages the live socket already loaded.
    const keepMessages =
      !changedView && current.messages.length > 0 && input.messages.length === 0;

    set({
      ...input,
      messages: keepMessages ? current.messages : input.messages,
      cursor: keepMessages ? current.cursor : input.cursor,
      checked: changedView ? new Set() : current.checked,
      loaded: changedView ? new Map() : current.loaded,
      selectedId: keepMessages
        ? current.selectedId
        : (input.selectedId ?? input.messages[0]?.id ?? null),
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
    const next = index === -1 ? 0 : Math.min(messages.length - 1, Math.max(0, index + direction));
    const target = messages[next];
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
    if (!mailboxId || (options.append && (loading || cursor === null))) return;

    set({ loading: true });
    const params = new URLSearchParams({ mailbox: mailboxId, folder: folderId });
    if (search.trim()) params.set("q", search.trim());
    if (options.append && cursor) params.set("before", String(cursor));

    try {
      const response = await fetch(`/api/messages?${params}`);
      if (!response.ok) return;
      const page = (await response.json()) as {
        items: MessageSummary[];
        nextCursor: number | null;
      };

      set((state) => {
        const messages = options.append ? [...state.messages, ...page.items] : page.items;
        const stillPresent = messages.some((message) => message.id === state.selectedId);
        return {
          messages,
          cursor: page.nextCursor,
          selectedId: stillPresent ? state.selectedId : (messages[0]?.id ?? null),
        };
      });
    } finally {
      set({ loading: false });
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

  undo: async () => {
    const stack = [...get().undoStack];
    const entry = stack.pop();
    if (!entry) return false;

    set({ undoStack: stack });
    await entry.revert();
    return true;
  },

  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),

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

    const restore = () =>
      set((current) => ({ messages: reinsert(current.messages, removed) }));

    const nextSelection = selectionAfterRemoval(state.messages, ids, state.selectedId);
    set({
      messages: state.messages.filter((message) => !ids.includes(message.id)),
      selectedId: nextSelection,
      checked: new Set(),
    });

    const entry: UndoEntry = {
      label,
      ids,
      revert: async () => {
        restore();
        const original = removed[0]?.message.folderId;
        if (original) await send({ ids, action: "move", folderId: original });
      },
    };
    set((current) => ({ undoStack: [...current.undoStack.slice(-9), entry] }));

    void send({ ids, ...request }).then((ok) => {
      if (!ok) {
        restore();
        set((current) => ({
          undoStack: current.undoStack.filter((candidate) => candidate !== entry),
        }));
      }
    });
  },
}));

type RemovedRow = { message: MessageSummary; index: number };

function reinsert(messages: MessageSummary[], removed: RemovedRow[]): MessageSummary[] {
  const restored = [...messages];
  for (const entry of [...removed].sort((a, b) => a.index - b.index)) {
    restored.splice(Math.min(entry.index, restored.length), 0, entry.message);
  }
  return restored;
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
  set((state) => ({
    messages: state.messages.map((message) =>
      ids.includes(message.id) ? { ...message, ...patch } : message,
    ),
  }));
}

async function send(body: {
  ids: string[];
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

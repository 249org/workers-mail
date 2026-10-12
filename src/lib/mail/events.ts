/** Wire protocol shared by the mailbox Durable Object and the browser client. */
export type MailboxEvent =
  | { type: "new"; messageId: string; folderId: string; subject: string; from: string }
  | { type: "moved"; messageId: string; folderId: string }
  | { type: "deleted"; messageId: string }
  | { type: "sent"; messageId: string }
  | { type: "sync"; state: "syncing" | "idle" | "error"; stored?: number; error?: string }
  | { type: "pong"; at: number };

export type ClientCommand = { type: "ping" } | { type: "sync" };

export type SyncStatus = {
  state: "idle" | "syncing" | "error";
  lastSyncedAt: number | null;
  lastError: string | null;
  connections: number;
  /** What the pass just did, when somebody waited for it. Absent otherwise. */
  stored?: number;
  reflagged?: number;
};

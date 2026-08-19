import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { describe, markSyncState, syncMailbox } from "@/lib/transport/imap";
import { describeImapError, isImapTimeout } from "@/lib/transport/imap-error";
import { createImapMailbox, pushImapChanges } from "@/lib/transport/imap-push";
import { listFolders } from "@/lib/mail/mailboxes";
import type { CreateFolderResult, RemoteMailChange, RemoteMailResult } from "@/lib/transport/imap-remote";
import type { MailboxEvent, SyncStatus } from "@/lib/mail/events";

/** Poll cadence while at least one client is watching the mailbox. */
const ACTIVE_POLL_MS = 4_000;
/** Cadence used to finish a backfill with nobody watching. */
const IDLE_POLL_MS = 5 * 60_000;
const SYNC_LOCK_MS = 90_000;

type State = {
  mailboxId: string | null;
  syncingUntil: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  lastState: SyncStatus["state"];
};

export class MailboxDurableObject extends DurableObject<CloudflareEnv> {
  private state: State = {
    mailboxId: null,
    syncingUntil: 0,
    lastSyncedAt: null,
    lastError: null,
    lastState: "idle",
  };
  private loaded = false;

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const mailboxId = url.searchParams.get("mailbox");
    if (!mailboxId) return new Response("mailbox is required", { status: 400 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    await this.rememberMailbox(mailboxId);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ mailboxId });

    server.send(JSON.stringify({ type: "sync", state: this.state.lastState } satisfies MailboxEvent));
    // Check for new mail as soon as someone is watching — do not wait for the next alarm.
    const lockExpired = this.state.syncingUntil < Date.now();
    const needsBackfill =
      !this.state.lastSyncedAt ||
      this.state.lastState === "error" ||
      (this.state.lastState === "syncing" && lockExpired);
    this.kickSync({ backfill: needsBackfill, inboxOnly: !needsBackfill });
    await this.scheduleNextPoll();

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;

    let command: { type?: string };
    try {
      command = JSON.parse(raw) as { type?: string };
    } catch {
      return;
    }

    if (command.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() } satisfies MailboxEvent));
      const last = this.state.lastSyncedAt ?? 0;
      const stale = Date.now() / 1000 - last > 8;
      if (stale && this.state.syncingUntil < Date.now()) {
        this.kickSync({ backfill: false, inboxOnly: true });
      }
      return;
    }
    if (command.type === "sync") {
      // IMAP does not belong on the WebSocket handler — a 30s ping already collides
      // with an in-flight fetch. Kick the pass and let the alarm / waitUntil finish it.
      this.kickSync({ backfill: false });
    }
  }

  override async webSocketClose(socket: WebSocket): Promise<void> {
    socket.close();
    await this.scheduleNextPoll();
  }

  override async webSocketError(): Promise<void> {
    await this.scheduleNextPoll();
  }

  override async alarm(): Promise<void> {
    await this.load();
    const watching = this.ctx.getWebSockets().length > 0;
    await this.runSync({ backfill: !watching, inboxOnly: watching });
    await this.scheduleNextPoll();
  }

  /** Called by the queue consumer once an inbound message has been indexed. */
  async notify(event: MailboxEvent): Promise<void> {
    this.broadcast(event);
  }

  async status(): Promise<SyncStatus> {
    await this.load();
    return {
      state: this.state.lastState,
      lastSyncedAt: this.state.lastSyncedAt,
      lastError: this.state.lastError,
      connections: this.ctx.getWebSockets().length,
    };
  }

  /** Entry point used by the cron poke and by manual refreshes from the UI. */
  async poke(
    options: { backfill?: boolean; mailboxId?: string; folderId?: string } = {},
  ): Promise<SyncStatus> {
    if (options.mailboxId) await this.rememberMailbox(options.mailboxId);
    else await this.load();
    if (options.folderId) {
      await this.runSync({
        backfill: options.backfill ?? true,
        folderId: options.folderId,
      });
      return this.status();
    }
    this.kickSync({ backfill: options.backfill ?? false });
    await this.scheduleNextPoll();
    return this.status();
  }

  async createRemoteFolder(input: { mailboxId: string; name: string }): Promise<CreateFolderResult> {
    await this.rememberMailbox(input.mailboxId);
    const db = createDb(this.env.DB);
    const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, input.mailboxId)).limit(1);
    const mailbox = rows[0];
    if (!mailbox || mailbox.type !== "external_imap") {
      return { ok: false, error: "This mailbox does not use IMAP folders." };
    }

    try {
      const folder = await createImapMailbox(mailbox, this.env, db, input.name);
      return {
        ok: true,
        folder: { id: folder.id, name: folder.name, role: "custom", unread: 0 },
      };
    } catch (error) {
      console.error("imap create folder failed", { mailboxId: input.mailboxId, error: describe(error) });
      return { ok: false, error: describe(error) };
    }
  }

  /**
   * Applies a local mutation on the IMAP server so Gmail, Roundcube, and other
   * clients see the same move, delete, or flag change.
   */
  async applyRemote(input: {
    mailboxId: string;
    refs: Array<{ id: string; folderId: string; remoteUid: number | null }>;
    change: RemoteMailChange;
  }): Promise<RemoteMailResult> {
    await this.rememberMailbox(input.mailboxId);
    const db = createDb(this.env.DB);
    const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, input.mailboxId)).limit(1);
    const mailbox = rows[0];
    if (!mailbox || mailbox.type !== "external_imap") return { ok: true, uids: [] };

    const folders = await listFolders(db, mailbox.id);
    const request = input.change;
    let change: Parameters<typeof pushImapChanges>[5];
    if (request.action === "move") {
      const destination = folders.find((folder) => folder.id === request.folderId);
      if (!destination) return { ok: false };
      change = { action: "move", destination };
    } else {
      change = request;
    }

    try {
      const uids = await pushImapChanges(mailbox, this.env, db, folders, input.refs, change);
      return { ok: true, uids: [...uids.entries()] };
    } catch (error) {
      console.error("imap apply failed", { mailboxId: input.mailboxId, error: describe(error) });
      return { ok: false };
    }
  }

  private async runSync(options: {
    backfill: boolean;
    inboxOnly?: boolean;
    folderId?: string;
  }): Promise<void> {
    await this.load();
    const mailboxId = this.state.mailboxId;
    if (!mailboxId) {
      console.warn("mailbox sync skipped: Durable Object has no mailboxId");
      return;
    }

    const now = Date.now();
    // A killed isolate can persist a lock far in the future; never skip new mail for that.
    if (this.state.syncingUntil > now + SYNC_LOCK_MS) this.state.syncingUntil = 0;
    if (options.folderId) {
      const deadline = now + 8_000;
      while (this.state.syncingUntil > Date.now() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await this.load();
      }
    } else if (this.state.syncingUntil > now) {
      return;
    }

    const db = createDb(this.env.DB);
    const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
    const mailbox = rows[0];
    if (!mailbox || mailbox.type !== "external_imap") return;

    this.state.syncingUntil = now + SYNC_LOCK_MS;
    this.state.lastState = "syncing";
    await this.persist();
    if (!options.inboxOnly && !options.folderId) {
      this.broadcast({ type: "sync", state: "syncing" });
      await markSyncState(db, mailboxId, "syncing");
    }

    try {
      const summary = await syncMailbox(
        { db, bucket: this.env.MAIL_BUCKET, env: this.env },
        mailbox,
        {
          backfill: options.backfill,
          inboxOnly: options.inboxOnly,
          folderId: options.folderId,
          maxFolders: options.inboxOnly ? 1 : 8,
        },
      );

      const timedOut = summary.errors.some((entry) => isImapTimeout(entry));
      const transient = Boolean(options.inboxOnly && timedOut);

      this.state.lastState = transient ? "idle" : summary.errors.length > 0 ? "error" : "idle";
      this.state.lastError = transient
        ? null
        : summary.errors[0]
          ? describeImapError(summary.errors[0])
          : null;
      this.state.lastSyncedAt = Math.floor(Date.now() / 1000);

      if (!options.inboxOnly && !options.folderId) {
        await db
          .update(mailboxes)
          .set({ backfillComplete: summary.backfillComplete })
          .where(eq(mailboxes.id, mailboxId));
      }
      if (!options.folderId) {
        if (transient) {
          await db
            .update(mailboxes)
            .set({ syncState: "idle", syncError: null })
            .where(eq(mailboxes.id, mailboxId));
        } else {
          await markSyncState(db, mailboxId, this.state.lastState, this.state.lastError ?? undefined);
        }
      }

      if (!options.inboxOnly || summary.stored > 0 || this.state.lastState === "error") {
        this.broadcast({
          type: "sync",
          state: this.state.lastState,
          stored: summary.stored,
          error: this.state.lastError ?? undefined,
        });
      } else if (transient) {
        this.broadcast({ type: "sync", state: "idle", stored: 0 });
      }
      console.info("mailbox sync finished", {
        mailboxId,
        stored: summary.stored,
        scanned: summary.scanned,
        folders: summary.folders,
        backfillComplete: summary.backfillComplete,
        errors: summary.errors,
      });
    } catch (error) {
      if (options.inboxOnly && isImapTimeout(error)) {
        this.state.lastState = "idle";
        this.state.lastError = null;
        await db
          .update(mailboxes)
          .set({ syncState: "idle", syncError: null })
          .where(eq(mailboxes.id, mailboxId));
        this.broadcast({ type: "sync", state: "idle", stored: 0 });
        console.warn("mailbox inbox poll timed out", { mailboxId, error: describe(error) });
      } else {
        this.state.lastState = "error";
        this.state.lastError = describeImapError(error);
        if (!options.folderId) {
          await markSyncState(db, mailboxId, "error", this.state.lastError);
        }
        this.broadcast({ type: "sync", state: "error", error: this.state.lastError });
      }
    } finally {
      this.state.syncingUntil = 0;
      await this.persist();
    }
  }

  /** Fire-and-forget so RPC / WebSocket handlers are not pinned to IMAP I/O. */
  private kickSync(options: { backfill: boolean; inboxOnly?: boolean; folderId?: string }): void {
    this.ctx.waitUntil(
      this.runSync(options).catch((error) => {
        console.error("mailbox sync failed", { error: describe(error) });
      }),
    );
  }

  private async rememberMailbox(mailboxId: string): Promise<void> {
    await this.load();
    if (this.state.mailboxId === mailboxId) return;
    this.state.mailboxId = mailboxId;
    await this.persist();
  }

  private async scheduleNextPoll(): Promise<void> {
    const watching = this.ctx.getWebSockets().length > 0;
    const existing = await this.ctx.storage.getAlarm();
    const now = Date.now();
    const target = now + (watching ? ACTIVE_POLL_MS : IDLE_POLL_MS);

    // Keep an earlier *future* alarm; a timestamp already in the past is dead and
    // must be replaced or the object never wakes again.
    if (existing !== null && existing > now && existing <= target) return;
    await this.ctx.storage.setAlarm(target);
  }

  private broadcast(event: MailboxEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // A socket that has already gone away is dropped by the runtime.
      }
    }
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get<State>("state");
    if (stored) {
      this.state = stored;
      // Older builds stored this as Date.now() milliseconds.
      if (this.state.lastSyncedAt && this.state.lastSyncedAt > 1_000_000_000_000) {
        this.state.lastSyncedAt = Math.floor(this.state.lastSyncedAt / 1000);
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("state", this.state);
  }
}

import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { describe, markSyncState, syncMailbox } from "@/lib/transport/imap";
import type { MailboxEvent, SyncStatus } from "@/lib/mail/events";

/** Poll cadence while at least one client is watching the mailbox. */
const ACTIVE_POLL_MS = 20_000;
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

    await this.load();
    if (!this.state.mailboxId) {
      this.state.mailboxId = mailboxId;
      await this.persist();
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ mailboxId });

    server.send(JSON.stringify({ type: "sync", state: this.state.lastState } satisfies MailboxEvent));
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
      return;
    }
    if (command.type === "sync") {
      await this.runSync({ backfill: false });
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
    await this.runSync({ backfill: this.ctx.getWebSockets().length === 0 });
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
  async poke(options: { backfill?: boolean } = {}): Promise<SyncStatus> {
    await this.load();
    await this.runSync({ backfill: options.backfill ?? false });
    await this.scheduleNextPoll();
    return this.status();
  }

  private async runSync(options: { backfill: boolean }): Promise<void> {
    await this.load();
    const mailboxId = this.state.mailboxId;
    if (!mailboxId) return;

    const now = Date.now();
    if (this.state.syncingUntil > now) return;

    const db = createDb(this.env.DB);
    const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
    const mailbox = rows[0];
    if (!mailbox || mailbox.type !== "external_imap") return;

    this.state.syncingUntil = now + SYNC_LOCK_MS;
    this.state.lastState = "syncing";
    await this.persist();
    this.broadcast({ type: "sync", state: "syncing" });
    await markSyncState(db, mailboxId, "syncing");

    try {
      const summary = await syncMailbox(
        { db, bucket: this.env.MAIL_BUCKET, encryptionKey: this.env.MAIL_ENCRYPTION_KEY },
        mailbox,
        { backfill: options.backfill, maxFolders: 6 },
      );

      this.state.lastState = summary.errors.length > 0 ? "error" : "idle";
      this.state.lastError = summary.errors[0] ?? null;
      this.state.lastSyncedAt = Date.now();

      await db
        .update(mailboxes)
        .set({ backfillComplete: summary.backfillComplete })
        .where(eq(mailboxes.id, mailboxId));
      await markSyncState(db, mailboxId, this.state.lastState, this.state.lastError ?? undefined);

      this.broadcast({ type: "sync", state: this.state.lastState, stored: summary.stored });
    } catch (error) {
      this.state.lastState = "error";
      this.state.lastError = describe(error);
      await markSyncState(db, mailboxId, "error", this.state.lastError);
      this.broadcast({ type: "sync", state: "error", error: this.state.lastError });
    } finally {
      this.state.syncingUntil = 0;
      await this.persist();
    }
  }

  private async scheduleNextPoll(): Promise<void> {
    const watching = this.ctx.getWebSockets().length > 0;
    const existing = await this.ctx.storage.getAlarm();
    const target = Date.now() + (watching ? ACTIVE_POLL_MS : IDLE_POLL_MS);

    // Keep an earlier alarm rather than pushing it out on every reconnect.
    if (existing !== null && existing <= target) return;
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
    if (stored) this.state = stored;
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("state", this.state);
  }
}

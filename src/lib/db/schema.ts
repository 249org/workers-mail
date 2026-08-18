import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  totpSecret: text("totp_secret"),
  totpEnabledAt: integer("totp_enabled_at"),
  recoveryCodes: text("recovery_codes", { mode: "json" }).$type<string[]>(),
  privacyPrefs: text("privacy_prefs", { mode: "json" }).$type<PrivacyPrefs>(),
  sessionTtlDays: integer("session_ttl_days").notNull().default(30),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export type PrivacyPrefs = {
  remoteImages: "ask" | "allow";
  collectContacts: boolean;
};

export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  zoneId: text("zone_id"),
  status: text("status", { enum: ["pending", "verified", "error"] })
    .notNull()
    .default("pending"),
  routingEnabled: integer("routing_enabled", { mode: "boolean" }).notNull().default(false),
  sendingEnabled: integer("sending_enabled", { mode: "boolean" }).notNull().default(false),
  dnsRecords: text("dns_records", { mode: "json" }).$type<DnsRecord[]>(),
  lastCheckedAt: integer("last_checked_at"),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [uniqueIndex("domains_name_idx").on(t.name)]);

export type DnsRecord = {
  type: "MX" | "TXT" | "CNAME";
  name: string;
  content: string;
  priority?: number;
  purpose: string;
  present: boolean;
};

export const mailboxes = sqliteTable("mailboxes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["native", "external_imap"] }).notNull(),
  address: text("address").notNull(),
  displayName: text("display_name"),
  domainId: text("domain_id").references(() => domains.id, { onDelete: "cascade" }),

  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  imapTls: text("imap_tls", { enum: ["implicit", "starttls"] }),
  imapUser: text("imap_user"),
  imapPassword: text("imap_password"),

  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpTls: text("smtp_tls", { enum: ["implicit", "starttls"] }),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),

  syncState: text("sync_state", { enum: ["idle", "syncing", "error"] })
    .notNull()
    .default("idle"),
  syncError: text("sync_error"),
  lastSyncedAt: integer("last_synced_at"),
  backfillComplete: integer("backfill_complete", { mode: "boolean" }).notNull().default(false),

  createdAt: integer("created_at").notNull().default(now),
}, (t) => [
  uniqueIndex("mailboxes_address_idx").on(t.address),
  index("mailboxes_owner_idx").on(t.ownerId),
]);

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role", { enum: ["inbox", "sent", "drafts", "trash", "archive", "custom"] })
    .notNull()
    .default("custom"),
  remotePath: text("remote_path"),
  uidValidity: integer("uid_validity"),
  lastUid: integer("last_uid"),
  oldestUid: integer("oldest_uid"),
  position: integer("position").notNull().default(100),
}, (t) => [
  uniqueIndex("folders_mailbox_name_idx").on(t.mailboxId, t.name),
  index("folders_mailbox_idx").on(t.mailboxId),
]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade" }),
  folderId: text("folder_id")
    .notNull()
    .references(() => folders.id, { onDelete: "cascade" }),
  messageId: text("message_id"),
  threadId: text("thread_id").notNull(),
  inReplyTo: text("in_reply_to"),
  subject: text("subject").notNull().default(""),
  fromName: text("from_name"),
  fromAddress: text("from_address").notNull().default(""),
  toAddresses: text("to_addresses", { mode: "json" }).$type<Addr[]>().notNull(),
  ccAddresses: text("cc_addresses", { mode: "json" }).$type<Addr[]>(),
  snippet: text("snippet").notNull().default(""),
  sentAt: integer("sent_at").notNull(),
  receivedAt: integer("received_at").notNull().default(now),
  seen: integer("seen", { mode: "boolean" }).notNull().default(false),
  flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
  draft: integer("draft", { mode: "boolean" }).notNull().default(false),
  hasAttachments: integer("has_attachments", { mode: "boolean" }).notNull().default(false),
  size: integer("size").notNull().default(0),
  rawKey: text("raw_key"),
  remoteUid: integer("remote_uid"),
}, (t) => [
  index("messages_folder_date_idx").on(t.folderId, t.sentAt),
  index("messages_mailbox_thread_idx").on(t.mailboxId, t.threadId),
  uniqueIndex("messages_dedupe_idx").on(t.mailboxId, t.folderId, t.messageId),
  index("messages_remote_uid_idx").on(t.folderId, t.remoteUid),
]);

export type Addr = { name?: string; address: string };

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  contentId: text("content_id"),
  inline: integer("inline", { mode: "boolean" }).notNull().default(false),
  r2Key: text("r2_key").notNull(),
}, (t) => [index("attachments_message_idx").on(t.messageId)]);

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  notes: text("notes"),
  lastSeenAt: integer("last_seen_at"),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [uniqueIndex("contacts_owner_email_idx").on(t.ownerId, t.email)]);

export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(),
  domainId: text("domain_id")
    .notNull()
    .references(() => domains.id, { onDelete: "cascade" }),
  matchType: text("match_type", { enum: ["address", "catch_all"] }).notNull(),
  matchValue: text("match_value"),
  action: text("action", { enum: ["mailbox", "forward", "drop"] }).notNull(),
  targetMailboxId: text("target_mailbox_id").references(() => mailboxes.id, {
    onDelete: "cascade",
  }),
  forwardTo: text("forward_to"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  position: integer("position").notNull().default(100),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [index("routing_rules_domain_idx").on(t.domainId)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash)]);

export const deliveryLog = sqliteTable("delivery_log", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade" }),
  messageId: text("message_id"),
  transport: text("transport", { enum: ["send_email", "smtp"] }).notNull(),
  recipient: text("recipient").notNull(),
  status: text("status", { enum: ["queued", "sent", "failed"] }).notNull(),
  detail: text("detail"),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [index("delivery_log_mailbox_idx").on(t.mailboxId, t.createdAt)]);

CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`content_id` text,
	`inline` integer DEFAULT false NOT NULL,
	`r2_key` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_message_idx` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`notes` text,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_owner_email_idx` ON `contacts` (`owner_id`,`email`);--> statement-breakpoint
CREATE TABLE `delivery_log` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`message_id` text,
	`transport` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `delivery_log_mailbox_idx` ON `delivery_log` (`mailbox_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `domains` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`zone_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`routing_enabled` integer DEFAULT false NOT NULL,
	`sending_enabled` integer DEFAULT false NOT NULL,
	`dns_records` text,
	`last_checked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_name_idx` ON `domains` (`name`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'custom' NOT NULL,
	`remote_path` text,
	`uid_validity` integer,
	`last_uid` integer,
	`oldest_uid` integer,
	`position` integer DEFAULT 100 NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_mailbox_name_idx` ON `folders` (`mailbox_id`,`name`);--> statement-breakpoint
CREATE INDEX `folders_mailbox_idx` ON `folders` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`type` text NOT NULL,
	`address` text NOT NULL,
	`display_name` text,
	`domain_id` text,
	`imap_host` text,
	`imap_port` integer,
	`imap_tls` text,
	`imap_user` text,
	`imap_password` text,
	`smtp_host` text,
	`smtp_port` integer,
	`smtp_tls` text,
	`smtp_user` text,
	`smtp_password` text,
	`sync_state` text DEFAULT 'idle' NOT NULL,
	`sync_error` text,
	`last_synced_at` integer,
	`backfill_complete` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailboxes_address_idx` ON `mailboxes` (`address`);--> statement-breakpoint
CREATE INDEX `mailboxes_owner_idx` ON `mailboxes` (`owner_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`message_id` text,
	`thread_id` text NOT NULL,
	`in_reply_to` text,
	`subject` text DEFAULT '' NOT NULL,
	`from_name` text,
	`from_address` text DEFAULT '' NOT NULL,
	`to_addresses` text NOT NULL,
	`cc_addresses` text,
	`snippet` text DEFAULT '' NOT NULL,
	`sent_at` integer NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`seen` integer DEFAULT false NOT NULL,
	`flagged` integer DEFAULT false NOT NULL,
	`draft` integer DEFAULT false NOT NULL,
	`has_attachments` integer DEFAULT false NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`raw_key` text,
	`remote_uid` integer,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_folder_date_idx` ON `messages` (`folder_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `messages_mailbox_thread_idx` ON `messages` (`mailbox_id`,`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_dedupe_idx` ON `messages` (`mailbox_id`,`folder_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `messages_remote_uid_idx` ON `messages` (`folder_id`,`remote_uid`);--> statement-breakpoint
CREATE TABLE `routing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`domain_id` text NOT NULL,
	`match_type` text NOT NULL,
	`match_value` text,
	`action` text NOT NULL,
	`target_mailbox_id` text,
	`forward_to` text,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 100 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routing_rules_domain_idx` ON `routing_rules` (`domain_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);
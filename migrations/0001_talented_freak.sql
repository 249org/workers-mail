ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `recovery_codes` text;--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_prefs` text;--> statement-breakpoint
ALTER TABLE `users` ADD `session_ttl_days` integer DEFAULT 30 NOT NULL;
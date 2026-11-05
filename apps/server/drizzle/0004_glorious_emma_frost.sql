CREATE TABLE `tracker_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_user_id` text NOT NULL,
	`username` text,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`token_type` text DEFAULT 'Bearer' NOT NULL,
	`scope` text,
	`expires_at` text,
	`read_only` integer DEFAULT false NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracker_accounts_provider_idx` ON `tracker_accounts` (`provider`);--> statement-breakpoint
CREATE TABLE `tracker_oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`state` text NOT NULL,
	`code_verifier_enc` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracker_oauth_states_state_idx` ON `tracker_oauth_states` (`state`);--> statement-breakpoint
ALTER TABLE `tracking` ADD `last_pushed_at` text;--> statement-breakpoint
ALTER TABLE `tracking` ADD `last_pulled_at` text;--> statement-breakpoint
ALTER TABLE `tracking` ADD `remote_updated_at` text;--> statement-breakpoint
ALTER TABLE `tracking` ADD `sync_state` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracking` ADD `sync_error` text;--> statement-breakpoint
ALTER TABLE `tracking` ADD `local_dirty` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracking` ADD `conflict` text;--> statement-breakpoint
ALTER TABLE `tracking` ADD `updated_at` text DEFAULT (current_timestamp) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tracking_manga_provider_idx` ON `tracking` (`manga_id`,`tracker_type`);
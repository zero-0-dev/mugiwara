CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`actor` text,
	`ip` text,
	`details` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`device_label` text NOT NULL,
	`is_admin` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_idx` ON `auth_tokens` (`token_hash`);
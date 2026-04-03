CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY DEFAULT 'lower(hex(randomblob(16)))' NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`title` text,
	`pages_count` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`import_status` text DEFAULT 'pending',
	`import_progress` integer DEFAULT 0,
	`published_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_chapter_idx` ON `chapters` (`manga_id`,`chapter_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_image` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_tasks` (
	`id` text PRIMARY KEY DEFAULT 'lower(hex(randomblob(16)))' NOT NULL,
	`type` text DEFAULT 'chapter' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0,
	`manga_id` text,
	`chapter_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source_id` text NOT NULL,
	`source_chapter_id` text,
	`total_pages` integer,
	`completed_pages` integer DEFAULT 0,
	`progress_percent` integer DEFAULT 0,
	`error_message` text,
	`retry_count` integer DEFAULT 0,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `installed_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`is_builtin` integer DEFAULT false,
	`is_enabled` integer DEFAULT true,
	`config` text DEFAULT '{}' NOT NULL,
	`installed_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manga` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`alt_titles` text,
	`description` text,
	`author` text,
	`artist` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`media_type` text DEFAULT 'unknown' NOT NULL,
	`cover_image` text,
	`banner_image` text,
	`source_id` text NOT NULL,
	`source_manga_id` text,
	`storage_backend_id` text,
	`anilist_id` integer,
	`genres` text,
	`tags` text,
	`last_metadata_sync` text,
	`last_source_check` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`storage_backend_id`) REFERENCES `storage_backends`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `manga_categories` (
	`manga_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`manga_id`, `category_id`),
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `manga_collections` (
	`manga_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`added_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`manga_id`, `collection_id`),
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text,
	`page_number` integer DEFAULT 1 NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`percent_complete` real DEFAULT 0 NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`last_read_at` text DEFAULT (current_timestamp) NOT NULL,
	`device_id` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_backends` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`is_default` integer DEFAULT false,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracking` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`tracker_type` text NOT NULL,
	`tracker_manga_id` text NOT NULL,
	`status` text DEFAULT 'plan_to_read' NOT NULL,
	`score` integer,
	`chapters_read` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`finished_at` text,
	`last_synced_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- =====================
-- Default Data
-- =====================

-- Insert default storage backend
INSERT INTO `storage_backends` (`id`, `name`, `type`, `config`, `is_default`, `created_at`)
VALUES ('local-default', 'Local Storage', 'local', '{"basePath": "./data/manga"}', 1, CURRENT_TIMESTAMP);
--> statement-breakpoint

-- Insert default categories
INSERT INTO `categories` (`id`, `name`, `color`, `sort_order`) VALUES
  (lower(hex(randomblob(16))), 'Reading', '#22c55e', 0),
  (lower(hex(randomblob(16))), 'Completed', '#3b82f6', 1),
  (lower(hex(randomblob(16))), 'On Hold', '#f59e0b', 2),
  (lower(hex(randomblob(16))), 'Dropped', '#ef4444', 3),
  (lower(hex(randomblob(16))), 'Plan to Read', '#6b7280', 4);
--> statement-breakpoint

-- Insert default settings
INSERT INTO `settings` (`key`, `value`) VALUES
  ('reading.defaultMode', 'rtl'),
  ('reading.mangaMode', 'rtl'),
  ('reading.manhwaMode', 'vertical'),
  ('reading.manhuaMode', 'vertical'),
  ('reading.webtoonMode', 'vertical'),
  ('ui.theme', 'dark'),
  ('library.autoScan', 'false');

CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_number` real,
	`title` text,
	`pages_count` integer DEFAULT 0 NOT NULL,
	`file_path` text NOT NULL,
	`archive_type` text DEFAULT 'folder' NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_image` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
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
	`anilist_id` integer,
	`genres` text,
	`tags` text,
	`last_metadata_sync` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
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
	`added_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
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
	`last_read_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`device_id` text,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);

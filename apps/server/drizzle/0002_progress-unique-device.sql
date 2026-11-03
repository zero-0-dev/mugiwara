PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text,
	`page_number` integer DEFAULT 1 NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`last_read_at` text DEFAULT (current_timestamp) NOT NULL,
	`device_id` text DEFAULT 'default' NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Keep only the most recent row for each (manga, chapter, device) key before
-- the unique index is created. Rows written by older clients have a NULL
-- device id; they are normalized to the "default" device.
INSERT INTO `__new_reading_progress`("id", "manga_id", "chapter_id", "page_number", "total_pages", "last_read_at", "device_id")
SELECT "id", "manga_id", "chapter_id", "page_number", "total_pages", "last_read_at", "device_id"
FROM (
	SELECT
		"id", "manga_id", "chapter_id", "page_number", "total_pages", "last_read_at",
		COALESCE(NULLIF("device_id", ''), 'default') AS "device_id",
		ROW_NUMBER() OVER (
			PARTITION BY "manga_id", "chapter_id", COALESCE(NULLIF("device_id", ''), 'default')
			ORDER BY "last_read_at" DESC, "rowid" DESC
		) AS "rn"
	FROM `reading_progress`
)
WHERE "rn" = 1;--> statement-breakpoint
DROP TABLE `reading_progress`;--> statement-breakpoint
ALTER TABLE `__new_reading_progress` RENAME TO `reading_progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_reading_progress_idx` ON `reading_progress` (`manga_id`,`chapter_id`,`device_id`);
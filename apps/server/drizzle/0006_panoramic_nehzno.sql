ALTER TABLE `chapters` ADD `source_pages_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Before this migration the source page count was written to pages_count at
-- chapter creation, so chapters that were never downloaded still looked
-- downloaded. Keep that value as the source count and reset the stored count
-- for every chapter that is not confirmed complete.
UPDATE `chapters` SET `source_pages_count` = `pages_count`;--> statement-breakpoint
UPDATE `chapters` SET `pages_count` = 0 WHERE `import_status` IS NOT 'complete';

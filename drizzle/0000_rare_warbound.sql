CREATE TABLE `scan_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`source` text NOT NULL,
	`search_query` text NOT NULL,
	`source_type` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_metadata` text NOT NULL,
	`providers` text NOT NULL,
	`matches` text NOT NULL,
	`notice` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `scan_jobs_owner_created_idx` ON `scan_jobs` (`owner_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `scan_jobs_status_idx` ON `scan_jobs` (`status`);
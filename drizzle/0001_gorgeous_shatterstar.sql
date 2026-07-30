CREATE TABLE `scan_reviews` (
	`scan_id` text NOT NULL,
	`owner_key` text NOT NULL,
	`match_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scan_id`, `owner_key`, `match_id`)
);
--> statement-breakpoint
CREATE INDEX `scan_reviews_owner_scan_idx` ON `scan_reviews` (`owner_key`,`scan_id`);
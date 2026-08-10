CREATE TABLE `nudges` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`occurrence_id` text NOT NULL,
	`from_member_id` text,
	`to_member_id` text,
	`sent_on` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occurrence_id`) REFERENCES `occurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `nudges_occurrence_idx` ON `nudges` (`occurrence_id`,`sent_on`);--> statement-breakpoint
ALTER TABLE `chores` ADD `notes` text;
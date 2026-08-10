CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`household_id` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_member_idx` ON `push_subscriptions` (`member_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `reminders_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `reminder_hour` integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `last_reminded_on` text;
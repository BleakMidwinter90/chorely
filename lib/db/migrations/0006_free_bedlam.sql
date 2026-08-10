CREATE TABLE `expense_shares` (
	`expense_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `member_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expense_shares_member_idx` ON `expense_shares` (`member_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`paid_by_id` text NOT NULL,
	`settled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paid_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expenses_household_idx` ON `expenses` (`household_id`,`settled_at`);--> statement-breakpoint
ALTER TABLE `households` ADD `currency` text DEFAULT 'GBP' NOT NULL;
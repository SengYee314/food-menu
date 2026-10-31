ALTER TABLE `orders` ADD `session_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `stall_settings` ADD `session_id` integer DEFAULT 1 NOT NULL;
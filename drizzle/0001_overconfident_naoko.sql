PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	CONSTRAINT "order_rate_limit_4" CHECK("__new_order_rate_limits"."attempts" <= 4)
);
--> statement-breakpoint
INSERT INTO `__new_order_rate_limits`("key", "attempts") SELECT "key", "attempts" FROM `order_rate_limits`;--> statement-breakpoint
DROP TABLE `order_rate_limits`;--> statement-breakpoint
ALTER TABLE `__new_order_rate_limits` RENAME TO `order_rate_limits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
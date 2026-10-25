CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`image` text NOT NULL,
	`price` integer NOT NULL,
	`opening_stock` integer NOT NULL,
	`remaining` integer NOT NULL,
	`available` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`menu_item_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`preparing_at` text,
	`ready_at` text,
	`collected_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_token_unique` ON `orders` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `stall_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `order_insert_guard` BEFORE INSERT ON `orders`
BEGIN
  SELECT CASE WHEN (SELECT `paused` FROM `stall_settings` WHERE `id` = 1) = 1
    THEN RAISE(ABORT, 'ORDERS_PAUSED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `order_line_reserve` BEFORE INSERT ON `order_lines`
BEGIN
  SELECT CASE WHEN NEW.`quantity` < 1 OR NEW.`quantity` > 20
    THEN RAISE(ABORT, 'INVALID_QUANTITY') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `menu_items`
    WHERE `id` = NEW.`menu_item_id`
      AND `available` = 1
      AND `remaining` >= NEW.`quantity`
      AND `price` = NEW.`price`
  ) THEN RAISE(ABORT, 'OUT_OF_STOCK') END;
  UPDATE `menu_items`
  SET `remaining` = `remaining` - NEW.`quantity`
  WHERE `id` = NEW.`menu_item_id`;
END;

ALTER TABLE `orders` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `edit_nonce` text;
--> statement-breakpoint
CREATE TRIGGER `order_line_release` AFTER DELETE ON `order_lines`
BEGIN
  UPDATE `menu_items`
  SET `remaining` = `remaining` + OLD.`quantity`
  WHERE `id` = OLD.`menu_item_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `order_line_revise` BEFORE UPDATE ON `order_lines`
BEGIN
  SELECT CASE WHEN NEW.`menu_item_id` != OLD.`menu_item_id` OR NEW.`price` != OLD.`price`
    THEN RAISE(ABORT, 'IMMUTABLE_ORDER_LINE') END;
  SELECT CASE WHEN NEW.`quantity` < 1 OR NEW.`quantity` > 20
    THEN RAISE(ABORT, 'INVALID_QUANTITY') END;
  SELECT CASE WHEN NEW.`quantity` > OLD.`quantity` AND NOT EXISTS (
    SELECT 1 FROM `menu_items`
    WHERE `id` = OLD.`menu_item_id`
      AND `available` = 1
      AND `remaining` >= NEW.`quantity` - OLD.`quantity`
  ) THEN RAISE(ABORT, 'OUT_OF_STOCK') END;
  UPDATE `menu_items`
  SET `remaining` = `remaining` + OLD.`quantity` - NEW.`quantity`
  WHERE `id` = OLD.`menu_item_id`;
END;

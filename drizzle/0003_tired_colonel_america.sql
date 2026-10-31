ALTER TABLE `order_lines` ADD `reserved_quantity` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `order_lines` SET `reserved_quantity` = `quantity`;
--> statement-breakpoint
DROP TRIGGER `order_line_reserve`;
--> statement-breakpoint
DROP TRIGGER `order_line_release`;
--> statement-breakpoint
DROP TRIGGER `order_line_revise`;
--> statement-breakpoint
CREATE TRIGGER `order_line_reserve` BEFORE INSERT ON `order_lines`
BEGIN
  SELECT CASE WHEN NEW.`quantity` < 1 OR NEW.`quantity` > 20
    OR NEW.`reserved_quantity` != NEW.`quantity`
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
--> statement-breakpoint
CREATE TRIGGER `order_line_release` AFTER DELETE ON `order_lines`
BEGIN
  UPDATE `menu_items`
  SET `remaining` = `remaining` + OLD.`reserved_quantity`
  WHERE `id` = OLD.`menu_item_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `order_line_revise` BEFORE UPDATE ON `order_lines`
BEGIN
  SELECT CASE WHEN NEW.`menu_item_id` != OLD.`menu_item_id` OR NEW.`price` != OLD.`price`
    THEN RAISE(ABORT, 'IMMUTABLE_ORDER_LINE') END;
  SELECT CASE WHEN NEW.`quantity` < 1 OR NEW.`quantity` > 20
    OR NEW.`reserved_quantity` < 0 OR NEW.`reserved_quantity` > NEW.`quantity`
    THEN RAISE(ABORT, 'INVALID_QUANTITY') END;
  SELECT CASE WHEN
    (NEW.`quantity` > OLD.`quantity` AND NEW.`reserved_quantity` != OLD.`reserved_quantity` + NEW.`quantity` - OLD.`quantity`)
    OR (NEW.`quantity` < OLD.`quantity` AND NEW.`reserved_quantity` != MAX(0, OLD.`reserved_quantity` - (OLD.`quantity` - NEW.`quantity`)))
    OR (NEW.`quantity` = OLD.`quantity` AND NEW.`reserved_quantity` != OLD.`reserved_quantity` AND NEW.`reserved_quantity` != 0)
    THEN RAISE(ABORT, 'INVALID_RESERVATION') END;
  SELECT CASE WHEN NEW.`reserved_quantity` > OLD.`reserved_quantity` AND NOT EXISTS (
    SELECT 1 FROM `menu_items`
    WHERE `id` = OLD.`menu_item_id`
      AND `available` = 1
      AND `remaining` >= NEW.`reserved_quantity` - OLD.`reserved_quantity`
  ) THEN RAISE(ABORT, 'OUT_OF_STOCK') END;
  UPDATE `menu_items`
  SET `remaining` = `remaining` + OLD.`reserved_quantity` - NEW.`reserved_quantity`
  WHERE `id` = OLD.`menu_item_id`;
END;

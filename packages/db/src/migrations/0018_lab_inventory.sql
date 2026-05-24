-- 0018_lab_inventory.sql
-- Lab consumables replenishment module. Adds 5 new tables for item master
-- extension, per-lot inventory, stock movement audit, test->consumable map,
-- and order backorders.

CREATE TABLE `lab_consumables` (
  `id` text PRIMARY KEY NOT NULL,
  `lab_group_id` text,
  `item_code` text NOT NULL,
  `description` text NOT NULL,
  `category` text NOT NULL,
  `manufacturer` text,
  `manufacturer_catalog` text,
  `storage_temp_min_c` real,
  `storage_temp_max_c` real,
  `storage_instructions` text,
  `hazard_class` text NOT NULL DEFAULT 'NONE',
  `usage_uom` text NOT NULL DEFAULT 'each',
  `units_per_case` integer,
  `min_threshold` integer,
  `max_threshold` integer,
  `reorder_point` integer,
  `reorder_quantity` integer,
  `requires_lot_tracking` integer NOT NULL DEFAULT 1,
  `preferred_vendor_id` text,
  `default_unit_price_usd` real,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `lab_consumables_uq` ON `lab_consumables` (`lab_group_id`, `item_code`);
CREATE INDEX `lab_consumables_category_idx` ON `lab_consumables` (`category`);

CREATE TABLE `lab_inventory_lots` (
  `id` text PRIMARY KEY NOT NULL,
  `consumable_id` text NOT NULL,
  `site_id` text NOT NULL,
  `lot_number` text NOT NULL,
  `serial_number` text,
  `expiration_date` text,
  `quantity_on_hand` integer NOT NULL DEFAULT 0,
  `quantity_reserved` integer NOT NULL DEFAULT 0,
  `unit_price_usd` real,
  `received_at` text,
  `received_from_order_id` text,
  `received_from_grn_id` text,
  `status` text NOT NULL DEFAULT 'ACTIVE',
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `lab_lots_uq` ON `lab_inventory_lots` (`consumable_id`, `site_id`, `lot_number`);
CREATE INDEX `lab_lots_expiration_idx` ON `lab_inventory_lots` (`expiration_date`);
CREATE INDEX `lab_lots_status_idx` ON `lab_inventory_lots` (`status`);
CREATE INDEX `lab_lots_site_idx` ON `lab_inventory_lots` (`site_id`);

CREATE TABLE `lab_stock_movements` (
  `id` text PRIMARY KEY NOT NULL,
  `lot_id` text NOT NULL,
  `consumable_id` text NOT NULL,
  `site_id` text NOT NULL,
  `movement_type` text NOT NULL,
  `quantity` integer NOT NULL,
  `quantity_after` integer NOT NULL,
  `related_order_id` text,
  `related_lab_order_id` text,
  `related_transfer_id` text,
  `reason` text,
  `performed_by_user_id` text,
  `occurred_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lab_movements_lot_idx` ON `lab_stock_movements` (`lot_id`);
CREATE INDEX `lab_movements_site_idx` ON `lab_stock_movements` (`site_id`);
CREATE INDEX `lab_movements_consumable_idx` ON `lab_stock_movements` (`consumable_id`);
CREATE INDEX `lab_movements_type_idx` ON `lab_stock_movements` (`movement_type`);
CREATE INDEX `lab_movements_occurred_idx` ON `lab_stock_movements` (`occurred_at`);

CREATE TABLE `lab_test_consumables` (
  `id` text PRIMARY KEY NOT NULL,
  `lab_group_id` text,
  `test_code` text NOT NULL,
  `test_description` text,
  `consumable_id` text NOT NULL,
  `quantity_per_test` real NOT NULL,
  `is_critical` integer NOT NULL DEFAULT 0,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `lab_test_cons_uq` ON `lab_test_consumables` (`lab_group_id`, `test_code`, `consumable_id`);
CREATE INDEX `lab_test_cons_test_idx` ON `lab_test_consumables` (`test_code`);
CREATE INDEX `lab_test_cons_cons_idx` ON `lab_test_consumables` (`consumable_id`);

CREATE TABLE `order_backorders` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `original_order_item_id` text,
  `hcpc_code` text,
  `item_code` text,
  `description` text,
  `quantity_ordered` integer NOT NULL,
  `quantity_received` integer NOT NULL DEFAULT 0,
  `quantity_remaining` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'OPEN',
  `expected_fulfillment_date` text,
  `vendor_reference` text,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `order_backorders_order_idx` ON `order_backorders` (`order_id`);
CREATE INDEX `order_backorders_status_idx` ON `order_backorders` (`status`);
CREATE INDEX `order_backorders_expected_idx` ON `order_backorders` (`expected_fulfillment_date`);

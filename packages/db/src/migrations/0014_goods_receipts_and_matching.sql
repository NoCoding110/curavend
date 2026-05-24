-- 0014_goods_receipts_and_matching.sql
-- Goods Receipt Notes (GRN) + 3-way matching results.

CREATE TABLE `goods_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `receipt_number` text NOT NULL,
  `order_id` text,
  `purchase_order_id` text,
  `hospital_id` text NOT NULL,
  `vendor_id` text,
  `facility_id` text,
  `received_at` text NOT NULL,
  `received_by_user_id` text NOT NULL,
  `carrier` text,
  `tracking_number` text,
  `packing_slip_number` text,
  `status` text NOT NULL DEFAULT 'DRAFT',
  `notes` text,
  `photo_blob_keys` text,
  `posted_at` text,
  `posted_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `goods_receipts_order_idx` ON `goods_receipts` (`order_id`);
CREATE INDEX `goods_receipts_po_idx` ON `goods_receipts` (`purchase_order_id`);
CREATE INDEX `goods_receipts_hospital_idx` ON `goods_receipts` (`hospital_id`);
CREATE INDEX `goods_receipts_vendor_idx` ON `goods_receipts` (`vendor_id`);
CREATE INDEX `goods_receipts_status_idx` ON `goods_receipts` (`status`);

CREATE TABLE `goods_receipt_lines` (
  `id` text PRIMARY KEY NOT NULL,
  `receipt_id` text NOT NULL,
  `order_item_id` text,
  `hcpc_code` text NOT NULL,
  `description` text,
  `quantity_ordered` integer,
  `quantity_received` integer NOT NULL,
  `quantity_rejected` integer NOT NULL DEFAULT 0,
  `condition` text NOT NULL DEFAULT 'GOOD',
  `lot_number` text,
  `serial_number` text,
  `expiration_date` text,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `goods_receipt_lines_receipt_idx` ON `goods_receipt_lines` (`receipt_id`);
CREATE INDEX `goods_receipt_lines_hcpc_idx` ON `goods_receipt_lines` (`hcpc_code`);

CREATE TABLE `three_way_matches` (
  `id` text PRIMARY KEY NOT NULL,
  `invoice_id` text NOT NULL,
  `invoice_item_id` text NOT NULL,
  `order_id` text,
  `purchase_order_id` text,
  `order_item_id` text,
  `receipt_line_id` text,
  `hcpc_code` text NOT NULL,
  `match_status` text NOT NULL,
  `po_quantity` integer,
  `po_unit_price_usd` real,
  `received_quantity` integer,
  `received_condition` text,
  `invoice_quantity` integer,
  `invoice_unit_price_usd` real,
  `qty_variance` real,
  `price_variance` real,
  `price_variance_pct` real,
  `notes` text,
  `resolved_at` text,
  `resolved_by_user_id` text,
  `resolution` text,
  `computed_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `three_way_matches_invoice_idx` ON `three_way_matches` (`invoice_id`);
CREATE INDEX `three_way_matches_status_idx` ON `three_way_matches` (`match_status`);
CREATE INDEX `three_way_matches_hcpc_idx` ON `three_way_matches` (`hcpc_code`);

-- 0013_orders_requisition_link.sql
-- Add requisition_id link on orders so converted requisitions trace back to
-- their source. Plus an index for "orders for this requisition" lookups.

ALTER TABLE `orders` ADD COLUMN `requisition_id` text;
CREATE INDEX `orders_requisition_idx` ON `orders` (`requisition_id`);

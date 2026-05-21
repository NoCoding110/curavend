-- 0018_procurement_backfill.rollback.sql
--
-- Defensive rollback for migration 0018. Inverse operations in dependency
-- order:
--   1. Drop the 9 new tables
--   2. Drop columns added to orders, vendor_item_skus, invoices,
--      invoice_items, hospitals, vendors
--   3. (Manual step) Restore any cents-column data to legacy fields if
--      apps relied on those — n/a, both columns are populated in parallel
--
-- D1 / SQLite ≥ 3.35 supports ALTER TABLE … DROP COLUMN, so column removal
-- is in-place. Drop new tables first because they may FK-reference each
-- other (informationally — D1 doesn't enforce FKs).
--
-- USAGE:
--   wrangler d1 execute curavend --remote \
--     --file=../db/migrations/0018_procurement_backfill.rollback.sql
--
-- WARNING: This is destructive. All rows in the 9 new tables are deleted.
-- Run only as a last resort.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Drop new tables
-- ═══════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS unsubscribes;
DROP TABLE IF EXISTS notification_delivery_log;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS integration_log;
DROP TABLE IF EXISTS sku_groups;
DROP TABLE IF EXISTS order_contacts;
DROP TABLE IF EXISTS order_shipments;
DROP TABLE IF EXISTS order_recurrence_plans;
DROP TABLE IF EXISTS customer_purchase_orders;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Drop columns from orders
-- ═══════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS orders_recurrence_plan_idx;
DROP INDEX IF EXISTS orders_customer_po_idx;

ALTER TABLE orders DROP COLUMN tax_jurisdiction_code;
ALTER TABLE orders DROP COLUMN tax_exempt_certificate_id;
ALTER TABLE orders DROP COLUMN tax_exempt;
ALTER TABLE orders DROP COLUMN recurrence_index;
ALTER TABLE orders DROP COLUMN recurrence_plan_id;
ALTER TABLE orders DROP COLUMN customer_purchase_order_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Drop columns from vendor_item_skus
-- ═══════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS vendor_item_skus_group_idx;

ALTER TABLE vendor_item_skus DROP COLUMN hazmat;
ALTER TABLE vendor_item_skus DROP COLUMN dimensions_cm;
ALTER TABLE vendor_item_skus DROP COLUMN weight_grams;
ALTER TABLE vendor_item_skus DROP COLUMN hs_code;
ALTER TABLE vendor_item_skus DROP COLUMN tax_code;
ALTER TABLE vendor_item_skus DROP COLUMN video_url;
ALTER TABLE vendor_item_skus DROP COLUMN msds_url;
ALTER TABLE vendor_item_skus DROP COLUMN ifu_url;
ALTER TABLE vendor_item_skus DROP COLUMN datasheet_url;
ALTER TABLE vendor_item_skus DROP COLUMN image_url;
ALTER TABLE vendor_item_skus DROP COLUMN long_description;
ALTER TABLE vendor_item_skus DROP COLUMN tagline;
ALTER TABLE vendor_item_skus DROP COLUMN pack_multiple;
ALTER TABLE vendor_item_skus DROP COLUMN maximum_order_quantity;
ALTER TABLE vendor_item_skus DROP COLUMN minimum_order_quantity;
ALTER TABLE vendor_item_skus DROP COLUMN variant_attributes;
ALTER TABLE vendor_item_skus DROP COLUMN group_id;
ALTER TABLE vendor_item_skus DROP COLUMN currency_code;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Drop columns from invoices
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE invoices DROP COLUMN stripe_checkout_session_id;
ALTER TABLE invoices DROP COLUMN stripe_charge_id;
ALTER TABLE invoices DROP COLUMN stripe_payment_intent_id;
ALTER TABLE invoices DROP COLUMN tax_engine_calculation_id;
ALTER TABLE invoices DROP COLUMN tax_engine_provider;
ALTER TABLE invoices DROP COLUMN tax_engine_calculated_at;
ALTER TABLE invoices DROP COLUMN fx_rate;
ALTER TABLE invoices DROP COLUMN currency_code;
ALTER TABLE invoices DROP COLUMN grand_total_cents;
ALTER TABLE invoices DROP COLUMN shipping_cents;
ALTER TABLE invoices DROP COLUMN discount_total_cents;
ALTER TABLE invoices DROP COLUMN tax_total_cents;
ALTER TABLE invoices DROP COLUMN subtotal_cents;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Drop columns from invoice_items
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE invoice_items DROP COLUMN line_total_cents;
ALTER TABLE invoice_items DROP COLUMN tax_exempt_reason;
ALTER TABLE invoice_items DROP COLUMN tax_exempt;
ALTER TABLE invoice_items DROP COLUMN tax_jurisdiction_code;
ALTER TABLE invoice_items DROP COLUMN tax_code;
ALTER TABLE invoice_items DROP COLUMN tax_amount_cents;
ALTER TABLE invoice_items DROP COLUMN tax_rate;
ALTER TABLE invoice_items DROP COLUMN discount_cents;
ALTER TABLE invoice_items DROP COLUMN line_subtotal_cents;
ALTER TABLE invoice_items DROP COLUMN unit_price_cents;
ALTER TABLE invoice_items DROP COLUMN quantity_requested;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Drop columns from hospitals
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE hospitals DROP COLUMN preferred_currency_code;
ALTER TABLE hospitals DROP COLUMN tax_exempt_certificate_url;
ALTER TABLE hospitals DROP COLUMN tax_exempt;
ALTER TABLE hospitals DROP COLUMN default_tax_jurisdiction_code;
ALTER TABLE hospitals DROP COLUMN order_number_prefix;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Drop columns from vendors
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE vendors DROP COLUMN tracking_url_template;
ALTER TABLE vendors DROP COLUMN default_carrier_code;
ALTER TABLE vendors DROP COLUMN default_ship_from_address;

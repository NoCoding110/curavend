-- 0012_vendor_item_skus.sql
-- Phase C: HCPC ↔ vendor SKU unit conversion catalog.
--
-- Each vendor publishes which SKUs they sell for each HCPC code, plus the
-- pack/case math (units_per_pack, packs_per_case). The routing engine uses
-- this to (a) hard-filter to vendors who actually carry a SKU for the
-- requested HCPC and (b) compute the right pack quantity to order.

-- --------------------------------------------------------------------------
-- 1. vendor_item_skus
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_item_skus (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  hcpc_code TEXT NOT NULL,
  vendor_sku TEXT NOT NULL,
  description TEXT,
  manufacturer_name TEXT,
  manufacturer_item_number TEXT,
  units_per_pack INTEGER NOT NULL DEFAULT 1,
  packs_per_case INTEGER NOT NULL DEFAULT 1,
  unit_of_measurement TEXT,                     -- 'EA' | 'BOX' | 'CASE' (free text)
  list_price_cents INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_item_skus_vendor_sku_uniq
  ON vendor_item_skus(vendor_id, vendor_sku);

CREATE INDEX IF NOT EXISTS vendor_item_skus_hcpc_idx
  ON vendor_item_skus(hcpc_code);

CREATE INDEX IF NOT EXISTS vendor_item_skus_vendor_idx
  ON vendor_item_skus(vendor_id);

CREATE INDEX IF NOT EXISTS vendor_item_skus_active_idx
  ON vendor_item_skus(is_active);

-- --------------------------------------------------------------------------
-- 2. order_items — vendor SKU snapshot at order time
-- --------------------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN vendor_sku TEXT;
ALTER TABLE order_items ADD COLUMN unit_quantity INTEGER;     -- HCPC unit qty
ALTER TABLE order_items ADD COLUMN pack_quantity INTEGER;     -- vendor pack qty
ALTER TABLE order_items ADD COLUMN units_per_pack INTEGER;    -- snapshot

-- 0007_lot_catalog.sql
-- Promote LOT / NON_LOT to a first-class catalog concept and split SKU stock
-- from physical lot stock.
--
-- Changes:
--   1. Backfill inventory_items.item_type from HCPC prefix
--      (L*, C*, K*, A42*, Q4* → LOT; everything else stays NON_LOT).
--   2. Create inventory_lots table — per-lot physical stock.
--   3. Migrate any existing inventory_items.lot_number values into inventory_lots
--      (as qty-on-hand 0 rows so historical data isn't lost).
--   4. Drop inventory_items.lot_number (column was conceptually misplaced —
--      a SKU can have many lots).
--
-- Uses the SQLite-safe "create new, copy, drop, rename" pattern because older
-- SQLite versions don't support ALTER TABLE ... DROP COLUMN.

-- D1 auto-wraps multi-statement uploads in a transaction; no explicit BEGIN/COMMIT needed.

-- --------------------------------------------------------------------------
-- 1. Backfill item_type from HCPC prefix
-- --------------------------------------------------------------------------
UPDATE inventory_items
SET item_type = 'LOT'
WHERE (item_type IS NULL OR item_type = 'NON_LOT')
  AND (
    substr(hcpc_code, 1, 1) IN ('L', 'C', 'K')
    OR hcpc_code LIKE 'A42%'
    OR hcpc_code LIKE 'Q4%'
  );

-- Anything NULL defaults to NON_LOT
UPDATE inventory_items
SET item_type = 'NON_LOT'
WHERE item_type IS NULL;

-- --------------------------------------------------------------------------
-- 2. Create inventory_lots table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_lots (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  expiration_date TEXT,
  manufacturer_date TEXT,
  received_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (inventory_item_id, lot_number)
);

CREATE INDEX IF NOT EXISTS inventory_lots_lot_idx ON inventory_lots(lot_number);
CREATE INDEX IF NOT EXISTS inventory_lots_item_idx ON inventory_lots(inventory_item_id);

-- --------------------------------------------------------------------------
-- 3. Migrate existing inventory_items.lot_number values into inventory_lots
--    (preserve historical data before dropping the column).
-- --------------------------------------------------------------------------
INSERT OR IGNORE INTO inventory_lots
  (id, inventory_item_id, lot_number, quantity_on_hand, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  id,
  lot_number,
  0,
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(created_at, CURRENT_TIMESTAMP)
FROM inventory_items
WHERE lot_number IS NOT NULL AND lot_number <> '';

-- --------------------------------------------------------------------------
-- 4. Drop inventory_items.lot_number by recreating the table.
--    We preserve every other column and all indexes.
-- --------------------------------------------------------------------------
CREATE TABLE inventory_items_new (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL,
  hcpc_code TEXT NOT NULL,
  description TEXT,
  manufacturer_item_number TEXT,
  manufacturer_name TEXT,
  unit_of_measurement TEXT,
  is_custom_fit INTEGER DEFAULT 0,
  item_type TEXT NOT NULL DEFAULT 'NON_LOT' CHECK (item_type IN ('LOT','NON_LOT')),
  bundle_hcpc_codes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inventory_items_new
  (id, inventory_id, hcpc_code, description, manufacturer_item_number,
   manufacturer_name, unit_of_measurement, is_custom_fit,
   item_type, bundle_hcpc_codes, created_at)
SELECT
  id, inventory_id, hcpc_code, description, manufacturer_item_number,
  manufacturer_name, unit_of_measurement, is_custom_fit,
  COALESCE(item_type, 'NON_LOT'),
  bundle_hcpc_codes,
  created_at
FROM inventory_items;

DROP TABLE inventory_items;
ALTER TABLE inventory_items_new RENAME TO inventory_items;

CREATE INDEX IF NOT EXISTS inventory_items_inventory_id_idx
  ON inventory_items(inventory_id);
CREATE INDEX IF NOT EXISTS inventory_items_hcpc_desc_idx
  ON inventory_items(hcpc_code, description);
CREATE INDEX IF NOT EXISTS inventory_items_item_type_idx
  ON inventory_items(item_type);

-- 0008_vendor_locations_routing.sql
-- Phase 1 of multi-location vendor/hospital routing.
--
-- Changes:
--   1. New table `vendor_locations` — vendor branches / warehouses / fitting
--      centers. Each location has its own address, capabilities (JSON),
--      service areas (states + optional ZIP prefixes), and a delivery SLA.
--   2. Backfill one row per existing vendor (primary location) using the
--      vendor's existing address fields. Assumes broad capabilities so
--      existing flows don't suddenly reject orders.
--   3. Extend `hospital_vendors` with facility scoping + preference ranking:
--        - facility_id   (nullable; NULL = hospital-wide)
--        - priority      (lower = preferred; default 100)
--        - item_categories (JSON array; NULL = all categories)
--      Replace the (hospital_id, vendor_id) UNIQUE constraint with a wider
--      one spanning all four columns. SQLite treats NULL as distinct, so we
--      wrap the nullable columns in COALESCE(...) inside the unique index.
--   4. Extend `inventory_lots` with optional `vendor_location_id` so LOT
--      stock can (eventually) be tracked per warehouse. NULL is allowed in
--      Phase 1 — Phase 2 tightens this.
--   5. Extend `orders` with `parent_order_id` to support multi-vendor
--      split orders (one parent → N sibling child orders).
--
-- D1 auto-wraps multi-statement uploads in a transaction — no BEGIN/COMMIT.

-- --------------------------------------------------------------------------
-- 1. vendor_locations
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_locations (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'WAREHOUSE'
    CHECK (location_type IN ('WAREHOUSE','FITTING_CENTER','HEADQUARTERS','DISTRIBUTION_HUB')),
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  capabilities TEXT,             -- JSON array: ["CUSTOM_FIT","STAT","REFRIGERATED","STERILE"]
  service_states TEXT,           -- JSON array of 2-letter state codes
  service_zip_prefixes TEXT,     -- optional JSON array of 3-digit ZIP prefixes
  max_delivery_hours INTEGER,    -- SLA: 24 = next-day, 4 = STAT
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS vendor_locations_vendor_idx ON vendor_locations(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_locations_state_idx ON vendor_locations(state);
CREATE INDEX IF NOT EXISTS vendor_locations_active_idx ON vendor_locations(is_active);

-- --------------------------------------------------------------------------
-- 2. Backfill one primary location per existing vendor
-- --------------------------------------------------------------------------
INSERT INTO vendor_locations (
  id, vendor_id, name, location_type,
  street_address, city, state, zip,
  is_primary, is_active,
  capabilities, service_states, max_delivery_hours,
  created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),
  v.id,
  COALESCE(v.name, 'Primary') || ' — Primary',
  'HEADQUARTERS',
  v.street_address, v.city, v.state, v.zip,
  1, 1,
  '["STAT","CUSTOM_FIT"]',
  CASE WHEN v.state IS NOT NULL AND v.state <> ''
       THEN '["' || v.state || '"]'
       ELSE '[]' END,
  24,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM vendors v
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_locations vl WHERE vl.vendor_id = v.id
);

-- --------------------------------------------------------------------------
-- 3. hospital_vendors — add facility_id, priority, item_categories; rewrite
--    unique index. SQLite cannot ALTER DROP UNIQUE directly, but the current
--    constraint in the Drizzle schema was created via a named unique index
--    called `hospital_vendors_hospital_vendor_unique`, which we drop and
--    replace.
-- --------------------------------------------------------------------------
ALTER TABLE hospital_vendors ADD COLUMN facility_id TEXT;
ALTER TABLE hospital_vendors ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE hospital_vendors ADD COLUMN item_categories TEXT;

DROP INDEX IF EXISTS hospital_vendors_hospital_vendor_unique;

-- Wider unique: (hospital, vendor, facility_or_any, categories_or_any).
-- COALESCE ensures NULL facility / NULL categories collapse to a single slot
-- per hospital+vendor pair, preserving the "one hospital-wide default" rule.
CREATE UNIQUE INDEX hospital_vendors_scope_uniq
  ON hospital_vendors (
    hospital_id,
    vendor_id,
    COALESCE(facility_id, ''),
    COALESCE(item_categories, '')
  );

CREATE INDEX IF NOT EXISTS hospital_vendors_facility_idx
  ON hospital_vendors(facility_id);
CREATE INDEX IF NOT EXISTS hospital_vendors_priority_idx
  ON hospital_vendors(priority);

-- --------------------------------------------------------------------------
-- 4. inventory_lots — optional vendor_location_id
-- --------------------------------------------------------------------------
ALTER TABLE inventory_lots ADD COLUMN vendor_location_id TEXT;
CREATE INDEX IF NOT EXISTS inventory_lots_location_idx
  ON inventory_lots(vendor_location_id);

-- --------------------------------------------------------------------------
-- 5. orders — parent_order_id for split orders
-- --------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN parent_order_id TEXT;
CREATE INDEX IF NOT EXISTS orders_parent_order_id_idx
  ON orders(parent_order_id);

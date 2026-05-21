-- 0008b_routing_continuation.sql
-- Applies the parts of 0008 that hadn't yet been applied to remote D1.
-- The orders.parent_order_id column was already present in the remote DB,
-- so that ALTER and its index are handled here separately with IF NOT EXISTS.

-- --------------------------------------------------------------------------
-- 1. vendor_locations (new table)
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
  capabilities TEXT,
  service_states TEXT,
  service_zip_prefixes TEXT,
  max_delivery_hours INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS vendor_locations_vendor_idx ON vendor_locations(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_locations_state_idx  ON vendor_locations(state);
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
-- 3. hospital_vendors — facility_id, priority, item_categories
-- --------------------------------------------------------------------------
ALTER TABLE hospital_vendors ADD COLUMN facility_id    TEXT;
ALTER TABLE hospital_vendors ADD COLUMN priority       INTEGER NOT NULL DEFAULT 100;
ALTER TABLE hospital_vendors ADD COLUMN item_categories TEXT;

DROP INDEX IF EXISTS hospital_vendors_hospital_vendor_unique;

CREATE UNIQUE INDEX IF NOT EXISTS hospital_vendors_scope_uniq
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
-- 4. inventory_lots — vendor_location_id
-- --------------------------------------------------------------------------
ALTER TABLE inventory_lots ADD COLUMN vendor_location_id TEXT;
CREATE INDEX IF NOT EXISTS inventory_lots_location_idx
  ON inventory_lots(vendor_location_id);

-- --------------------------------------------------------------------------
-- 5. orders — parent_order_id index (column already exists in remote DB)
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS orders_parent_order_id_idx
  ON orders(parent_order_id);

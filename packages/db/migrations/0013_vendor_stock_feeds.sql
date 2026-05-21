-- 0013_vendor_stock_feeds.sql
-- Phase D: real-time stock feeds from external vendor systems.
--
-- vendor_stock_connectors  — config for each vendor's stock data source
-- vendor_stock_snapshots   — latest stock per (vendor, location, sku)
-- vendor_stock_feed_log    — audit trail per poll attempt (30d retention)

-- --------------------------------------------------------------------------
-- 1. vendor_stock_connectors
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_stock_connectors (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL
    CHECK (connector_type IN ('HTTP_POLL','WEBHOOK','EDI_846','MANUAL')),
  endpoint_url TEXT,
  auth_secret_ref TEXT,                    -- key into the wrangler secret store
  poll_interval_minutes INTEGER NOT NULL DEFAULT 15,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_polled_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  config TEXT,                             -- JSON: per-connector settings (field maps)
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS vendor_stock_connectors_vendor_idx
  ON vendor_stock_connectors(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_stock_connectors_active_idx
  ON vendor_stock_connectors(is_active);

-- --------------------------------------------------------------------------
-- 2. vendor_stock_snapshots
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_stock_snapshots (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  vendor_location_id TEXT NOT NULL REFERENCES vendor_locations(id) ON DELETE CASCADE,
  vendor_sku TEXT NOT NULL,
  hcpc_code TEXT,                          -- denormalised for query speed
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  available_quantity INTEGER,              -- on_hand - reserved (when feed provides)
  source TEXT NOT NULL,                    -- connector_type that produced this row
  observed_at TEXT NOT NULL,               -- vendor's reported timestamp
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_stock_snapshots_unique
  ON vendor_stock_snapshots(vendor_id, vendor_location_id, vendor_sku);
CREATE INDEX IF NOT EXISTS vendor_stock_snapshots_hcpc_idx
  ON vendor_stock_snapshots(hcpc_code);
CREATE INDEX IF NOT EXISTS vendor_stock_snapshots_freshness_idx
  ON vendor_stock_snapshots(ingested_at);
CREATE INDEX IF NOT EXISTS vendor_stock_snapshots_vendor_idx
  ON vendor_stock_snapshots(vendor_id);

-- --------------------------------------------------------------------------
-- 3. vendor_stock_feed_log
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_stock_feed_log (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  status TEXT NOT NULL,                    -- 'OK' | 'PARTIAL' | 'FAILED'
  rows_written INTEGER,
  error_summary TEXT,
  duration_ms INTEGER,
  ran_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS vendor_stock_feed_log_connector_idx
  ON vendor_stock_feed_log(connector_id);
CREATE INDEX IF NOT EXISTS vendor_stock_feed_log_ran_at_idx
  ON vendor_stock_feed_log(ran_at);

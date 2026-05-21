-- 0015_vendor_erp_connectors.sql
-- Phase E: outbound order push to a vendor's ERP.
--
-- vendor_erp_connectors — config per vendor (Fishbowl / NetSuite / SAP / …)
-- vendor_erp_push_log    — per-attempt audit + debugging trail (30d retention)

-- --------------------------------------------------------------------------
-- 1. vendor_erp_connectors
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_erp_connectors (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL
    CHECK (connector_type IN ('HTTP_POST','WEBHOOK_POST','EDI_850','MANUAL')),
  endpoint_url TEXT,
  auth_secret_ref TEXT,                       -- key into the wrangler secret store
  trigger_event TEXT NOT NULL DEFAULT 'VENDOR_CONFIRMED_RECEIPT',
  config TEXT,                                -- JSON: { fieldMap, headers? }
  is_active INTEGER NOT NULL DEFAULT 1,
  last_pushed_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS vendor_erp_connectors_vendor_idx
  ON vendor_erp_connectors(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_erp_connectors_active_idx
  ON vendor_erp_connectors(is_active);

-- --------------------------------------------------------------------------
-- 2. vendor_erp_push_log
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_erp_push_log (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,                       -- 'OK' | 'FAILED' | 'RETRYING'
  attempt INTEGER NOT NULL DEFAULT 1,
  http_status INTEGER,
  duration_ms INTEGER,
  error_summary TEXT,
  request_body TEXT,                          -- truncated to 4 KB
  response_body TEXT,                         -- truncated to 4 KB
  pushed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS vendor_erp_push_log_order_idx
  ON vendor_erp_push_log(order_id);
CREATE INDEX IF NOT EXISTS vendor_erp_push_log_connector_idx
  ON vendor_erp_push_log(connector_id);
CREATE INDEX IF NOT EXISTS vendor_erp_push_log_pushed_idx
  ON vendor_erp_push_log(pushed_at);

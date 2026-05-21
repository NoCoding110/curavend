-- 0014_file_access_log.sql
-- Phase B: HIPAA §164.312(b) — file-layer audit trail.
--
-- Records every R2 file download so audits can answer:
--   "who accessed patient X's documents in the last 90 days?"
-- Complements phi_access_log (record-level) with the binary-file layer.

CREATE TABLE IF NOT EXISTS file_access_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_type TEXT,                 -- 'ADMIN' | 'HOSPITAL' | 'VENDOR' | 'PROVIDER' | 'SUPER_VENDOR'

  file_key TEXT NOT NULL,
  file_kind TEXT,
  -- 'CONTRACT' | 'ORDER_ATTACHMENT' | 'INVENTORY_MANIFEST' | 'DELIVERY_PROOF'
  -- | 'INVOICE_PDF' | 'ORDER_PACKET' | 'OTHER'

  -- Denormalized tenant + entity refs for fast scoped queries
  hospital_id TEXT,
  vendor_id TEXT,
  order_id TEXT,
  contract_id TEXT,
  invoice_id TEXT,

  ip_address TEXT,
  user_agent TEXT,
  bytes_served INTEGER,
  http_status INTEGER,

  accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS file_access_log_user_idx     ON file_access_log(user_id);
CREATE INDEX IF NOT EXISTS file_access_log_order_idx    ON file_access_log(order_id);
CREATE INDEX IF NOT EXISTS file_access_log_accessed_idx ON file_access_log(accessed_at);
CREATE INDEX IF NOT EXISTS file_access_log_hospital_idx ON file_access_log(hospital_id);
CREATE INDEX IF NOT EXISTS file_access_log_vendor_idx   ON file_access_log(vendor_id);

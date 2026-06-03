-- Gap 3: outbound FHIR write audit trail
CREATE TABLE IF NOT EXISTS ehr_write_log (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT,
  connection_id TEXT,
  resource_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  fhir_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ehr_write_log_order_idx ON ehr_write_log (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS ehr_write_log_idem_idx ON ehr_write_log (idempotency_key);

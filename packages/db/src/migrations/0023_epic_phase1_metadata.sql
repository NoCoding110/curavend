-- 0023_epic_phase1_metadata.sql
-- Phase 1.A — Epic FHIR linkage columns on `orders`.
--
-- Only adds `epic_connection_id` and `fhir_patient_id`. The wider Epic
-- metadata (encounter id, document reference id, procedure resource ids)
-- lives in a side table `order_epic_metadata` (migration 0024) because the
-- orders table is near SQLite's ALTER TABLE column limit.
--
-- All columns nullable; existing rows unaffected.

ALTER TABLE orders ADD COLUMN epic_connection_id TEXT;
ALTER TABLE orders ADD COLUMN fhir_patient_id TEXT;

CREATE INDEX IF NOT EXISTS orders_epic_conn_idx ON orders (epic_connection_id);
CREATE INDEX IF NOT EXISTS orders_fhir_patient_idx ON orders (fhir_patient_id);

-- Gap 2: approver tracking + FHIR encounter link on orders
-- The orders table is at D1's ALTER TABLE column limit, so we use a sidecar table
-- for the new columns, joined by order_id (1:1).
CREATE TABLE IF NOT EXISTS order_approval_meta (
  order_id TEXT PRIMARY KEY NOT NULL,
  approver_user_id TEXT,
  fhir_encounter_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_approval_meta_approver_idx ON order_approval_meta (approver_user_id);

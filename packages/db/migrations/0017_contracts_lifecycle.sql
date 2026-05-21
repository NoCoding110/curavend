-- 0017_contracts_lifecycle.sql
--
-- Contract lifecycle, line-item pricing, negotiation/approval workflow.
--   * Adds lifecycle columns to existing `contracts` table
--   * Adds priceSource + contractId columns to `order_items` for traceability
--   * Creates `contract_items` — mutable working set of line items
--   * Creates `contract_revisions` — immutable snapshots per submit
--   * Creates `contract_history` — narrative event log
--   * Backfills `status` on existing contract rows

-- ---------------------------------------------------------------------------
-- 1. ALTER contracts: lifecycle fields
-- SQLite requires one ADD COLUMN per statement.
-- ---------------------------------------------------------------------------
ALTER TABLE contracts ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE contracts ADD COLUMN initiated_by TEXT;
ALTER TABLE contracts ADD COLUMN current_revision_id TEXT;
ALTER TABLE contracts ADD COLUMN parent_contract_id TEXT;
ALTER TABLE contracts ADD COLUMN terminated_at TEXT;
ALTER TABLE contracts ADD COLUMN terminated_by TEXT;
ALTER TABLE contracts ADD COLUMN termination_reason TEXT;
ALTER TABLE contracts ADD COLUMN rejected_reason TEXT;
ALTER TABLE contracts ADD COLUMN item_categories TEXT;

CREATE INDEX IF NOT EXISTS contracts_status_idx
  ON contracts(status);
CREATE INDEX IF NOT EXISTS contracts_parent_contract_id_idx
  ON contracts(parent_contract_id);

-- Backfill existing contracts: ACTIVE if within range, EXPIRED if past endDate,
-- DRAFT otherwise. initiated_by = ADMIN for legacy rows.
UPDATE contracts
SET status = CASE
    WHEN date(end_date) < date('now') THEN 'EXPIRED'
    WHEN date(start_date) <= date('now') AND date(end_date) >= date('now') THEN 'ACTIVE'
    ELSE 'DRAFT'
  END,
  initiated_by = 'ADMIN'
WHERE initiated_by IS NULL;

-- ---------------------------------------------------------------------------
-- 2. ALTER order_items: price provenance
-- ---------------------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN price_source TEXT;
ALTER TABLE order_items ADD COLUMN contract_id TEXT;

CREATE INDEX IF NOT EXISTS order_items_contract_id_idx
  ON order_items(contract_id);

-- ---------------------------------------------------------------------------
-- 3. contract_items — mutable working set
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_items (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  hcpc_code TEXT NOT NULL,
  description TEXT,
  negotiated_rate REAL NOT NULL,
  quantity INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_items_contract_hcpc_uk
  ON contract_items(contract_id, hcpc_code);
CREATE INDEX IF NOT EXISTS contract_items_contract_id_idx
  ON contract_items(contract_id);
CREATE INDEX IF NOT EXISTS contract_items_hcpc_code_idx
  ON contract_items(hcpc_code);

-- ---------------------------------------------------------------------------
-- 4. contract_revisions — immutable snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_revisions (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  s3key TEXT,
  name TEXT,
  start_date TEXT,
  end_date TEXT,
  items_snapshot TEXT NOT NULL,            -- JSON
  submitted_by_user_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  review_decision TEXT,                    -- APPROVED | REJECTED | CHANGES_REQUESTED
  review_comment TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_revisions_contract_revision_uk
  ON contract_revisions(contract_id, revision_number);
CREATE INDEX IF NOT EXISTS contract_revisions_contract_id_idx
  ON contract_revisions(contract_id);

-- ---------------------------------------------------------------------------
-- 5. contract_history — narrative event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_history (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  description TEXT NOT NULL,
  changed_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS contract_history_contract_id_idx
  ON contract_history(contract_id);
CREATE INDEX IF NOT EXISTS contract_history_contract_created_idx
  ON contract_history(contract_id, created_at);

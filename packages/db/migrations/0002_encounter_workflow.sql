-- Phase 2: Clinical Encounter Workflow (NKP-19/20/21)
-- Adds Assessment/Delivery sections, Lot/Non-Lot items, Medicare fee lookup,
-- proof-of-delivery support, encounter audit trail.

-- ---------------------------------------------------------------------------
-- orders table — new columns for encounter workflow
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN assessment_confirmed_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_confirmed_at TEXT;
ALTER TABLE orders ADD COLUMN encounter_submitted_at TEXT;
ALTER TABLE orders ADD COLUMN pod_file_key TEXT;
ALTER TABLE orders ADD COLUMN pod_signature_data_url TEXT;

-- Phase 6 (added now to avoid a second migration)
ALTER TABLE orders ADD COLUMN benefit_verification_status TEXT;
ALTER TABLE orders ADD COLUMN benefit_verification_note TEXT;
ALTER TABLE orders ADD COLUMN authorization_number TEXT;
ALTER TABLE orders ADD COLUMN authorization_l_codes TEXT;
ALTER TABLE orders ADD COLUMN visit_number INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN parent_order_id TEXT;

-- ---------------------------------------------------------------------------
-- order_items table — extend for Lot/Non-Lot, section, bundle, pricing
-- ---------------------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN section TEXT DEFAULT 'ASSESSMENT'; -- ASSESSMENT | DELIVERY
ALTER TABLE order_items ADD COLUMN item_type TEXT DEFAULT 'NON_LOT';   -- LOT | NON_LOT
ALTER TABLE order_items ADD COLUMN lot_number TEXT;
ALTER TABLE order_items ADD COLUMN hcpc_code TEXT;
ALTER TABLE order_items ADD COLUMN medicare_fee REAL;
ALTER TABLE order_items ADD COLUMN unit_price REAL;
ALTER TABLE order_items ADD COLUMN is_bundle INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN bundle_parent_id TEXT;

-- ---------------------------------------------------------------------------
-- inventory_items — ensure lot_number column exists (may already be there)
-- ---------------------------------------------------------------------------
-- SQLite will error if column exists; swallowed at apply time if so.
ALTER TABLE inventory_items ADD COLUMN lot_number TEXT;
ALTER TABLE inventory_items ADD COLUMN item_type TEXT DEFAULT 'NON_LOT';
ALTER TABLE inventory_items ADD COLUMN bundle_hcpc_codes TEXT; -- JSON array of child HCPC codes for bundles

-- ---------------------------------------------------------------------------
-- hospitals — fax number (Devs Q#17)
-- ---------------------------------------------------------------------------
ALTER TABLE hospitals ADD COLUMN fax_number TEXT;

-- ---------------------------------------------------------------------------
-- Medicare fee schedules (reference data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medicare_fee_schedules (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medicare_fee_schedule_items (
  id TEXT PRIMARY KEY,
  fee_schedule_id TEXT NOT NULL REFERENCES medicare_fee_schedules(id),
  hcpc_code TEXT NOT NULL,
  description TEXT,
  rural_rate REAL,
  non_rural_rate REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_medicare_fee_items_hcpc ON medicare_fee_schedule_items(hcpc_code);

-- ---------------------------------------------------------------------------
-- Encounter audit trail (per NKP-20 requirement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encounter_audit_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  section TEXT NOT NULL,       -- ASSESSMENT | DELIVERY
  action TEXT NOT NULL,        -- ADD_ITEM | EDIT_ITEM | EDIT_AFTER_CONFIRM | DELETE_ITEM | CONFIRM | UPLOAD_POD | SUBMIT
  changed_by_user_id TEXT NOT NULL,
  payload TEXT,                -- JSON snapshot
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_encounter_audit_order ON encounter_audit_logs(order_id);

-- ---------------------------------------------------------------------------
-- Clinical templates (Phase 6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,          -- SCOLI | AFO | GENERAL
  body TEXT,                    -- HTML body
  default_hcpc_codes TEXT,      -- JSON array of default codes
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- PHI consent log (Phase 4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phi_consent_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  acknowledged_at TEXT NOT NULL
);

-- Seed common HCPC L-codes (Medicare 2025 approximate DME rates)
INSERT OR IGNORE INTO medicare_fee_schedules (id, year, name, created_at)
VALUES ('mfs-2025', 2025, 'Medicare DME Fee Schedule 2025', '2026-04-16T00:00:00.000Z');

INSERT OR IGNORE INTO medicare_fee_schedule_items (id, fee_schedule_id, hcpc_code, description, non_rural_rate, rural_rate, created_at) VALUES
  ('mfi-1', 'mfs-2025', 'L0637', 'Lumbar-sacral orthosis, sagittal-coronal control, rigid', 745.53, 781.25, '2026-04-16T00:00:00.000Z'),
  ('mfi-2', 'mfs-2025', 'L1832', 'Knee orthosis, adjustable knee joints', 445.00, 467.25, '2026-04-16T00:00:00.000Z'),
  ('mfi-3', 'mfs-2025', 'L1833', 'Knee orthosis, adjustable knee joints, custom fit', 650.00, 682.50, '2026-04-16T00:00:00.000Z'),
  ('mfi-4', 'mfs-2025', 'L1843', 'Knee orthosis, single upright, thigh and calf', 890.00, 934.50, '2026-04-16T00:00:00.000Z'),
  ('mfi-5', 'mfs-2025', 'L1844', 'Knee orthosis, double upright, thigh and calf', 1340.00, 1407.00, '2026-04-16T00:00:00.000Z'),
  ('mfi-6', 'mfs-2025', 'L1906', 'Ankle foot orthosis, multiligamentous, AFO, prefab', 180.00, 189.00, '2026-04-16T00:00:00.000Z'),
  ('mfi-7', 'mfs-2025', 'L1970', 'AFO, plastic with ankle joint, custom fabricated', 355.00, 372.75, '2026-04-16T00:00:00.000Z'),
  ('mfi-8', 'mfs-2025', 'L3900', 'Wrist-hand-finger orthosis, dynamic flexor pseudodynamic', 760.00, 798.00, '2026-04-16T00:00:00.000Z'),
  ('mfi-9', 'mfs-2025', 'L0450', 'TLSO, flexible, provides trunk support', 210.00, 220.50, '2026-04-16T00:00:00.000Z'),
  ('mfi-10', 'mfs-2025', 'L0460', 'TLSO, triplanar control, with rigid posterior panel', 585.00, 614.25, '2026-04-16T00:00:00.000Z');

-- Clinical templates seed
INSERT OR IGNORE INTO clinical_templates (id, name, type, body, default_hcpc_codes, created_at, updated_at) VALUES
  ('tpl-scoli', 'Scoliosis Bracing', 'SCOLI', '<p>Patient presents with scoliosis requiring TLSO bracing for curve correction.</p>', '["L1200","L1300"]', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('tpl-afo', 'Ankle-Foot Orthosis', 'AFO', '<p>Patient requires ankle-foot orthosis for foot drop / ankle stabilization.</p>', '["L1906","L1970"]', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('tpl-knee', 'Knee Orthosis', 'GENERAL', '<p>Knee orthosis indicated for joint instability or post-surgical support.</p>', '["L1832","L1833"]', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

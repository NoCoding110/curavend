-- Encounter audit logs
CREATE TABLE IF NOT EXISTS encounter_audit_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  section TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS encounter_audit_logs_order_idx ON encounter_audit_logs(order_id);

-- Medicare fee schedules (CMS L-code rates)
CREATE TABLE IF NOT EXISTS medicare_fee_schedules (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS medicare_fee_schedule_items (
  id TEXT PRIMARY KEY,
  fee_schedule_id TEXT,
  hcpc_code TEXT NOT NULL,
  description TEXT,
  rural_rate REAL,
  non_rural_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS mfsi_hcpc_idx ON medicare_fee_schedule_items(hcpc_code);

-- Seed 2025 CMS DME L-codes (subset of common orthotic codes)
INSERT OR IGNORE INTO medicare_fee_schedules (id, year) VALUES ('mfs-2025', 2025);

INSERT OR IGNORE INTO medicare_fee_schedule_items (id, fee_schedule_id, hcpc_code, description, rural_rate, non_rural_rate) VALUES
  ('mfsi-L1832', 'mfs-2025', 'L1832', 'Knee orthosis, adjustable knee joints', 312.45, 298.72),
  ('mfsi-L1840', 'mfs-2025', 'L1840', 'Knee orthosis, derotation, medial/lateral, prefabricated', 341.18, 325.87),
  ('mfsi-L1906', 'mfs-2025', 'L1906', 'Ankle foot orthosis, multiligamentus ankle support', 87.34, 83.45),
  ('mfsi-L1907', 'mfs-2025', 'L1907', 'Ankle orthosis, supramalleolar with straps', 59.22, 56.54),
  ('mfsi-L1908', 'mfs-2025', 'L1908', 'Ankle foot orthosis, custom fabricated', 498.71, 476.43),
  ('mfsi-L0456', 'mfs-2025', 'L0456', 'Thoracic-lumbar-sacral orthosis (TLSO), flexible', 612.33, 584.91),
  ('mfsi-L0457', 'mfs-2025', 'L0457', 'TLSO, flexible, custom fabricated', 812.44, 775.89),
  ('mfsi-L0458', 'mfs-2025', 'L0458', 'TLSO, triplanar control, custom fabricated', 1024.55, 978.12),
  ('mfsi-L3960', 'mfs-2025', 'L3960', 'Shoulder-elbow-wrist-hand orthosis (SEWHO)', 624.87, 596.51),
  ('mfsi-L4000', 'mfs-2025', 'L4000', 'Repair prosthetic device, per 15 minutes', 42.18, 40.28),
  ('mfsi-E0148', 'mfs-2025', 'E0148', 'Walkers, heavy duty, without wheels', 108.24, 103.38),
  ('mfsi-E0149', 'mfs-2025', 'E0149', 'Walker, heavy duty, wheeled, rigid or folding', 145.67, 139.12),
  ('mfsi-K0001', 'mfs-2025', 'K0001', 'Standard wheelchair', 175.43, 167.54),
  ('mfsi-K0002', 'mfs-2025', 'K0002', 'Standard hemi (low seat) wheelchair', 192.77, 184.09),
  ('mfsi-A9900', 'mfs-2025', 'A9900', 'Miscellaneous DME supply or accessory', 25.00, 23.88);

-- Clinical note templates
CREATE TABLE IF NOT EXISTS clinical_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL',
  body TEXT,
  default_hcpc_codes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO clinical_templates (id, name, type, body, default_hcpc_codes, created_at) VALUES
  ('tpl-scoli-001', 'Scoliosis Orthosis (TLSO)', 'SCOLI', 'Standard TLSO clinical note for scoliosis management.', '["L0456","L0457","L0458"]', datetime('now')),
  ('tpl-afo-001', 'Ankle-Foot Orthosis (AFO)', 'AFO', 'Standard AFO clinical note for foot drop.', '["L1906","L1907","L1908"]', datetime('now')),
  ('tpl-gen-001', 'General DME Order', 'GENERAL', 'General DME order template.', '[]', datetime('now'));

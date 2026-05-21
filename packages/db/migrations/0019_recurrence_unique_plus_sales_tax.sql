-- 0019_recurrence_unique_plus_sales_tax.sql
--
-- Risk-mitigation follow-ups to migration 0018:
--   1. Partial UNIQUE index on orders(recurrence_plan_id, recurrence_index)
--      so a double-cron-fire cannot produce duplicate child orders even if
--      both invocations race past the application-level SELECT check.
--   2. New `sales_tax_rates` table — replaces the hardcoded US state rate
--      map in `InternalTaxEngine` so rates can be updated without a deploy.
--   3. Seed it with current (illustrative) 2026 US state rates.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UNIQUE constraint on recurrence-spawned children
-- ═══════════════════════════════════════════════════════════════════════════
-- Partial index — the constraint only applies when recurrence_plan_id is set.
-- Standalone (non-recurring) orders are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS orders_recurrence_unique
  ON orders(recurrence_plan_id, recurrence_index)
  WHERE recurrence_plan_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. sales_tax_rates — data-driven US state sales tax rates
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sales_tax_rates (
  id TEXT PRIMARY KEY,
  jurisdiction_type TEXT NOT NULL,      -- COUNTRY | STATE | COUNTY | CITY | ZIP
  jurisdiction_code TEXT NOT NULL,      -- e.g. 'US-MA', 'US-CA-Los_Angeles'
  rate REAL NOT NULL,                   -- decimal: 0.0625 = 6.25%
  effective_from TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TEXT,
  source TEXT,                          -- 'INTERNAL_SEED' | 'MANUAL' | 'AVALARA_IMPORT' | etc.
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_tax_rates_jurisdiction_active_uk
  ON sales_tax_rates(jurisdiction_type, jurisdiction_code)
  WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS sales_tax_rates_active_idx
  ON sales_tax_rates(is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Seed — US state-level rates (matches the prior hardcoded map)
-- ═══════════════════════════════════════════════════════════════════════════
-- Source: prior in-code STATE_TAX_RATES map. To update later, INSERT a new
-- row with the new rate + UPDATE the old row's is_active=0.

INSERT OR IGNORE INTO sales_tax_rates (id, jurisdiction_type, jurisdiction_code, rate, source, notes)
VALUES
  ('seed-us-al', 'STATE', 'US-AL', 0.04,    'INTERNAL_SEED', 'Alabama'),
  ('seed-us-ak', 'STATE', 'US-AK', 0.0,     'INTERNAL_SEED', 'Alaska — no state sales tax'),
  ('seed-us-az', 'STATE', 'US-AZ', 0.056,   'INTERNAL_SEED', 'Arizona'),
  ('seed-us-ar', 'STATE', 'US-AR', 0.065,   'INTERNAL_SEED', 'Arkansas'),
  ('seed-us-ca', 'STATE', 'US-CA', 0.0725,  'INTERNAL_SEED', 'California'),
  ('seed-us-co', 'STATE', 'US-CO', 0.029,   'INTERNAL_SEED', 'Colorado'),
  ('seed-us-ct', 'STATE', 'US-CT', 0.0635,  'INTERNAL_SEED', 'Connecticut'),
  ('seed-us-de', 'STATE', 'US-DE', 0.0,     'INTERNAL_SEED', 'Delaware — no state sales tax'),
  ('seed-us-fl', 'STATE', 'US-FL', 0.06,    'INTERNAL_SEED', 'Florida'),
  ('seed-us-ga', 'STATE', 'US-GA', 0.04,    'INTERNAL_SEED', 'Georgia'),
  ('seed-us-hi', 'STATE', 'US-HI', 0.04,    'INTERNAL_SEED', 'Hawaii'),
  ('seed-us-id', 'STATE', 'US-ID', 0.06,    'INTERNAL_SEED', 'Idaho'),
  ('seed-us-il', 'STATE', 'US-IL', 0.0625,  'INTERNAL_SEED', 'Illinois'),
  ('seed-us-in', 'STATE', 'US-IN', 0.07,    'INTERNAL_SEED', 'Indiana'),
  ('seed-us-ia', 'STATE', 'US-IA', 0.06,    'INTERNAL_SEED', 'Iowa'),
  ('seed-us-ks', 'STATE', 'US-KS', 0.065,   'INTERNAL_SEED', 'Kansas'),
  ('seed-us-ky', 'STATE', 'US-KY', 0.06,    'INTERNAL_SEED', 'Kentucky'),
  ('seed-us-la', 'STATE', 'US-LA', 0.0445,  'INTERNAL_SEED', 'Louisiana'),
  ('seed-us-me', 'STATE', 'US-ME', 0.055,   'INTERNAL_SEED', 'Maine'),
  ('seed-us-md', 'STATE', 'US-MD', 0.06,    'INTERNAL_SEED', 'Maryland'),
  ('seed-us-ma', 'STATE', 'US-MA', 0.0625,  'INTERNAL_SEED', 'Massachusetts'),
  ('seed-us-mi', 'STATE', 'US-MI', 0.06,    'INTERNAL_SEED', 'Michigan'),
  ('seed-us-mn', 'STATE', 'US-MN', 0.06875, 'INTERNAL_SEED', 'Minnesota'),
  ('seed-us-ms', 'STATE', 'US-MS', 0.07,    'INTERNAL_SEED', 'Mississippi'),
  ('seed-us-mo', 'STATE', 'US-MO', 0.04225, 'INTERNAL_SEED', 'Missouri'),
  ('seed-us-mt', 'STATE', 'US-MT', 0.0,     'INTERNAL_SEED', 'Montana — no state sales tax'),
  ('seed-us-ne', 'STATE', 'US-NE', 0.055,   'INTERNAL_SEED', 'Nebraska'),
  ('seed-us-nv', 'STATE', 'US-NV', 0.0685,  'INTERNAL_SEED', 'Nevada'),
  ('seed-us-nh', 'STATE', 'US-NH', 0.0,     'INTERNAL_SEED', 'New Hampshire — no state sales tax'),
  ('seed-us-nj', 'STATE', 'US-NJ', 0.06625, 'INTERNAL_SEED', 'New Jersey'),
  ('seed-us-nm', 'STATE', 'US-NM', 0.05125, 'INTERNAL_SEED', 'New Mexico'),
  ('seed-us-ny', 'STATE', 'US-NY', 0.04,    'INTERNAL_SEED', 'New York'),
  ('seed-us-nc', 'STATE', 'US-NC', 0.0475,  'INTERNAL_SEED', 'North Carolina'),
  ('seed-us-nd', 'STATE', 'US-ND', 0.05,    'INTERNAL_SEED', 'North Dakota'),
  ('seed-us-oh', 'STATE', 'US-OH', 0.0575,  'INTERNAL_SEED', 'Ohio'),
  ('seed-us-ok', 'STATE', 'US-OK', 0.045,   'INTERNAL_SEED', 'Oklahoma'),
  ('seed-us-or', 'STATE', 'US-OR', 0.0,     'INTERNAL_SEED', 'Oregon — no state sales tax'),
  ('seed-us-pa', 'STATE', 'US-PA', 0.06,    'INTERNAL_SEED', 'Pennsylvania'),
  ('seed-us-ri', 'STATE', 'US-RI', 0.07,    'INTERNAL_SEED', 'Rhode Island'),
  ('seed-us-sc', 'STATE', 'US-SC', 0.06,    'INTERNAL_SEED', 'South Carolina'),
  ('seed-us-sd', 'STATE', 'US-SD', 0.045,   'INTERNAL_SEED', 'South Dakota'),
  ('seed-us-tn', 'STATE', 'US-TN', 0.07,    'INTERNAL_SEED', 'Tennessee'),
  ('seed-us-tx', 'STATE', 'US-TX', 0.0625,  'INTERNAL_SEED', 'Texas'),
  ('seed-us-ut', 'STATE', 'US-UT', 0.0485,  'INTERNAL_SEED', 'Utah'),
  ('seed-us-vt', 'STATE', 'US-VT', 0.06,    'INTERNAL_SEED', 'Vermont'),
  ('seed-us-va', 'STATE', 'US-VA', 0.043,   'INTERNAL_SEED', 'Virginia'),
  ('seed-us-wa', 'STATE', 'US-WA', 0.065,   'INTERNAL_SEED', 'Washington'),
  ('seed-us-wv', 'STATE', 'US-WV', 0.06,    'INTERNAL_SEED', 'West Virginia'),
  ('seed-us-wi', 'STATE', 'US-WI', 0.05,    'INTERNAL_SEED', 'Wisconsin'),
  ('seed-us-wy', 'STATE', 'US-WY', 0.04,    'INTERNAL_SEED', 'Wyoming'),
  ('seed-us-dc', 'STATE', 'US-DC', 0.06,    'INTERNAL_SEED', 'District of Columbia');

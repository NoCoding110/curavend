-- 0016_user_memberships.sql
-- Phase F: layered multi-org user accounts.
--
-- Each user can belong to multiple tenants. The legacy columns on users
-- (hospital_id / vendor_id / provider_id / super_vendor_id) remain the source
-- of truth for the *active* membership; this table just enumerates which
-- tenants a user CAN switch to.
--
-- Backfill: every existing user gets exactly one membership row matching
-- their current tenant column. is_default = 1 so the post-login picker
-- auto-selects it.

CREATE TABLE IF NOT EXISTS user_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_type TEXT NOT NULL
    CHECK (tenant_type IN ('HOSPITAL','VENDOR','PROVIDER','SUPER_VENDOR')),
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tenant_type, tenant_id)
);

CREATE INDEX IF NOT EXISTS user_memberships_user_idx
  ON user_memberships(user_id);
CREATE INDEX IF NOT EXISTS user_memberships_tenant_idx
  ON user_memberships(tenant_type, tenant_id);

-- ---------------------------------------------------------------------------
-- Backfill memberships from existing single-tenant columns.
-- One INSERT per tenant kind; UNIQUE(user_id, tenant_type, tenant_id) makes
-- the migration idempotent if re-run.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO user_memberships
  (id, user_id, tenant_type, tenant_id, role, is_active, is_default)
SELECT
  lower(hex(randomblob(16))),
  id,
  'HOSPITAL',
  hospital_id,
  role,
  CASE WHEN user_status = 'ACTIVE' THEN 1 ELSE 0 END,
  1
FROM users
WHERE hospital_id IS NOT NULL AND hospital_id <> '';

INSERT OR IGNORE INTO user_memberships
  (id, user_id, tenant_type, tenant_id, role, is_active, is_default)
SELECT
  lower(hex(randomblob(16))),
  id,
  'VENDOR',
  vendor_id,
  role,
  CASE WHEN user_status = 'ACTIVE' THEN 1 ELSE 0 END,
  1
FROM users
WHERE vendor_id IS NOT NULL AND vendor_id <> '';

INSERT OR IGNORE INTO user_memberships
  (id, user_id, tenant_type, tenant_id, role, is_active, is_default)
SELECT
  lower(hex(randomblob(16))),
  id,
  'PROVIDER',
  provider_id,
  role,
  CASE WHEN user_status = 'ACTIVE' THEN 1 ELSE 0 END,
  1
FROM users
WHERE provider_id IS NOT NULL AND provider_id <> '';

INSERT OR IGNORE INTO user_memberships
  (id, user_id, tenant_type, tenant_id, role, is_active, is_default)
SELECT
  lower(hex(randomblob(16))),
  id,
  'SUPER_VENDOR',
  super_vendor_id,
  role,
  CASE WHEN user_status = 'ACTIVE' THEN 1 ELSE 0 END,
  1
FROM users
WHERE super_vendor_id IS NOT NULL AND super_vendor_id <> '';

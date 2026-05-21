-- Migration: 0005_user_permissions
-- Per-user, per-resource access-level overrides for fine-grained RBAC.
-- Level ∈ ('NONE','READ','WRITE','FULL'); Resource ∈ ('facilities','departments','physicians','orders','vendors').

CREATE TABLE IF NOT EXISTS user_permissions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  hospital_id   TEXT NOT NULL,
  resource      TEXT NOT NULL,
  level         TEXT NOT NULL,
  granted_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_user_resource_uk
  ON user_permissions (user_id, resource);

CREATE INDEX IF NOT EXISTS user_permissions_hospital_idx
  ON user_permissions (hospital_id);

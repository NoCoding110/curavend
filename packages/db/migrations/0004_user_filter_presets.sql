-- Migration: 0004_user_filter_presets
-- Adds per-user saved filter presets (orders list, extensible to other entities).

CREATE TABLE IF NOT EXISTS user_filter_presets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  entity       TEXT NOT NULL,
  name         TEXT NOT NULL,
  filters      TEXT NOT NULL,
  is_default   INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_filter_presets_user_entity_idx
  ON user_filter_presets (user_id, entity);

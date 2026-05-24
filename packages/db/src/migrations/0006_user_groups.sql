-- 0006_user_groups.sql
-- Unified user-groups across hospitals, vendors, providers, super-vendors,
-- and platform admins. Generalizes the per-persona grouping gap.
-- Lab groups (`lab_groups`) are intentionally left alone — they have
-- lab-specific semantics that don't fit the generic model.

-- ─── user_groups ───────────────────────────────────────────────────────
CREATE TABLE `user_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_type` text NOT NULL,                       -- HOSPITAL | VENDOR | PROVIDER | SUPER_VENDOR | ADMIN
  `tenant_id` text,                                  -- nullable for ADMIN platform-wide groups
  `name` text NOT NULL,
  `description` text,
  `group_kind` text NOT NULL DEFAULT 'COMPOSITE',    -- PERMISSION_BUNDLE | SCOPED_TEAM | NOTIFICATION_ROUTE | COMPOSITE
  `facility_id` text,                                -- hospital sub-scope
  `department_id` text,                              -- hospital sub-scope
  `vendor_location_id` text,                         -- vendor sub-scope
  `is_system_default` integer NOT NULL DEFAULT 0,
  `created_by` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `user_groups_tenant_idx` ON `user_groups` (`tenant_type`, `tenant_id`);
CREATE UNIQUE INDEX `user_groups_name_uq` ON `user_groups` (`tenant_type`, `tenant_id`, `name`);

-- ─── user_group_members ────────────────────────────────────────────────
CREATE TABLE `user_group_members` (
  `id` text PRIMARY KEY NOT NULL,
  `user_group_id` text NOT NULL,
  `user_id` text NOT NULL,
  `added_by` text,
  `added_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `user_group_members_uq` ON `user_group_members` (`user_group_id`, `user_id`);
CREATE INDEX `user_group_members_user_idx` ON `user_group_members` (`user_id`);

-- ─── user_group_permissions ────────────────────────────────────────────
CREATE TABLE `user_group_permissions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_group_id` text NOT NULL,
  `resource` text NOT NULL,                           -- PermissionResource (8 values)
  `level` text NOT NULL,                              -- NONE | READ | WRITE | FULL
  `granted_by` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `user_group_permissions_uq` ON `user_group_permissions` (`user_group_id`, `resource`);

-- ─── Extend notification_preferences ───────────────────────────────────
-- Additive column: existing rows default NULL, no behavior change. New
-- preferences may set recipient_type='GROUP' and reference recipient_group_id.
ALTER TABLE `notification_preferences` ADD COLUMN `recipient_group_id` text;

-- ─── Seed system-default "Procurement Team" group per hospital + vendor ─
-- These groups are NOTIFICATION_ROUTE kind with no permissions and zero
-- members initially. They give the notification router a stable target it
-- can fall back to when no users match the existing role query.
-- `lower(hex(randomblob(16)))` produces a 32-char hex id that won't collide.
INSERT INTO `user_groups` (
  `id`, `tenant_type`, `tenant_id`, `name`, `description`,
  `group_kind`, `is_system_default`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  'HOSPITAL',
  h.id,
  'Procurement Team',
  'Default notification target for procurement-related events at this hospital.',
  'NOTIFICATION_ROUTE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM hospitals h;

INSERT INTO `user_groups` (
  `id`, `tenant_type`, `tenant_id`, `name`, `description`,
  `group_kind`, `is_system_default`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  'VENDOR',
  v.id,
  'Procurement Team',
  'Default notification target for procurement-related events at this vendor.',
  'NOTIFICATION_ROUTE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM vendors v;

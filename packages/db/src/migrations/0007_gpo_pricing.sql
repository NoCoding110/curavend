-- 0007_gpo_pricing.sql
-- GPO (Group Purchasing Organization) pricing tier. Inserts a new step
-- in the pricing cascade between Contract and Medicare:
--   Contract → GPO Contract → Fee Schedule → Medicare → Manual.
--
-- Hospitals join a GPO by setting `hospitals.gpo_organization_id`. Pricing
-- engine then looks up the matching `gpo_contract_items` row for the
-- order's HCPC code (and optionally the vendor) before falling through.

CREATE TABLE `gpo_organizations` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `kind` text NOT NULL,
  `description` text,
  `website` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `gpo_organizations_kind_idx` ON `gpo_organizations` (`kind`);

CREATE TABLE `gpo_contract_items` (
  `id` text PRIMARY KEY NOT NULL,
  `gpo_organization_id` text NOT NULL,
  `vendor_id` text,
  `hcpc_code` text NOT NULL,
  `description` text,
  `rate_usd` real NOT NULL,
  `effective_start_date` text NOT NULL,
  `effective_end_date` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `source_contract_id` text,
  `imported_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `gpo_contract_items_uq`
  ON `gpo_contract_items` (`gpo_organization_id`, `vendor_id`, `hcpc_code`, `effective_start_date`);
CREATE INDEX `gpo_contract_items_hcpc_idx` ON `gpo_contract_items` (`hcpc_code`);
CREATE INDEX `gpo_contract_items_gpo_idx` ON `gpo_contract_items` (`gpo_organization_id`);

-- Hospitals declare GPO membership here. Nullable for hospitals with no GPO.
ALTER TABLE `hospitals` ADD COLUMN `gpo_organization_id` text;
ALTER TABLE `hospitals` ADD COLUMN `gpo_member_id` text;

-- Seed the 3 major US GPOs so admins can attach hospitals immediately.
INSERT INTO `gpo_organizations` (`id`, `name`, `kind`, `description`, `website`, `created_at`, `updated_at`) VALUES
  (lower(hex(randomblob(16))), 'Vizient', 'VIZIENT', 'Largest US healthcare GPO — ~29% of US bed coverage.', 'https://www.vizientinc.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'Premier', 'PREMIER', 'Premier Inc. GPO + AI/analytics platform.', 'https://www.premierinc.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'HealthTrust', 'HEALTHTRUST', 'HealthTrust Purchasing Group (HPG), HCA-affiliated.', 'https://healthtrustpg.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

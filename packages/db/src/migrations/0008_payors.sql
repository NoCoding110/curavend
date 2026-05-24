-- 0008_payors.sql
-- Payor records + per-HCPC payor allowable rates + eligibility check cache.
-- Adds payor_id to orders so claims can carry insurance context.

CREATE TABLE `payors` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `kind` text NOT NULL,
  `payor_code` text,
  `eligibility_endpoint` text,
  `phone` text,
  `website` text,
  `notes` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `payors_kind_idx` ON `payors` (`kind`);
CREATE INDEX `payors_name_idx` ON `payors` (`name`);

CREATE TABLE `payor_contract_items` (
  `id` text PRIMARY KEY NOT NULL,
  `payor_id` text NOT NULL,
  `vendor_id` text,
  `hcpc_code` text NOT NULL,
  `description` text,
  `allowable_usd` real NOT NULL,
  `patient_responsibility_usd` real,
  `effective_start_date` text NOT NULL,
  `effective_end_date` text,
  `requires_prior_auth` integer NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `payor_contract_items_uq`
  ON `payor_contract_items` (`payor_id`, `vendor_id`, `hcpc_code`, `effective_start_date`);
CREATE INDEX `payor_contract_items_hcpc_idx` ON `payor_contract_items` (`hcpc_code`);
CREATE INDEX `payor_contract_items_payor_idx` ON `payor_contract_items` (`payor_id`);

CREATE TABLE `eligibility_checks` (
  `id` text PRIMARY KEY NOT NULL,
  `payor_id` text NOT NULL,
  `patient_member_id` text NOT NULL,
  `patient_name` text,
  `patient_dob` text,
  `requested_hcpc_code` text,
  `order_id` text,
  `status` text NOT NULL,
  `benefit_notes` text,
  `copay_usd` real,
  `deductible_usd` real,
  `deductible_met_usd` real,
  `raw_response` text,
  `checked_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `eligibility_checks_member_idx` ON `eligibility_checks` (`payor_id`, `patient_member_id`);
CREATE INDEX `eligibility_checks_order_idx` ON `eligibility_checks` (`order_id`);

-- Add payor reference to orders.
ALTER TABLE `orders` ADD COLUMN `payor_id` text;
ALTER TABLE `orders` ADD COLUMN `payor_member_id` text;
ALTER TABLE `orders` ADD COLUMN `payor_group_id` text;

-- Seed major payors so hospitals can immediately link orders.
INSERT INTO `payors` (`id`, `name`, `kind`, `payor_code`, `created_at`, `updated_at`) VALUES
  (lower(hex(randomblob(16))), 'Medicare Part B', 'MEDICARE', 'CMS-PARTB', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'Medicaid (state)', 'MEDICAID', 'STATE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'BlueCross BlueShield', 'COMMERCIAL', 'BCBS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'UnitedHealthcare', 'COMMERCIAL', 'UHC', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'Aetna', 'COMMERCIAL', 'AETNA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'Cigna', 'COMMERCIAL', 'CIGNA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'Humana', 'COMMERCIAL', 'HUMANA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'Self-Pay', 'SELF_PAY', 'SELF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 0009_prior_auths.sql
-- Prior authorization workflow + audit log.
-- Closes the largest competitive gap vs. Parachute Health.

CREATE TABLE `prior_auths` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text,
  `hospital_id` text,
  `payor_id` text NOT NULL,
  `payor_member_id` text NOT NULL,
  `payor_group_id` text,
  `patient_name` text NOT NULL,
  `patient_dob` text,
  `hcpc_code` text NOT NULL,
  `icd10_codes` text,
  `clinical_note` text,
  `auth_number` text,
  `status` text NOT NULL DEFAULT 'NEEDED',
  `status_reason` text,
  `quantity_approved` integer,
  `submitted_at` text,
  `decision_at` text,
  `effective_start_date` text,
  `effective_end_date` text,
  `document_blob_keys` text,
  `created_by` text,
  `last_edited_by` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `prior_auths_order_idx` ON `prior_auths` (`order_id`);
CREATE INDEX `prior_auths_status_idx` ON `prior_auths` (`status`);
CREATE INDEX `prior_auths_payor_member_idx` ON `prior_auths` (`payor_id`, `payor_member_id`);
CREATE INDEX `prior_auths_expiry_idx` ON `prior_auths` (`effective_end_date`);

CREATE TABLE `prior_auth_history` (
  `id` text PRIMARY KEY NOT NULL,
  `prior_auth_id` text NOT NULL,
  `from_status` text,
  `to_status` text NOT NULL,
  `reason` text,
  `changed_by` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `prior_auth_history_pa_idx` ON `prior_auth_history` (`prior_auth_id`);

-- Order can carry a prior-auth reference (for orders that have one).
ALTER TABLE `orders` ADD COLUMN `prior_auth_id` text;

-- 0004_athome_parity.sql
-- Closes 9 capability gaps vs Medzah's `labcorpathomeapis`:
--   audit journal + replay, kit letter catalog sync, third-party fulfillment
--   callbacks (HMAC), QC attempt tracking, external vendor status on labs.

-- ─── Kit letters catalog (synced from external CMS) ───────────────────────

CREATE TABLE `kit_letters` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_kit_id` text,
  `letter_id` text NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `name` text,
  `pdf_blob_key` text,
  `source_updated_at` text,
  `dynamic_data` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `kit_letters_parent_letter_version_uq` ON `kit_letters` (`parent_kit_id`, `letter_id`, `version`);
CREATE INDEX `kit_letters_letter_id_idx` ON `kit_letters` (`letter_id`);

-- ─── External fulfillment vendor callback audit log ───────────────────────

CREATE TABLE `external_fulfillment_callbacks` (
  `id` text PRIMARY KEY NOT NULL,
  `vendor_name` text NOT NULL,
  `callback_type` text NOT NULL,
  `order_reference` text,
  `related_lab_order_id` text,
  `payload_hash` text NOT NULL,
  `raw_payload` text,
  `signature_valid` integer NOT NULL DEFAULT 0,
  `applied` integer NOT NULL DEFAULT 0,
  `apply_error` text,
  `ip_address` text,
  `received_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `ext_fulfillment_order_ref_idx` ON `external_fulfillment_callbacks` (`order_reference`);
CREATE INDEX `ext_fulfillment_lab_order_idx` ON `external_fulfillment_callbacks` (`related_lab_order_id`);
CREATE INDEX `ext_fulfillment_hash_idx` ON `external_fulfillment_callbacks` (`payload_hash`);

-- ─── Order ingest journal (raw payloads in R2; this is the index) ─────────

CREATE TABLE `order_ingest_journal` (
  `id` text PRIMARY KEY NOT NULL,
  `order_ref` text NOT NULL,
  `lab_order_id` text,
  `idempotency_key` text,
  `payload_blob_key` text NOT NULL,
  `event` text NOT NULL,
  `error_message` text,
  `source_ip` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `order_ingest_journal_order_ref_idx` ON `order_ingest_journal` (`order_ref`);
CREATE UNIQUE INDEX `order_ingest_journal_idempotency_uq` ON `order_ingest_journal` (`idempotency_key`);
CREATE INDEX `order_ingest_journal_created_at_idx` ON `order_ingest_journal` (`created_at`);

-- ─── Lab order QC + external fulfillment extensions ───────────────────────

ALTER TABLE `lab_orders` ADD COLUMN `qc_attempt_count` integer NOT NULL DEFAULT 0;
ALTER TABLE `lab_orders` ADD COLUMN `qc_permanently_failed` integer NOT NULL DEFAULT 0;
ALTER TABLE `lab_orders` ADD COLUMN `qc_failure_reason` text;
ALTER TABLE `lab_orders` ADD COLUMN `qc_status` text NOT NULL DEFAULT 'PENDING';
ALTER TABLE `lab_orders` ADD COLUMN `external_vendor_name` text;
ALTER TABLE `lab_orders` ADD COLUMN `external_vendor_status` text;
ALTER TABLE `lab_orders` ADD COLUMN `external_order_ref` text;
CREATE INDEX `lab_orders_external_order_ref_idx` ON `lab_orders` (`external_order_ref`);

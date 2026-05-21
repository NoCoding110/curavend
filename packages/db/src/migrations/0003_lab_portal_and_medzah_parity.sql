-- 0003_lab_portal_and_medzah_parity.sql
-- Adds: lab portal tables, order stickers, email OTP MFA, email recipient config,
--       workflow orchestration tables.
-- Extends: users with email_otp_mfa_enabled + lab_group_id columns.

-- ─── Lab portal ─────────────────────────────────────────────────────────────

CREATE TABLE `lab_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `group_type` text NOT NULL,
  `vendor_id` text,
  `description` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lab_groups_vendor_id_idx` ON `lab_groups` (`vendor_id`);
CREATE INDEX `lab_groups_group_type_idx` ON `lab_groups` (`group_type`);

CREATE TABLE `lab_kit_sites` (
  `id` text PRIMARY KEY NOT NULL,
  `lab_group_id` text NOT NULL,
  `site_name` text NOT NULL,
  `site_number` text,
  `address_line1` text NOT NULL,
  `address_line2` text,
  `city` text NOT NULL,
  `state` text NOT NULL,
  `zip` text NOT NULL,
  `contact_name` text,
  `contact_phone` text,
  `contact_email` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lab_kit_sites_group_id_idx` ON `lab_kit_sites` (`lab_group_id`);
CREATE INDEX `lab_kit_sites_site_number_idx` ON `lab_kit_sites` (`site_number`);

CREATE TABLE `lab_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `order_number` text NOT NULL UNIQUE,
  `parent_order_id` text,
  `lc_order_reference` text,
  `lab_group_id` text NOT NULL,
  `kit_site_id` text,
  `created_by_user_id` text NOT NULL,
  `patient_name` text,
  `patient_last_name` text,
  `patient_email` text,
  `patient_phone` text,
  `patient_address` text,
  `patient_city` text,
  `patient_state` text,
  `patient_zip` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `dx_code_list` text,
  `test_list` text,
  `status` text NOT NULL DEFAULT 'OPEN',
  `ready_for_approval` integer NOT NULL DEFAULT 0,
  `approved_by` text,
  `approved_at` text,
  `rejection_reason` text,
  `rejected_by` text,
  `rejected_at` text,
  `trf_blob_key` text,
  `shipping_label_blob_key` text,
  `return_label_blob_key` text,
  `stickers_blob_key` text,
  `consolidated_assets_blob_key` text,
  `tracking_number` text,
  `carrier` text,
  `shipped_at` text,
  `delivered_at` text,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lab_orders_group_id_idx` ON `lab_orders` (`lab_group_id`);
CREATE INDEX `lab_orders_kit_site_id_idx` ON `lab_orders` (`kit_site_id`);
CREATE INDEX `lab_orders_status_idx` ON `lab_orders` (`status`);
CREATE INDEX `lab_orders_created_by_idx` ON `lab_orders` (`created_by_user_id`);
CREATE INDEX `lab_orders_created_at_idx` ON `lab_orders` (`created_at`);
CREATE INDEX `lab_orders_parent_order_idx` ON `lab_orders` (`parent_order_id`);

CREATE TABLE `lab_order_items` (
  `id` text PRIMARY KEY NOT NULL,
  `lab_order_id` text NOT NULL,
  `product_id` text,
  `test_code` text,
  `test_name` text,
  `specimen_type` text,
  `barcode` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `unit_price` integer,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lab_order_items_lab_order_id_idx` ON `lab_order_items` (`lab_order_id`);
CREATE INDEX `lab_order_items_product_id_idx` ON `lab_order_items` (`product_id`);
CREATE INDEX `lab_order_items_barcode_idx` ON `lab_order_items` (`barcode`);

-- ─── Order stickers ─────────────────────────────────────────────────────────

CREATE TABLE `order_stickers` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text,
  `lab_order_id` text,
  `sticker_type` text NOT NULL,
  `barcode_value` text NOT NULL,
  `barcode_format` text DEFAULT 'code128',
  `printable_lines` text,
  `metadata` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `order_stickers_order_id_idx` ON `order_stickers` (`order_id`);
CREATE INDEX `order_stickers_lab_order_id_idx` ON `order_stickers` (`lab_order_id`);
CREATE INDEX `order_stickers_barcode_idx` ON `order_stickers` (`barcode_value`);

-- ─── Email OTP codes ────────────────────────────────────────────────────────

CREATE TABLE `email_otp_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `email` text NOT NULL,
  `code_hash` text NOT NULL,
  `purpose` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `attempts` integer NOT NULL DEFAULT 0,
  `ip_address` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `email_otp_codes_user_id_idx` ON `email_otp_codes` (`user_id`);
CREATE INDEX `email_otp_codes_email_idx` ON `email_otp_codes` (`email`);
CREATE INDEX `email_otp_codes_purpose_idx` ON `email_otp_codes` (`purpose`);
CREATE INDEX `email_otp_codes_expires_at_idx` ON `email_otp_codes` (`expires_at`);

-- ─── Email recipient config ─────────────────────────────────────────────────

CREATE TABLE `email_recipient_config` (
  `id` text PRIMARY KEY NOT NULL,
  `template_key` text NOT NULL,
  `tenant_id` text,
  `cc_emails` text,
  `bcc_emails` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `email_recipient_config_template_idx` ON `email_recipient_config` (`template_key`);
CREATE INDEX `email_recipient_config_tenant_idx` ON `email_recipient_config` (`tenant_id`);
CREATE UNIQUE INDEX `email_recipient_config_template_tenant_uq` ON `email_recipient_config` (`template_key`, `tenant_id`);

-- ─── Workflow orchestration ────────────────────────────────────────────────

CREATE TABLE `workflow_instances` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_type` text NOT NULL,
  `entity_type` text,
  `entity_id` text,
  `status` text NOT NULL DEFAULT 'PENDING',
  `current_step` text,
  `step_index` integer NOT NULL DEFAULT 0,
  `total_steps` integer,
  `context` text,
  `error_message` text,
  `attempts` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` text
);
CREATE INDEX `workflow_instances_type_idx` ON `workflow_instances` (`workflow_type`);
CREATE INDEX `workflow_instances_entity_idx` ON `workflow_instances` (`entity_type`, `entity_id`);
CREATE INDEX `workflow_instances_status_idx` ON `workflow_instances` (`status`);
CREATE INDEX `workflow_instances_created_at_idx` ON `workflow_instances` (`created_at`);

CREATE TABLE `workflow_activity_log` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_instance_id` text NOT NULL,
  `activity_name` text NOT NULL,
  `status` text NOT NULL,
  `input` text,
  `output` text,
  `error_message` text,
  `duration_ms` integer,
  `started_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` text
);
CREATE INDEX `workflow_activity_log_instance_idx` ON `workflow_activity_log` (`workflow_instance_id`);
CREATE INDEX `workflow_activity_log_activity_idx` ON `workflow_activity_log` (`activity_name`);
CREATE INDEX `workflow_activity_log_status_idx` ON `workflow_activity_log` (`status`);

-- ─── Users extension ───────────────────────────────────────────────────────

ALTER TABLE `users` ADD COLUMN `email_otp_mfa_enabled` integer DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `lab_group_id` text;
CREATE INDEX `users_lab_group_id_idx` ON `users` (`lab_group_id`);

-- Migration 0021 — Procurement v2: 10 gap closures.
-- Tables: vendor_onboarding_states, vendor_rmas, vendor_rma_lines,
--         invoice_match_rules, point_of_use_events, shipment_temp_logs,
--         compliance_alerts.

-- ─── Supplier onboarding state machine (gap B) ──────────────────────────────
CREATE TABLE `vendor_onboarding_states` (
  `id` text PRIMARY KEY NOT NULL,
  `vendor_id` text NOT NULL,
  `hospital_id` text,                                -- null = platform-level onboarding
  `state` text NOT NULL DEFAULT 'INVITED',           -- INVITED | DOCS_PENDING | DOCS_RECEIVED | CREDENTIALED | APPROVED | ACTIVE | SUSPENDED
  `invited_by_user_id` text,
  `invited_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `docs_required` text,                              -- JSON array of doc names (W9, COI, OIG, DMEPOS, MSA)
  `docs_received` text,                              -- JSON array of received doc names
  `credentialed_at` text,
  `approved_at` text,
  `activated_at` text,
  `suspended_at` text,
  `suspended_reason` text,
  `notes` text,
  `last_advanced_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `vendor_onboarding_states_vendor_uk`
  ON `vendor_onboarding_states` (`vendor_id`, `hospital_id`);
CREATE INDEX `vendor_onboarding_states_state_idx`
  ON `vendor_onboarding_states` (`state`);

-- Audit log of every state transition.
CREATE TABLE `vendor_onboarding_history` (
  `id` text PRIMARY KEY NOT NULL,
  `onboarding_id` text NOT NULL,
  `from_state` text,
  `to_state` text NOT NULL,
  `by_user_id` text,
  `note` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `vendor_onboarding_history_onboarding_idx`
  ON `vendor_onboarding_history` (`onboarding_id`);

-- ─── RMA (gap D) ────────────────────────────────────────────────────────────
CREATE TABLE `vendor_rmas` (
  `id` text PRIMARY KEY NOT NULL,
  `rma_number` text NOT NULL,                        -- RMA-2026-00001
  `vendor_id` text NOT NULL,
  `hospital_id` text,
  `source_grn_id` text,                              -- auto-spawn parent
  `source_order_id` text,
  `state` text NOT NULL DEFAULT 'DRAFT',             -- DRAFT | SUBMITTED | APPROVED | SHIPPED | RECEIVED | CREDITED | REJECTED | CANCELLED
  `reason` text NOT NULL DEFAULT 'DAMAGED',          -- DAMAGED | WRONG_ITEM | SHORT_DATED | DEFECTIVE | OTHER
  `reason_detail` text,
  `vendor_rma_number` text,                          -- vendor-assigned ref
  `expected_credit_usd` real,
  `actual_credit_usd` real,
  `submitted_at` text,
  `approved_at` text,
  `shipped_at` text,
  `received_at` text,
  `credited_at` text,
  `tracking_number` text,
  `notes` text,
  `created_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `vendor_rmas_vendor_idx` ON `vendor_rmas` (`vendor_id`);
CREATE INDEX `vendor_rmas_hospital_idx` ON `vendor_rmas` (`hospital_id`);
CREATE INDEX `vendor_rmas_state_idx` ON `vendor_rmas` (`state`);
CREATE INDEX `vendor_rmas_grn_idx` ON `vendor_rmas` (`source_grn_id`);

CREATE TABLE `vendor_rma_lines` (
  `id` text PRIMARY KEY NOT NULL,
  `rma_id` text NOT NULL,
  `grn_line_id` text,                                -- backref to goods_receipt_lines
  `hcpc_code` text,
  `description` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `unit_credit_usd` real,
  `condition` text,                                  -- DAMAGED | WRONG_ITEM | SHORT_DATED
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `vendor_rma_lines_rma_idx` ON `vendor_rma_lines` (`rma_id`);

-- ─── Invoice match auto-resolution rules (gap E) ────────────────────────────
CREATE TABLE `invoice_match_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `vendor_id` text,                                  -- null = applies to all vendors
  `tolerance_pct` real NOT NULL DEFAULT 2.0,         -- accept invoices within ±N% of PO
  `tolerance_max_usd` real NOT NULL DEFAULT 50.0,    -- AND within $N absolute
  `is_active` integer NOT NULL DEFAULT 1,
  `notes` text,
  `created_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `invoice_match_rules_hospital_idx` ON `invoice_match_rules` (`hospital_id`);
CREATE INDEX `invoice_match_rules_vendor_idx` ON `invoice_match_rules` (`vendor_id`);

-- ─── Point-of-use capture (gap G) ───────────────────────────────────────────
-- Append-only event log. Each row = one item consumed at the bedside or
-- procedure room. Drives downstream inventory decrement + cost attribution.
CREATE TABLE `point_of_use_events` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `facility_id` text,
  `department_id` text,
  `room_id` text,
  `patient_mrn` text,
  `encounter_id` text,
  `provider_user_id` text,
  `hcpc_code` text,
  `formulary_item_id` text,
  `manufacturer_number` text,
  `serial_number` text,
  `lot_number` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `unit_price_usd` real,
  `inventory_lot_id` text,                           -- decremented lot, when scanned
  `captured_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `captured_by_user_id` text,
  `device_id` text,                                  -- scanner / kiosk ID for audit
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `point_of_use_events_hospital_idx` ON `point_of_use_events` (`hospital_id`);
CREATE INDEX `point_of_use_events_dept_idx` ON `point_of_use_events` (`department_id`);
CREATE INDEX `point_of_use_events_encounter_idx` ON `point_of_use_events` (`encounter_id`);
CREATE INDEX `point_of_use_events_patient_idx` ON `point_of_use_events` (`patient_mrn`);
CREATE INDEX `point_of_use_events_captured_at_idx` ON `point_of_use_events` (`captured_at`);

-- ─── Cold-chain / shipment temperature logs (gap K) ─────────────────────────
CREATE TABLE `shipment_temp_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `shipment_id` text NOT NULL,                        -- FK to order_shipments
  `reading_at` text NOT NULL,
  `temperature_c` real NOT NULL,
  `humidity_pct` real,
  `is_excursion` integer NOT NULL DEFAULT 0,          -- 1 if outside spec
  `spec_min_c` real,
  `spec_max_c` real,
  `source` text,                                       -- CARRIER_API | IOT_SENSOR | MANUAL
  `device_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `shipment_temp_logs_shipment_idx` ON `shipment_temp_logs` (`shipment_id`);
CREATE INDEX `shipment_temp_logs_excursion_idx` ON `shipment_temp_logs` (`is_excursion`);
CREATE INDEX `shipment_temp_logs_reading_at_idx` ON `shipment_temp_logs` (`reading_at`);

-- Cold-chain spec on shipments (per-shipment override of vendor defaults).
ALTER TABLE `order_shipments` ADD COLUMN `cold_chain_required` integer NOT NULL DEFAULT 0;
ALTER TABLE `order_shipments` ADD COLUMN `cold_chain_spec_min_c` real;
ALTER TABLE `order_shipments` ADD COLUMN `cold_chain_spec_max_c` real;
ALTER TABLE `order_shipments` ADD COLUMN `eta_at` text;
ALTER TABLE `order_shipments` ADD COLUMN `last_temp_c` real;
ALTER TABLE `order_shipments` ADD COLUMN `last_temp_at` text;
ALTER TABLE `order_shipments` ADD COLUMN `had_excursion` integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS `order_shipments_eta_idx` ON `order_shipments` (`eta_at`);

-- ─── Compliance alerts (gap I) ──────────────────────────────────────────────
-- Pre-expiry alerts emitted by daily cron. One row per (subject, alert_kind,
-- threshold_days). Resolved by user acknowledgement or auto-resolved when
-- the underlying cert is renewed.
CREATE TABLE `compliance_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text,                                  -- null = platform-wide (e.g. vendor)
  `subject_type` text NOT NULL,                        -- VENDOR_DMEPOS | VENDOR_ACCREDITATION | VENDOR_LICENSE | LAB_LOT | USER_MFA
  `subject_id` text NOT NULL,
  `alert_kind` text NOT NULL,                          -- EXPIRY | MISSING | OIG_HIT
  `threshold_days` integer,                            -- 60, 30, 7
  `expires_on` text,                                   -- the expiry date being flagged
  `severity` text NOT NULL DEFAULT 'WARN',             -- INFO | WARN | CRITICAL
  `message` text NOT NULL,
  `acknowledged_at` text,
  `acknowledged_by_user_id` text,
  `resolved_at` text,                                  -- set when underlying doc renews
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `compliance_alerts_subject_idx`
  ON `compliance_alerts` (`subject_type`, `subject_id`);
CREATE INDEX `compliance_alerts_hospital_idx` ON `compliance_alerts` (`hospital_id`);
CREATE INDEX `compliance_alerts_resolved_idx` ON `compliance_alerts` (`resolved_at`);
CREATE UNIQUE INDEX `compliance_alerts_uk`
  ON `compliance_alerts` (`subject_type`, `subject_id`, `alert_kind`, `threshold_days`);

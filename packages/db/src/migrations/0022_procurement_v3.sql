-- Migration 0022 — Procurement v3: 10 gap closures across 4 themes.
-- Tables: inventory_transfers, recalls, recall_affected_items,
--   controlled_substance_log, substitution_audit_log,
--   vendor_scorecard_snapshots, hospital_forecast_runs.
-- ALTERs: formulary_items.dea_schedule, point_of_use_events.invoice_item_id,
--   requisitions.is_emergency.

-- ─── Emergency purchasing (gap B) ───────────────────────────────────────────
ALTER TABLE `requisitions` ADD COLUMN `is_emergency` integer NOT NULL DEFAULT 0;
ALTER TABLE `requisitions` ADD COLUMN `emergency_reason` text;
ALTER TABLE `requisitions` ADD COLUMN `emergency_review_status` text;       -- NULL | PENDING_REVIEW | REVIEWED_OK | REVIEWED_FLAG
ALTER TABLE `requisitions` ADD COLUMN `emergency_reviewed_at` text;
ALTER TABLE `requisitions` ADD COLUMN `emergency_reviewed_by_user_id` text;
CREATE INDEX IF NOT EXISTS `requisitions_emergency_review_idx`
  ON `requisitions` (`emergency_review_status`);

-- ─── Cross-site inventory transfers (gap C) ─────────────────────────────────
-- Hospital-side facility-to-facility transfers (distinct from lab kit-site
-- transfers, which use lab_stock_movements TRANSFER_OUT/IN).
CREATE TABLE `inventory_transfers` (
  `id` text PRIMARY KEY NOT NULL,
  `transfer_number` text NOT NULL,                            -- TR-2026-00001
  `hospital_id` text NOT NULL,
  `from_facility_id` text NOT NULL,
  `to_facility_id` text NOT NULL,
  `requested_by_user_id` text,
  `approved_by_user_id` text,
  `state` text NOT NULL DEFAULT 'REQUESTED',                  -- REQUESTED | APPROVED | SHIPPED | RECEIVED | CANCELLED
  `priority` text NOT NULL DEFAULT 'NORMAL',                  -- LOW | NORMAL | HIGH | URGENT
  `reason` text,
  `tracking_number` text,
  `shipped_at` text,
  `received_at` text,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `inventory_transfers_hospital_idx` ON `inventory_transfers` (`hospital_id`);
CREATE INDEX `inventory_transfers_state_idx` ON `inventory_transfers` (`state`);
CREATE INDEX `inventory_transfers_from_idx` ON `inventory_transfers` (`from_facility_id`);
CREATE INDEX `inventory_transfers_to_idx` ON `inventory_transfers` (`to_facility_id`);

CREATE TABLE `inventory_transfer_lines` (
  `id` text PRIMARY KEY NOT NULL,
  `transfer_id` text NOT NULL,
  `hcpc_code` text,
  `description` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `lot_number` text,
  `unit_cost_usd` real,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `inventory_transfer_lines_transfer_idx` ON `inventory_transfer_lines` (`transfer_id`);

-- ─── Charge capture (gap D) ─────────────────────────────────────────────────
-- Link POU events to billing line items so we can compute leakage.
ALTER TABLE `point_of_use_events` ADD COLUMN `invoice_item_id` text;
ALTER TABLE `point_of_use_events` ADD COLUMN `charge_status` text NOT NULL DEFAULT 'UNCHARGED'; -- UNCHARGED | CHARGED | NON_BILLABLE
CREATE INDEX IF NOT EXISTS `point_of_use_events_invoice_item_idx`
  ON `point_of_use_events` (`invoice_item_id`);
CREATE INDEX IF NOT EXISTS `point_of_use_events_charge_status_idx`
  ON `point_of_use_events` (`charge_status`);

-- ─── Recalls (gap F) ────────────────────────────────────────────────────────
CREATE TABLE `recalls` (
  `id` text PRIMARY KEY NOT NULL,
  `recall_number` text NOT NULL,                              -- internal: REC-2026-00001
  `manufacturer_recall_id` text,                              -- FDA / manufacturer ref
  `manufacturer_name` text,
  `notice_received_at` text,
  `classification` text,                                       -- CLASS_I | CLASS_II | CLASS_III
  `severity` text NOT NULL DEFAULT 'WARN',                     -- INFO | WARN | CRITICAL
  `hcpc_code` text,
  `manufacturer_number` text,
  `lot_numbers` text,                                          -- JSON array of affected lots (optional)
  `description` text NOT NULL,
  `action_required` text NOT NULL,                             -- QUARANTINE | RETURN | DESTROY | NOTIFY_PATIENT
  `state` text NOT NULL DEFAULT 'OPEN',                        -- OPEN | INVESTIGATING | CLOSED
  `closed_at` text,
  `closed_by_user_id` text,
  `created_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `recalls_state_idx` ON `recalls` (`state`);
CREATE INDEX `recalls_hcpc_idx` ON `recalls` (`hcpc_code`);
CREATE INDEX `recalls_severity_idx` ON `recalls` (`severity`);

-- Auto-populated by the recall intake service from inventory + POU rows.
CREATE TABLE `recall_affected_items` (
  `id` text PRIMARY KEY NOT NULL,
  `recall_id` text NOT NULL,
  `kind` text NOT NULL,                                        -- LAB_LOT | INVENTORY | POU_EVENT
  `subject_id` text NOT NULL,                                  -- lab_inventory_lots.id, etc.
  `hospital_id` text,
  `facility_id` text,
  `lot_number` text,
  `quantity_affected` integer,
  `patient_mrn` text,                                          -- only set for POU_EVENT
  `disposition` text,                                          -- QUARANTINED | RETURNED | DESTROYED | PATIENT_NOTIFIED | NOT_FOUND
  `dispositioned_at` text,
  `dispositioned_by_user_id` text,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `recall_affected_items_recall_idx` ON `recall_affected_items` (`recall_id`);
CREATE INDEX `recall_affected_items_subject_idx` ON `recall_affected_items` (`kind`, `subject_id`);

-- ─── Controlled-substance accountability (gap G) ────────────────────────────
ALTER TABLE `formulary_items` ADD COLUMN `dea_schedule` text;  -- NULL | II | III | IV | V

CREATE TABLE `controlled_substance_log` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `facility_id` text,
  `formulary_item_id` text,
  `hcpc_code` text,
  `dea_schedule` text,
  `event_type` text NOT NULL,                                  -- RECEIVE | DISPENSE | WASTE | TRANSFER | COUNT | DISCREPANCY
  `quantity` integer NOT NULL,                                 -- signed
  `quantity_after` integer,
  `patient_mrn` text,
  `encounter_id` text,
  `lot_number` text,
  `performed_by_user_id` text NOT NULL,
  `witnessed_by_user_id` text,                                 -- required for DISPENSE/WASTE of Schedule II
  `notes` text,
  `occurred_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `controlled_substance_log_hospital_idx` ON `controlled_substance_log` (`hospital_id`);
CREATE INDEX `controlled_substance_log_item_idx` ON `controlled_substance_log` (`formulary_item_id`);
CREATE INDEX `controlled_substance_log_event_idx` ON `controlled_substance_log` (`event_type`);
CREATE INDEX `controlled_substance_log_occurred_idx` ON `controlled_substance_log` (`occurred_at`);

-- ─── Substitution audit log (gap H) ─────────────────────────────────────────
CREATE TABLE `substitution_audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text,
  `from_hcpc_code` text NOT NULL,
  `to_hcpc_code` text NOT NULL,
  `context_type` text NOT NULL,                                -- ORDER_CREATE | BACKORDER | REQUISITION
  `context_id` text,                                            -- order id, backorder id, requisition id
  `reason` text,
  `approver_user_id` text,
  `substituted_by_user_id` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `substitution_audit_log_hospital_idx` ON `substitution_audit_log` (`hospital_id`);
CREATE INDEX `substitution_audit_log_context_idx` ON `substitution_audit_log` (`context_type`, `context_id`);
CREATE INDEX `substitution_audit_log_from_hcpc_idx` ON `substitution_audit_log` (`from_hcpc_code`);

-- ─── Vendor scorecard snapshots (gap J) ─────────────────────────────────────
-- Monthly rollup written by nightly cron. One row per (vendor × month).
CREATE TABLE `vendor_scorecard_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `vendor_id` text NOT NULL,
  `hospital_id` text,                                          -- null = platform-wide; set = per-hospital roll-up
  `fiscal_year` integer NOT NULL,
  `fiscal_period` text NOT NULL,                               -- M01..M12 or Q1..Q4
  `pos_received` integer NOT NULL DEFAULT 0,                   -- # POs with at least one GR
  `pos_total` integer NOT NULL DEFAULT 0,
  `on_time_pct` real,                                          -- delivered_at <= eta_at / received
  `fill_rate_pct` real,                                        -- received_qty / ordered_qty
  `defect_rate_pct` real,                                      -- DAMAGED + WRONG_ITEM lines / total lines
  `invoice_match_accuracy_pct` real,                           -- 3-way matches / total invoices
  `avg_lead_time_days` real,                                   -- avg(shipped_at - po.created_at)
  `total_spend_usd` real,
  `computed_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `vendor_scorecard_snapshots_uk`
  ON `vendor_scorecard_snapshots` (`vendor_id`, `hospital_id`, `fiscal_year`, `fiscal_period`);
CREATE INDEX `vendor_scorecard_snapshots_vendor_idx` ON `vendor_scorecard_snapshots` (`vendor_id`);
CREATE INDEX `vendor_scorecard_snapshots_period_idx`
  ON `vendor_scorecard_snapshots` (`fiscal_year`, `fiscal_period`);

-- ─── Hospital forecast runs (gap I) ─────────────────────────────────────────
-- Cached projection results for hospital-side forecasting (avoids re-running
-- the trailing-12-month walk every page load).
CREATE TABLE `hospital_forecast_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `run_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `horizon_months` integer NOT NULL DEFAULT 3,
  `lookback_months` integer NOT NULL DEFAULT 12,
  `results_json` text NOT NULL,                                -- serialized forecast rows
  `created_by_user_id` text
);
CREATE INDEX `hospital_forecast_runs_hospital_idx` ON `hospital_forecast_runs` (`hospital_id`);
CREATE INDEX `hospital_forecast_runs_run_at_idx` ON `hospital_forecast_runs` (`run_at`);

-- Migration 0020 — Hospital procurement workflow closure.
--
-- Closes 6 gaps in the dept→requisition→PO→receive→invoice→GL flow:
--   1. Department procurement metadata (costCenter, glCode, serviceLine)
--   2. Budgets table (period × dept/cost-center × amount + counters)
--   3. PO enrichment (requisitionId backref, hospitalId, totals, status)
--   4. PO transmission (method, state, log, vendor preference)
--   5. (no schema change — dashboard is query-only)
--   6. GL ledger (gl_entries, append-only)

-- ─── Gap 1 — Department metadata ────────────────────────────────────────────
ALTER TABLE `hospital_departments` ADD COLUMN `cost_center` text;
ALTER TABLE `hospital_departments` ADD COLUMN `gl_code` text;
ALTER TABLE `hospital_departments` ADD COLUMN `service_line` text;
CREATE INDEX IF NOT EXISTS `hospital_departments_cost_center_idx`
  ON `hospital_departments` (`cost_center`);

-- ─── Gap 2 — Budgets ────────────────────────────────────────────────────────
-- One budget row per (hospital, fiscal_year, department_id [or cost_center], category).
-- amount_usd is the cap; committed_usd grows as requisitions are SUBMITTED;
-- consumed_usd grows as POs are RECEIVED (or invoices APPROVED — pick at
-- service layer). Both update on requisition cancel/reject to roll back.
CREATE TABLE `hospital_budgets` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `fiscal_year` integer NOT NULL,                -- e.g. 2026
  `period` text NOT NULL DEFAULT 'ANNUAL',       -- ANNUAL | Q1 | Q2 | Q3 | Q4 | M01..M12
  `department_id` text,                          -- nullable: dept-scoped OR cost-center-scoped
  `cost_center` text,                            -- denormalized for fast filter
  `category` text,                               -- optional: scoped to a spend category (DME, Lab, etc.)
  `amount_usd` real NOT NULL,
  `committed_usd` real NOT NULL DEFAULT 0,
  `consumed_usd` real NOT NULL DEFAULT 0,
  `notes` text,
  `created_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `hospital_budgets_hospital_year_idx`
  ON `hospital_budgets` (`hospital_id`, `fiscal_year`);
CREATE INDEX `hospital_budgets_department_idx`
  ON `hospital_budgets` (`department_id`);
CREATE INDEX `hospital_budgets_cost_center_idx`
  ON `hospital_budgets` (`cost_center`);

-- Audit log for every budget mutation (set / commit / consume / refund).
-- Mirrors the requisition/PO history pattern. Append-only.
CREATE TABLE `hospital_budget_history` (
  `id` text PRIMARY KEY NOT NULL,
  `budget_id` text NOT NULL,
  `event` text NOT NULL,                          -- SET | COMMIT | RELEASE | CONSUME | REFUND | ADJUST
  `delta_usd` real NOT NULL,                      -- signed
  `source_type` text,                             -- REQUISITION | PO | GR | INVOICE | MANUAL
  `source_id` text,
  `note` text,
  `by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `hospital_budget_history_budget_idx`
  ON `hospital_budget_history` (`budget_id`);
CREATE INDEX `hospital_budget_history_source_idx`
  ON `hospital_budget_history` (`source_type`, `source_id`);

-- Track which budget a requisition consumed against (for rollback).
ALTER TABLE `requisitions` ADD COLUMN `budget_id` text;
ALTER TABLE `requisitions` ADD COLUMN `cost_center` text;
CREATE INDEX IF NOT EXISTS `requisitions_budget_idx`
  ON `requisitions` (`budget_id`);

-- ─── Gap 3 — PO enrichment ──────────────────────────────────────────────────
-- The legacy purchase_orders schema is just a static PDF export. Add fields
-- so a PO is a first-class procurement artifact backed by a requisition.
ALTER TABLE `purchase_orders` ADD COLUMN `hospital_id` text;
ALTER TABLE `purchase_orders` ADD COLUMN `requisition_id` text;
ALTER TABLE `purchase_orders` ADD COLUMN `total_usd` real;
ALTER TABLE `purchase_orders` ADD COLUMN `currency` text DEFAULT 'USD';
ALTER TABLE `purchase_orders` ADD COLUMN `needed_by_date` text;
ALTER TABLE `purchase_orders` ADD COLUMN `notes` text;
ALTER TABLE `purchase_orders` ADD COLUMN `created_by_user_id` text;
CREATE INDEX IF NOT EXISTS `purchase_orders_hospital_idx`
  ON `purchase_orders` (`hospital_id`);
CREATE INDEX IF NOT EXISTS `purchase_orders_requisition_idx`
  ON `purchase_orders` (`requisition_id`);

-- Add unit price + line totals + backref to requisition_items.
ALTER TABLE `purchase_order_items` ADD COLUMN `hcpc_code` text;
ALTER TABLE `purchase_order_items` ADD COLUMN `requisition_item_id` text;
ALTER TABLE `purchase_order_items` ADD COLUMN `unit_price_usd` real;
ALTER TABLE `purchase_order_items` ADD COLUMN `line_total_usd` real;
CREATE INDEX IF NOT EXISTS `purchase_order_items_req_item_idx`
  ON `purchase_order_items` (`requisition_item_id`);

-- ─── Gap 4 — PO transmission ────────────────────────────────────────────────
-- Per-PO transmission state machine: NOT_SENT → SENDING → SENT → ACKED.
-- Errors push to FAILED; the transmission service may retry.
ALTER TABLE `purchase_orders` ADD COLUMN `transmission_method` text;          -- EDI | API | PUNCHOUT | EMAIL | PORTAL
ALTER TABLE `purchase_orders` ADD COLUMN `transmission_state` text NOT NULL DEFAULT 'NOT_SENT';
ALTER TABLE `purchase_orders` ADD COLUMN `transmitted_at` text;
ALTER TABLE `purchase_orders` ADD COLUMN `vendor_ack_at` text;
ALTER TABLE `purchase_orders` ADD COLUMN `transmission_attempts` integer NOT NULL DEFAULT 0;
ALTER TABLE `purchase_orders` ADD COLUMN `transmission_error` text;
CREATE INDEX IF NOT EXISTS `purchase_orders_transmission_idx`
  ON `purchase_orders` (`transmission_state`);

-- Append-only log of every transmission attempt.
CREATE TABLE `po_transmission_log` (
  `id` text PRIMARY KEY NOT NULL,
  `purchase_order_id` text NOT NULL,
  `attempt_number` integer NOT NULL,
  `method` text NOT NULL,                          -- EDI | API | PUNCHOUT | EMAIL | PORTAL
  `state` text NOT NULL,                           -- SENDING | SENT | ACKED | FAILED
  `endpoint` text,                                 -- URL / email / EDI partner ID — for audit
  `request_payload_sample` text,                   -- truncated (first 500 chars)
  `response_status` text,
  `response_body_sample` text,                     -- truncated (first 500 chars)
  `error_message` text,
  `duration_ms` integer,
  `started_at` text NOT NULL,
  `finished_at` text
);
CREATE INDEX `po_transmission_log_po_idx` ON `po_transmission_log` (`purchase_order_id`);
CREATE INDEX `po_transmission_log_state_idx` ON `po_transmission_log` (`state`);

-- Per-vendor preference for how POs should be sent.
ALTER TABLE `vendors` ADD COLUMN `preferred_po_transmission_method` text DEFAULT 'EMAIL';
ALTER TABLE `vendors` ADD COLUMN `po_transmission_endpoint` text;             -- email addr, EDI partner ID, API URL, etc.
ALTER TABLE `vendors` ADD COLUMN `po_transmission_credentials` text;          -- JSON (api_key, ediQualifier, etc.)

-- ─── Gap 6 — GL ledger ──────────────────────────────────────────────────────
-- Append-only journal. Each row is one side of a journal entry (debit OR
-- credit). A balanced transaction emits both rows together with the same
-- transaction_id. Source types: PO_COMMIT, GR_RECEIPT, INVOICE_APPROVE,
-- INVOICE_PAY, ADJUSTMENT.
CREATE TABLE `gl_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `transaction_id` text NOT NULL,                  -- pairs debit + credit rows
  `hospital_id` text NOT NULL,
  `fiscal_year` integer NOT NULL,
  `fiscal_period` text NOT NULL,                   -- M01..M12 or Q1..Q4
  `account_code` text NOT NULL,                    -- chart-of-accounts code (e.g. 5300-DME)
  `cost_center` text,                              -- denormalized for fast roll-up
  `department_id` text,
  `debit_usd` real NOT NULL DEFAULT 0,
  `credit_usd` real NOT NULL DEFAULT 0,
  `source_type` text NOT NULL,                     -- PO_COMMIT | GR_RECEIPT | INVOICE_APPROVE | INVOICE_PAY | ADJUSTMENT
  `source_id` text NOT NULL,                       -- PO id, GR id, invoice id
  `memo` text,
  `posted_at` text NOT NULL,
  `posted_by_user_id` text,
  `exported_at` text,                              -- set when picked up by ERP connector
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `gl_entries_txn_idx` ON `gl_entries` (`transaction_id`);
CREATE INDEX `gl_entries_hospital_period_idx`
  ON `gl_entries` (`hospital_id`, `fiscal_year`, `fiscal_period`);
CREATE INDEX `gl_entries_account_idx` ON `gl_entries` (`account_code`);
CREATE INDEX `gl_entries_source_idx` ON `gl_entries` (`source_type`, `source_id`);
CREATE INDEX `gl_entries_export_idx` ON `gl_entries` (`exported_at`);

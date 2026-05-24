-- 0012_requisitions.sql
-- Enterprise requisition workflow (separate from orders), approval rules
-- engine, and requisition templates.

CREATE TABLE `requisitions` (
  `id` text PRIMARY KEY NOT NULL,
  `requisition_number` text NOT NULL,
  `hospital_id` text NOT NULL,
  `facility_id` text,
  `department_id` text,
  `requested_by_user_id` text NOT NULL,
  `title` text NOT NULL,
  `justification` text,
  `status` text NOT NULL DEFAULT 'DRAFT',
  `priority` text NOT NULL DEFAULT 'NORMAL',
  `needed_by_date` text,
  `estimated_total_usd` real,
  `approver_user_id` text,
  `approved_at` text,
  `rejected_reason` text,
  `converted_at` text,
  `converted_order_ids` text,
  `payor_id` text,
  `prior_auth_id` text,
  `template_id` text,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `requisitions_hospital_idx` ON `requisitions` (`hospital_id`);
CREATE INDEX `requisitions_status_idx` ON `requisitions` (`status`);
CREATE INDEX `requisitions_requester_idx` ON `requisitions` (`requested_by_user_id`);
CREATE INDEX `requisitions_approver_idx` ON `requisitions` (`approver_user_id`);
CREATE INDEX `requisitions_needed_by_idx` ON `requisitions` (`needed_by_date`);

CREATE TABLE `requisition_items` (
  `id` text PRIMARY KEY NOT NULL,
  `requisition_id` text NOT NULL,
  `formulary_item_id` text,
  `hcpc_code` text NOT NULL,
  `description` text NOT NULL,
  `quantity` integer NOT NULL,
  `estimated_unit_price_usd` real,
  `preferred_vendor_id` text,
  `justification` text,
  `substitutes_allowed` integer NOT NULL DEFAULT 1,
  `approval_status` text NOT NULL DEFAULT 'PENDING',
  `is_off_formulary` integer NOT NULL DEFAULT 0,
  `requires_prior_auth` integer NOT NULL DEFAULT 0,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `requisition_items_req_idx` ON `requisition_items` (`requisition_id`);
CREATE INDEX `requisition_items_hcpc_idx` ON `requisition_items` (`hcpc_code`);

CREATE TABLE `requisition_history` (
  `id` text PRIMARY KEY NOT NULL,
  `requisition_id` text NOT NULL,
  `action` text NOT NULL,
  `from_status` text,
  `to_status` text,
  `by_user_id` text,
  `comment` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `requisition_history_req_idx` ON `requisition_history` (`requisition_id`);

CREATE TABLE `approval_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `trigger_type` text NOT NULL,
  `priority` integer NOT NULL DEFAULT 100,
  `is_active` integer NOT NULL DEFAULT 1,
  `conditions_json` text NOT NULL,
  `approver_json` text NOT NULL,
  `is_terminal` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `approval_rules_hospital_idx` ON `approval_rules` (`hospital_id`);
CREATE INDEX `approval_rules_trigger_idx` ON `approval_rules` (`trigger_type`);
CREATE INDEX `approval_rules_priority_idx` ON `approval_rules` (`priority`);

CREATE TABLE `requisition_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `facility_id` text,
  `department_id` text,
  `name` text NOT NULL,
  `description` text,
  `category` text,
  `default_priority` text NOT NULL DEFAULT 'NORMAL',
  `is_active` integer NOT NULL DEFAULT 1,
  `times_used` integer NOT NULL DEFAULT 0,
  `created_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `requisition_templates_hospital_idx` ON `requisition_templates` (`hospital_id`);
CREATE INDEX `requisition_templates_facility_idx` ON `requisition_templates` (`facility_id`);

CREATE TABLE `requisition_template_items` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `hcpc_code` text NOT NULL,
  `description` text NOT NULL,
  `default_quantity` integer NOT NULL DEFAULT 1,
  `preferred_vendor_id` text,
  `formulary_item_id` text,
  `notes` text,
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `requisition_template_items_tpl_idx` ON `requisition_template_items` (`template_id`);

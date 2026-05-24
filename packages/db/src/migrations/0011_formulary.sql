-- 0011_formulary.sql
-- Item Master / Formulary: the authoritative whitelist of approved items
-- per hospital (and optionally per facility). Powers requisition validation,
-- preferred-vendor steering, max-unit-price guardrails, prior-auth flags,
-- restricted-item gates, and par-level reorder triggers.

CREATE TABLE `formulary_items` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `facility_id` text,
  `hcpc_code` text NOT NULL,
  `description` text NOT NULL,
  `category` text,
  `preferred_vendor_id` text,
  `secondary_vendor_id` text,
  `max_unit_price_usd` real,
  `requires_prior_auth` integer NOT NULL DEFAULT 0,
  `is_restricted` integer NOT NULL DEFAULT 0,
  `restriction_reason` text,
  `par_level` integer,
  `reorder_quantity` integer,
  `unit_of_measure` text,
  `status` text NOT NULL DEFAULT 'ACTIVE',
  `notes` text,
  `created_by_user_id` text,
  `updated_by_user_id` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `formulary_items_uq` ON `formulary_items` (`hospital_id`, `facility_id`, `hcpc_code`);
CREATE INDEX `formulary_items_hospital_idx` ON `formulary_items` (`hospital_id`);
CREATE INDEX `formulary_items_facility_idx` ON `formulary_items` (`facility_id`);
CREATE INDEX `formulary_items_hcpc_idx` ON `formulary_items` (`hcpc_code`);
CREATE INDEX `formulary_items_status_idx` ON `formulary_items` (`status`);

CREATE TABLE `formulary_substitutes` (
  `id` text PRIMARY KEY NOT NULL,
  `formulary_item_id` text NOT NULL,
  `substitute_hcpc_code` text NOT NULL,
  `substitute_description` text,
  `priority` integer NOT NULL DEFAULT 10,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `formulary_substitutes_uq` ON `formulary_substitutes` (`formulary_item_id`, `substitute_hcpc_code`);
CREATE INDEX `formulary_substitutes_item_idx` ON `formulary_substitutes` (`formulary_item_id`);

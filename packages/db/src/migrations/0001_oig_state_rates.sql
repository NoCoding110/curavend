-- OIG LEIE exclusion list table
CREATE TABLE `oig_exclusion_list` (
	`id` text PRIMARY KEY NOT NULL,
	`npi` text,
	`ein` text,
	`last_name` text,
	`first_name` text,
	`business_name` text,
	`general` text,
	`specialty` text,
	`upin` text,
	`dob` text,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`excltype` text,
	`excldate` text,
	`reindate` text,
	`waiverdate` text,
	`waiverstate` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oig_npi_idx` ON `oig_exclusion_list` (`npi`);
--> statement-breakpoint
CREATE INDEX `oig_ein_idx` ON `oig_exclusion_list` (`ein`);
--> statement-breakpoint
CREATE INDEX `oig_last_name_idx` ON `oig_exclusion_list` (`last_name`);
--> statement-breakpoint
CREATE INDEX `oig_business_name_idx` ON `oig_exclusion_list` (`business_name`);
--> statement-breakpoint

-- State-specific DME fee schedule rates
CREATE TABLE `state_rate_schedule_items` (
	`id` text PRIMARY KEY NOT NULL,
	`state_code` text NOT NULL,
	`hcpc_code` text NOT NULL,
	`description` text,
	`rate` real NOT NULL,
	`rate_type` text,
	`effective_date` text,
	`expiry_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `state_rate_state_hcpc_idx` ON `state_rate_schedule_items` (`state_code`, `hcpc_code`);
--> statement-breakpoint
CREATE INDEX `state_rate_hcpc_idx` ON `state_rate_schedule_items` (`hcpc_code`);

CREATE TABLE `consignment_activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`consignment_closet_item_id` text NOT NULL,
	`change_type` text NOT NULL,
	`field` text NOT NULL,
	`previous_value` integer,
	`new_value` integer,
	`change` integer,
	`timestamp` text NOT NULL,
	`performed_by` text NOT NULL,
	`hospital_vendor_id` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consignment_activity_logs_item_id_idx` ON `consignment_activity_logs` (`consignment_closet_item_id`);--> statement-breakpoint
CREATE TABLE `consignment_closet_items` (
	`id` text PRIMARY KEY NOT NULL,
	`consignment_closet_id` text NOT NULL,
	`hcpc_code` text NOT NULL,
	`description` text,
	`manufacturer_item_number` text,
	`manufacturer_name` text,
	`unit_of_measurement` text,
	`par` integer,
	`on_hand` integer,
	`variance_reason` text DEFAULT 'Missing',
	`location` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consignment_closet_items_closet_id_idx` ON `consignment_closet_items` (`consignment_closet_id`);--> statement-breakpoint
CREATE INDEX `consignment_closet_items_hcpc_desc_idx` ON `consignment_closet_items` (`hcpc_code`,`description`);--> statement-breakpoint
CREATE TABLE `consignment_closets` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`super_vendor_id` text,
	`hospital_id` text NOT NULL,
	`provider_id` text,
	`s3key` text,
	`department_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consignment_closets_vendor_id_idx` ON `consignment_closets` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `consignment_closets_super_vendor_id_idx` ON `consignment_closets` (`super_vendor_id`);--> statement-breakpoint
CREATE INDEX `consignment_closets_hospital_id_idx` ON `consignment_closets` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `consignment_closets_provider_id_idx` ON `consignment_closets` (`provider_id`);--> statement-breakpoint
CREATE TABLE `cycle_count_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`consignment_closet_item_id` text NOT NULL,
	`location` text,
	`expected_quantity` integer,
	`counted_quantity` integer,
	`variance_reason` text,
	`counter_id` text NOT NULL,
	`count_date` text NOT NULL,
	`next_scheduled_count_date` text,
	`is_archived` integer DEFAULT 0,
	`hospital_vendor_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cycle_count_reports_item_date_idx` ON `cycle_count_reports` (`consignment_closet_item_id`,`count_date`);--> statement-breakpoint
CREATE TABLE `usage_rate_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`consignment_closet_item_id` text NOT NULL,
	`daily_usage_rate` real,
	`weekly_usage_rate` real,
	`monthly_usage_rate` real,
	`calculation_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_rate_metrics_item_id_idx` ON `usage_rate_metrics` (`consignment_closet_item_id`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`s3key` text,
	`name` text,
	`vendor_id` text,
	`super_vendor_id` text,
	`provider_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contracts_vendor_id_idx` ON `contracts` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `contracts_super_vendor_id_idx` ON `contracts` (`super_vendor_id`);--> statement-breakpoint
CREATE INDEX `contracts_provider_id_idx` ON `contracts` (`provider_id`);--> statement-breakpoint
CREATE TABLE `custom_fee_schedule_items` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_schedule_id` text NOT NULL,
	`hcpc_code` text NOT NULL,
	`description` text,
	`rate` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `custom_fee_schedule_items_schedule_id_idx` ON `custom_fee_schedule_items` (`fee_schedule_id`);--> statement-breakpoint
CREATE TABLE `custom_fee_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`s3key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `custom_fee_schedules_vendor_id_idx` ON `custom_fee_schedules` (`vendor_id`);--> statement-breakpoint
CREATE TABLE `medicare_fee_schedule_items` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_schedule_id` text NOT NULL,
	`hcpc_code` text NOT NULL,
	`description` text,
	`floor` real,
	`ceiling` real,
	`state_rate_schedules` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `medicare_fee_schedule_items_schedule_id_idx` ON `medicare_fee_schedule_items` (`fee_schedule_id`);--> statement-breakpoint
CREATE INDEX `medicare_fee_schedule_items_schedule_hcpc_idx` ON `medicare_fee_schedule_items` (`fee_schedule_id`,`hcpc_code`);--> statement-breakpoint
CREATE TABLE `medicare_fee_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`s3key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hospitals` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`user_id` integer,
	`name` text,
	`contact` text,
	`contact_person` text,
	`contact_person_title` text,
	`street_address` text,
	`state` text,
	`city` text,
	`zip` text,
	`provider_id` text,
	`subscription_plan_id` text,
	`fhir_base_url` text,
	`scope` text,
	`access_token` text,
	`refresh_token` text,
	`token_type` text,
	`expires_in` integer,
	`last_refreshed_at` text,
	`modified_orders` integer DEFAULT 0,
	`in_process_orders` integer DEFAULT 0,
	`cancelled_orders` integer DEFAULT 0,
	`completed_orders` integer DEFAULT 0,
	`unread_order_count` integer DEFAULT 0,
	`notification_settings` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hospitals_email_unique` ON `hospitals` (`email`);--> statement-breakpoint
CREATE INDEX `hospitals_email_idx` ON `hospitals` (`email`);--> statement-breakpoint
CREATE INDEX `hospitals_provider_id_idx` ON `hospitals` (`provider_id`);--> statement-breakpoint
CREATE TABLE `hospital_vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`hospital_id` text NOT NULL,
	`vendor_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`state` text,
	`contract_rate` real,
	`custom_fee_schedule_id` text,
	`consignment_closet_id` text,
	`contract_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hospital_vendors_hospital_id_idx` ON `hospital_vendors` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `hospital_vendors_vendor_id_idx` ON `hospital_vendors` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `hospital_vendors_provider_id_idx` ON `hospital_vendors` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hospital_vendors_hospital_vendor_unique` ON `hospital_vendors` (`hospital_id`,`vendor_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`title` text,
	`contact` text,
	`street_address` text,
	`state` text,
	`city` text,
	`zip` text,
	`user_type` text NOT NULL,
	`role` text NOT NULL,
	`user_status` text DEFAULT 'ACTIVE' NOT NULL,
	`account_manager_id` text,
	`step` text DEFAULT 'ACCOUNT_CREATED' NOT NULL,
	`oig_status` text,
	`approval_status` text DEFAULT 'PENDING',
	`has_agreed_to_phi_access` integer DEFAULT 0,
	`must_change_password` integer DEFAULT 1,
	`mfa_secret` text,
	`mfa_enabled` integer DEFAULT 0,
	`provider_id` text,
	`hospital_id` text,
	`vendor_id` text,
	`super_vendor_id` text,
	`subscription_plan_id` text,
	`current_logged_in_at` text,
	`last_logged_in_at` text,
	`timed_out` integer DEFAULT 0,
	`last_function_accessed` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_account_manager_id_idx` ON `users` (`account_manager_id`);--> statement-breakpoint
CREATE INDEX `users_provider_id_idx` ON `users` (`provider_id`);--> statement-breakpoint
CREATE INDEX `users_hospital_id_idx` ON `users` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `users_vendor_id_idx` ON `users` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `users_super_vendor_id_idx` ON `users` (`super_vendor_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ein` text,
	`physical_street_address` text,
	`physical_city` text,
	`physical_state` text,
	`physical_zip` text,
	`mailing_street_address` text,
	`mailing_city` text,
	`mailing_state` text,
	`mailing_zip` text,
	`billing_street_address` text,
	`billing_city` text,
	`billing_state` text,
	`billing_zip` text,
	`primary_account_name` text,
	`primary_account_email` text,
	`primary_account_contact` text,
	`primary_account_title` text,
	`accounts_payable` text,
	`supply_chain` text,
	`other_contact` text,
	`other_contacts` text,
	`track` text,
	`subscription_plan_id` text,
	`billing_cycle` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`vendor_user_id` integer,
	`ein` text,
	`name` text,
	`contact` text,
	`contact_person` text,
	`contact_person_middle_name` text,
	`contact_person_last_name` text,
	`contact_person_title` text,
	`street_address` text,
	`city` text,
	`state` text,
	`zip` text,
	`website` text,
	`tax_id` text,
	`billing_email` text,
	`billing_name` text,
	`billing_contact` text,
	`billing_street_address` text,
	`billing_city` text,
	`billing_state` text,
	`billing_zip` text,
	`mailing_street_address` text,
	`mailing_city` text,
	`mailing_state` text,
	`mailing_zip` text,
	`logo` text,
	`accrediting_body` text,
	`accreditation_expiry_date` text,
	`state_level_license` text,
	`state_level_license_number` text,
	`state_level_license_expiry_date` text,
	`liability_insurance_provider` text,
	`liability_insurance_policy_number` text,
	`liability_insurance_expiry_date` text,
	`blanket_purchase_order_number` text,
	`erp_account_number` text,
	`super_vendor_id` text,
	`subscription_plan_id` text,
	`track` text,
	`modified_orders` integer DEFAULT 0,
	`in_process_orders` integer DEFAULT 0,
	`cancelled_orders` integer DEFAULT 0,
	`completed_orders` integer DEFAULT 0,
	`unread_order_count` integer DEFAULT 0,
	`notification_settings` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_email_unique` ON `vendors` (`email`);--> statement-breakpoint
CREATE INDEX `vendors_email_idx` ON `vendors` (`email`);--> statement-breakpoint
CREATE INDEX `vendors_super_vendor_id_idx` ON `vendors` (`super_vendor_id`);--> statement-breakpoint
CREATE TABLE `super_vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ein` text,
	`physical_street_address` text,
	`physical_city` text,
	`physical_state` text,
	`physical_zip` text,
	`mailing_street_address` text,
	`mailing_city` text,
	`mailing_state` text,
	`mailing_zip` text,
	`billing_street_address` text,
	`billing_city` text,
	`billing_state` text,
	`billing_zip` text,
	`primary_account_name` text,
	`primary_account_email` text,
	`primary_account_contact` text,
	`primary_account_title` text,
	`accounts_payable` text,
	`supply_chain` text,
	`other_contact` text,
	`other_contacts` text,
	`subscription_plan_id` text,
	`billing_cycle` text,
	`notification_settings` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`order_sub_status` text DEFAULT 'NEW_ORDER' NOT NULL,
	`order_sub_status_history` text,
	`decline_reason` text,
	`modify_reason` text,
	`epic_order_status` text,
	`intent` text,
	`priority` text DEFAULT 'routine',
	`requester` text,
	`requester_resource` text,
	`authored_on` text,
	`subject_resource` text,
	`patient_id` text,
	`patient_name` text,
	`patient_last_name` text,
	`patient_email` text,
	`patient_gender` text,
	`patient_birth_date` text,
	`performer_resource` text,
	`performer` text,
	`insurance_resource` text,
	`insurance` text,
	`insurance_id` text,
	`auth_provider` text,
	`ref_provider` text,
	`sign_date_time` text,
	`department` text,
	`department_number` text,
	`facility` text,
	`facility_number` text,
	`diagnosis` text,
	`icd10` text,
	`extremity` text,
	`comment` text,
	`room` text,
	`bed` text,
	`location` text,
	`insurance_pay` text,
	`assessed_by` text,
	`assessment_comment` text,
	`assessment_date_time` text,
	`delivered_by` text,
	`delivery_date_time` text,
	`delivery_comment` text,
	`delivery_sign_attachment` text,
	`delivery_signed_at` text,
	`delivery_accepted_by` text,
	`delivery_guarantor_name` text,
	`agreement_send_by` text DEFAULT 'NONE',
	`attachments` text,
	`encounter_attachment` text,
	`original_order_attachment` text,
	`modify_invoice_reason` text,
	`purchase_order_number` text,
	`is_dispensed` integer DEFAULT 0,
	`vendor_id` text,
	`vendor_reference_number` text,
	`vendor_opened` integer DEFAULT 0,
	`hospital_id` text NOT NULL,
	`provider_id` text,
	`super_vendor_id` text,
	`room_id` text,
	`invoice_id` text,
	`purchase_order_id` text,
	`replaces_order_id` text,
	`notified_hospital` integer DEFAULT 0,
	`changed_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_vendor_id_idx` ON `orders` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `orders_hospital_id_idx` ON `orders` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `orders_provider_id_idx` ON `orders` (`provider_id`);--> statement-breakpoint
CREATE INDEX `orders_super_vendor_id_idx` ON `orders` (`super_vendor_id`);--> statement-breakpoint
CREATE INDEX `orders_purchase_order_id_idx` ON `orders` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_order_sub_status_idx` ON `orders` (`order_sub_status`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_vendor_sign_dt_idx` ON `orders` (`vendor_id`,`sign_date_time`);--> statement-breakpoint
CREATE INDEX `orders_vendor_created_idx` ON `orders` (`vendor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_hospital_sign_dt_idx` ON `orders` (`hospital_id`,`sign_date_time`);--> statement-breakpoint
CREATE INDEX `orders_hospital_created_idx` ON `orders` (`hospital_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`code` text,
	`quantity` integer,
	`description` text,
	`modified` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`description` text NOT NULL,
	`changed_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_history_order_id_idx` ON `order_history` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_history_order_created_idx` ON `order_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text,
	`due_date` text,
	`total` real,
	`attachment` text,
	`number` text NOT NULL,
	`status` text DEFAULT 'ORDER_COMPLETED' NOT NULL,
	`hospital_id` text NOT NULL,
	`vendor_id` text NOT NULL,
	`provider_id` text,
	`super_vendor_id` text,
	`order_id` text,
	`reason_for_no_invoice` text,
	`payment_payee_name` text,
	`payment_amount_due` text,
	`payment_amount_paid` text,
	`payment_date` text,
	`payment_reference` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoices_hospital_id_idx` ON `invoices` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `invoices_vendor_id_idx` ON `invoices` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `invoices_provider_id_idx` ON `invoices` (`provider_id`);--> statement-breakpoint
CREATE INDEX `invoices_super_vendor_id_idx` ON `invoices` (`super_vendor_id`);--> statement-breakpoint
CREATE INDEX `invoices_order_id_idx` ON `invoices` (`order_id`);--> statement-breakpoint
CREATE INDEX `invoices_vendor_date_created_idx` ON `invoices` (`vendor_id`,`date`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoices_hospital_date_created_idx` ON `invoices` (`hospital_id`,`date`,`created_at`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`code` text,
	`quantity` integer,
	`description` text,
	`unit_price` real,
	`spend` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_id_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`description` text,
	`manufacturer_number` text,
	`product_description` text,
	`quantity` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_order_items_po_id_idx` ON `purchase_order_items` (`purchase_order_id`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`date` text,
	`status` text DEFAULT 'ORDER_COMPLETED' NOT NULL,
	`file_key` text,
	`file_base64` text,
	`file_name` text,
	`vendor_id` text NOT NULL,
	`super_vendor_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_orders_vendor_id_idx` ON `purchase_orders` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `purchase_orders_super_vendor_id_idx` ON `purchase_orders` (`super_vendor_id`);--> statement-breakpoint
CREATE INDEX `purchase_orders_vendor_date_created_idx` ON `purchase_orders` (`vendor_id`,`date`,`created_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`hospital_id` text NOT NULL,
	`hospital_unread_count` integer DEFAULT 0 NOT NULL,
	`vendor_id` text NOT NULL,
	`vendor_unread_count` integer DEFAULT 0 NOT NULL,
	`most_recent_message_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_hospital_id_idx` ON `rooms` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `rooms_vendor_id_idx` ON `rooms` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `rooms_hospital_updated_idx` ON `rooms` (`hospital_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `rooms_vendor_updated_idx` ON `rooms` (`vendor_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text,
	`attachment_id` text,
	`sender_user_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`receiver_user_id` text,
	`receiver_user_type` text NOT NULL,
	`room_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_room_id_idx` ON `messages` (`room_id`);--> statement-breakpoint
CREATE INDEX `messages_room_created_idx` ON `messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_sender_user_id_idx` ON `messages` (`sender_user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT 0,
	`receiver_id` text NOT NULL,
	`redirect_id` text,
	`redirect_to` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_receiver_id_idx` ON `notifications` (`receiver_id`);--> statement-breakpoint
CREATE INDEX `notifications_receiver_created_idx` ON `notifications` (`receiver_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text,
	`attachment_id` text,
	`sender_user_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`support_ticket_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_ticket_messages_ticket_id_idx` ON `support_ticket_messages` (`support_ticket_id`);--> statement-breakpoint
CREATE INDEX `support_ticket_messages_ticket_created_idx` ON `support_ticket_messages` (`support_ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`owner_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`subject` text DEFAULT 'OTHER',
	`is_read` integer DEFAULT 0,
	`number` text,
	`closed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `support_tickets_owner_id_idx` ON `support_tickets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_updated_idx` ON `support_tickets` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`s3key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_vendor_id_idx` ON `inventory` (`vendor_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`hcpc_code` text NOT NULL,
	`description` text,
	`manufacturer_item_number` text,
	`manufacturer_name` text,
	`unit_of_measurement` text,
	`is_custom_fit` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_items_inventory_id_idx` ON `inventory_items` (`inventory_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_hcpc_desc_idx` ON `inventory_items` (`hcpc_code`,`description`);--> statement-breakpoint
CREATE TABLE `provider_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`s3key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_inventory_provider_id_idx` ON `provider_inventory` (`provider_id`);--> statement-breakpoint
CREATE TABLE `provider_inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`inventory_id` text,
	`hcpc_code` text,
	`description` text,
	`manufacturer_item_number` text,
	`manufacturer_name` text,
	`unit_of_measurement` text,
	`is_custom_fit` integer DEFAULT 0,
	`list_price` real,
	`discount_price` real,
	`supplier` text,
	`supplier_item_number` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_inventory_items_provider_id_idx` ON `provider_inventory_items` (`provider_id`);--> statement-breakpoint
CREATE INDEX `provider_inventory_items_provider_mfr_idx` ON `provider_inventory_items` (`provider_id`,`manufacturer_item_number`);--> statement-breakpoint
CREATE TABLE `features` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`restricted_to_roles` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stripe_payment_id` text,
	`amount` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_history_user_id_idx` ON `payment_history` (`user_id`);--> statement-breakpoint
CREATE TABLE `plan_features` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`feature_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_features_plan_id_idx` ON `plan_features` (`plan_id`);--> statement-breakpoint
CREATE INDEX `plan_features_feature_id_idx` ON `plan_features` (`feature_id`);--> statement-breakpoint
CREATE INDEX `plan_features_plan_feature_idx` ON `plan_features` (`plan_id`,`feature_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`stripe_price_id` text,
	`description` text,
	`add_on` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`stripe_subscription_id` text,
	`price_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`add_ons` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_user_id_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_plan_id_idx` ON `subscriptions` (`plan_id`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`name` text PRIMARY KEY NOT NULL,
	`current_value` integer DEFAULT 0 NOT NULL
);

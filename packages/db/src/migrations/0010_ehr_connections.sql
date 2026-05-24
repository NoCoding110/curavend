-- 0010_ehr_connections.sql
-- Multi-EHR adapter — generic FHIR ingest beyond Epic.
-- Cerner, Meditech, Athena, Allscripts, eCW, and generic FHIR R4.

CREATE TABLE `ehr_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `hospital_id` text NOT NULL,
  `name` text NOT NULL,
  `vendor` text NOT NULL,
  `fhir_base_url` text,
  `auth_mode` text NOT NULL,
  `auth_client_id` text,
  `auth_secret_env_ref` text,
  `shared_secret_env_ref` text,
  `api_key_env_ref` text,
  `webhook_secret_env_ref` text,
  `mapping_profile` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `last_success_at` text,
  `last_error_at` text,
  `last_error_message` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `ehr_connections_hospital_idx` ON `ehr_connections` (`hospital_id`);
CREATE INDEX `ehr_connections_vendor_idx` ON `ehr_connections` (`vendor`);

CREATE TABLE `ehr_ingest_log` (
  `id` text PRIMARY KEY NOT NULL,
  `connection_id` text NOT NULL,
  `resource_type` text,
  `resource_id` text,
  `payload_blob_key` text,
  `mapped_order_id` text,
  `status` text NOT NULL,
  `error_message` text,
  `received_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `ehr_ingest_log_conn_idx` ON `ehr_ingest_log` (`connection_id`);
CREATE INDEX `ehr_ingest_log_received_idx` ON `ehr_ingest_log` (`received_at`);

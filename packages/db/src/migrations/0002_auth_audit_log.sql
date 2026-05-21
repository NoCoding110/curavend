CREATE TABLE `auth_audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `user_email` text,
  `event` text NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `metadata` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `auth_audit_log_user_id_idx` ON `auth_audit_log` (`user_id`);
CREATE INDEX `auth_audit_log_event_idx` ON `auth_audit_log` (`event`);
CREATE INDEX `auth_audit_log_created_at_idx` ON `auth_audit_log` (`created_at`);

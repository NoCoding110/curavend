-- 0005_workflow_control_plane.sql
-- Adds ops-time controls to the workflow engine: custom sub-status,
-- termination, external-event signaling, history purge & search.

-- ─── Extend workflow_instances ──────────────────────────────────────────

ALTER TABLE `workflow_instances` ADD COLUMN `custom_status` text;
ALTER TABLE `workflow_instances` ADD COLUMN `terminated_by` text;
ALTER TABLE `workflow_instances` ADD COLUMN `terminated_at` text;
ALTER TABLE `workflow_instances` ADD COLUMN `terminate_reason` text;
ALTER TABLE `workflow_instances` ADD COLUMN `waiting_for_event` text;
ALTER TABLE `workflow_instances` ADD COLUMN `event_wait_expires_at` text;

-- ─── Workflow events (external signals to running workflows) ────────────

CREATE TABLE `workflow_events` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_instance_id` text NOT NULL,
  `event_name` text NOT NULL,
  `payload` text,
  `raised_by_user_id` text,
  `consumed_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `workflow_events_instance_idx` ON `workflow_events` (`workflow_instance_id`);
CREATE INDEX `workflow_events_name_unconsumed_idx`
  ON `workflow_events` (`workflow_instance_id`, `event_name`, `consumed_at`);

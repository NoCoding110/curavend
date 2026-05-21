-- Phase 5-7 additional schema

-- Consignment closet items — add par_level, on_hand if missing
ALTER TABLE consignment_closet_items ADD COLUMN par_level INTEGER DEFAULT 0;
ALTER TABLE consignment_closet_items ADD COLUMN on_hand INTEGER DEFAULT 0;

-- Cycle count reports
ALTER TABLE cycle_count_reports ADD COLUMN counted_by_user_id TEXT;
ALTER TABLE cycle_count_reports ADD COLUMN total_items INTEGER;
ALTER TABLE cycle_count_reports ADD COLUMN variance INTEGER;
ALTER TABLE cycle_count_reports ADD COLUMN notes TEXT;

-- Consignment activity logs
ALTER TABLE consignment_activity_logs ADD COLUMN action TEXT;
ALTER TABLE consignment_activity_logs ADD COLUMN quantity INTEGER;
ALTER TABLE consignment_activity_logs ADD COLUMN timestamp TEXT;

-- Seed subscription plans
INSERT OR IGNORE INTO plans (id, name, description, price, interval, created_at, updated_at) VALUES
  ('plan-free', 'Free', 'Basic access for small teams', 0, 'month', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('plan-standard', 'Standard', 'Standard features for growing teams', 99, 'month', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('plan-pro', 'Pro', 'Enterprise features + priority support', 299, 'month', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Seed features
INSERT OR IGNORE INTO features (id, key, description, created_at, updated_at) VALUES
  ('feat-orders', 'orders.unlimited', 'Unlimited orders', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('feat-ai', 'ai.parsing', 'AI-powered PDF order parsing', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('feat-reports', 'reports.advanced', 'Advanced analytics + PDF export', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('feat-api', 'api.access', 'API access for integrations', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

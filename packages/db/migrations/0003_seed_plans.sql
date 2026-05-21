-- Seed subscription plans + features
INSERT OR IGNORE INTO plans (id, name, description, price, currency, add_on, created_at, updated_at) VALUES
  ('plan-free', 'Free', 'Basic access for small teams', 0, 'USD', 0, '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('plan-standard', 'Standard', 'Standard features for growing teams', 99, 'USD', 0, '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('plan-pro', 'Pro', 'Enterprise features + priority support', 299, 'USD', 0, '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

INSERT OR IGNORE INTO features (id, name, description, created_at, updated_at) VALUES
  ('feat-orders', 'Unlimited Orders', 'Unlimited orders per month', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('feat-ai', 'AI Order Parsing', 'AI-powered PDF order parsing', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('feat-reports', 'Advanced Reports', 'Advanced analytics + PDF export', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z'),
  ('feat-api', 'API Access', 'API access for integrations', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Seed admin user
-- Password: Admin@123 (bcrypt hash)
INSERT INTO users (
  id, email, password_hash, name, role, user_type,
  user_status, step, has_agreed_to_phi_access,
  must_change_password, mfa_enabled, approval_status,
  created_at, updated_at
) VALUES (
  '794e369c-5797-4b30-b7dd-e1f4e5e2e3f4',
  'admin@curavend.com',
  '$2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2',
  'System Admin',
  'ACCOUNT_MANAGER',
  'ADMIN',
  'ACTIVE',
  'WELCOME_EMAIL',
  1,
  0,
  0,
  'APPROVED',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z'
);

-- Seed default sequences
INSERT INTO sequences (name, current_value) VALUES ('invoice_number', 1000);
INSERT INTO sequences (name, current_value) VALUES ('support_ticket_number', 100);
INSERT INTO sequences (name, current_value) VALUES ('purchase_order_number', 100);

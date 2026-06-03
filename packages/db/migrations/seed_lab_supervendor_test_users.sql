-- Test Lab User seed
-- Creates a lab group (entity) and a lab user with user_type='LAB'
-- Password: Admin@123 (same bcrypt hash as other demo users)

INSERT OR IGNORE INTO lab_groups (id, name, group_type, vendor_id, description, created_at, updated_at)
VALUES (
  'lg-test-001',
  'Boston Clinical Lab',
  'DIAGNOSTICS',
  NULL,
  'Demo lab group for portal testing',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z'
);

INSERT OR IGNORE INTO users (
  id, email, password_hash, name, role, user_type,
  user_status, step, has_agreed_to_phi_access,
  must_change_password, mfa_enabled, approval_status,
  lab_group_id, created_at, updated_at
) VALUES (
  'user-lab-001',
  'lab@curavend.com',
  '$2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2',
  'Lab Manager',
  'LAB_ACCOUNT_MANAGER',
  'LAB',
  'ACTIVE',
  'WELCOME_EMAIL',
  1, 0, 0, 'APPROVED',
  'lg-test-001',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z'
);

-- Test Super-Vendor User seed
-- Creates a super_vendor entity and a user with role='SUPER_VENDOR'
-- (isSuperVendor check uses role === 'SUPER_VENDOR' in useUserRoles hook)

INSERT OR IGNORE INTO super_vendors (
  id, name, primary_account_name, primary_account_email,
  physical_city, physical_state, physical_zip,
  created_at, updated_at
) VALUES (
  'sv-test-001',
  'MedSupply Group Holdings',
  'Super Vendor Manager',
  'supervendor@curavend.com',
  'New York', 'NY', '10001',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z'
);

INSERT OR IGNORE INTO users (
  id, email, password_hash, name, role, user_type,
  user_status, step, has_agreed_to_phi_access,
  must_change_password, mfa_enabled, approval_status,
  super_vendor_id, created_at, updated_at
) VALUES (
  'user-sv-001',
  'supervendor@curavend.com',
  '$2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2',
  'Super Vendor Manager',
  'SUPER_VENDOR',
  'SUPER_VENDOR',
  'ACTIVE',
  'WELCOME_EMAIL',
  1, 0, 0, 'APPROVED',
  'sv-test-001',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z'
);

-- Membership for super vendor (required for login flow)
INSERT OR IGNORE INTO user_memberships (
  id, user_id, tenant_type, tenant_id, role,
  is_active, is_default, created_at, updated_at
) VALUES (
  'mem-sv-001',
  'user-sv-001',
  'SUPER_VENDOR',
  'sv-test-001',
  'SUPER_VENDOR',
  1, 1,
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z'
);

-- Link the existing vend-001 vendor to the new super vendor
UPDATE vendors SET super_vendor_id = 'sv-test-001' WHERE id = 'vend-001' AND super_vendor_id IS NULL;

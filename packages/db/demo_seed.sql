-- Demo Provider (no email column - uses primaryAccountEmail)
INSERT OR IGNORE INTO providers (id, name, primary_account_email, primary_account_name, physical_city, physical_state, physical_zip, created_at, updated_at)
VALUES ('prov-001', 'Curavend Medical Group', 'admin@curavend.com', 'System Admin', 'Boston', 'MA', '02101', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Demo Hospital
INSERT OR IGNORE INTO hospitals (id, name, email, contact, city, state, zip, provider_id, modified_orders, in_process_orders, cancelled_orders, completed_orders, unread_order_count, created_at, updated_at)
VALUES ('hosp-001', 'Boston General Hospital', 'orders@bgh.com', '555-0200', 'Boston', 'MA', '02102', 'prov-001', 0, 1, 0, 1, 0, '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Demo Vendor
INSERT OR IGNORE INTO vendors (id, name, email, contact, city, state, zip, modified_orders, in_process_orders, cancelled_orders, completed_orders, unread_order_count, created_at, updated_at)
VALUES ('vend-001', 'MedSupply Pro', 'contact@medsupplypro.com', '555-0300', 'Boston', 'MA', '02103', 0, 0, 0, 0, 0, '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Update admin user to link to provider
UPDATE users SET provider_id = 'prov-001' WHERE id = '794e369c-5797-4b30-b7dd-e1f4e5e2e3f4';

-- Demo Hospital Admin User
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, user_type, user_status, step, has_agreed_to_phi_access, must_change_password, mfa_enabled, approval_status, hospital_id, provider_id, created_at, updated_at)
VALUES ('user-hosp-001', 'hospital@curavend.com', '$2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2', 'Hospital Manager', 'FACILITY_ACCOUNT_MANAGER', 'HOSPITAL', 'ACTIVE', 'WELCOME_EMAIL', 1, 0, 0, 'APPROVED', 'hosp-001', 'prov-001', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Demo Vendor Admin User
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, user_type, user_status, step, has_agreed_to_phi_access, must_change_password, mfa_enabled, approval_status, vendor_id, provider_id, created_at, updated_at)
VALUES ('user-vend-001', 'vendor@curavend.com', '$2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2', 'Vendor Manager', 'VENDOR_ACCOUNT_MANAGER', 'VENDOR', 'ACTIVE', 'WELCOME_EMAIL', 1, 0, 0, 'APPROVED', 'vend-001', 'prov-001', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Demo Orders
INSERT OR IGNORE INTO orders (id, identifier, status, order_sub_status, hospital_id, vendor_id, provider_id, patient_name, patient_last_name, patient_gender, patient_birth_date, diagnosis, icd10, extremity, department, priority, changed_by_user_id, notified_hospital, order_sub_status_history, sign_date_time, created_at, updated_at)
VALUES ('ord-001', 'ORD-2026001', 'IN_PROGRESS', 'VENDOR_ASSIGNED', 'hosp-001', 'vend-001', 'prov-001', 'John', 'Smith', 'Male', '1980-05-15', 'Knee arthritis', 'M17.11', 'Left Knee', 'Orthopedics', 'routine', 'user-hosp-001', 0, '[{"status":"NEW_ORDER","timestamp":"2026-04-10T08:00:00.000Z"},{"status":"VENDOR_ASSIGNED","timestamp":"2026-04-10T09:00:00.000Z"}]', '2026-04-10T08:00:00.000Z', '2026-04-10T08:00:00.000Z', '2026-04-10T09:00:00.000Z');

INSERT OR IGNORE INTO orders (id, identifier, status, order_sub_status, hospital_id, vendor_id, provider_id, patient_name, patient_last_name, patient_gender, patient_birth_date, diagnosis, icd10, extremity, department, priority, changed_by_user_id, notified_hospital, order_sub_status_history, sign_date_time, created_at, updated_at)
VALUES ('ord-002', 'ORD-2026002', 'COMPLETED', 'ORDER_COMPLETED', 'hosp-001', 'vend-001', 'prov-001', 'Jane', 'Doe', 'Female', '1975-08-22', 'Shoulder impingement', 'M75.1', 'Right Shoulder', 'Physical Therapy', 'urgent', 'user-hosp-001', 1, '[{"status":"NEW_ORDER","timestamp":"2026-04-08T08:00:00.000Z"},{"status":"ORDER_COMPLETED","timestamp":"2026-04-12T14:00:00.000Z"}]', '2026-04-08T08:00:00.000Z', '2026-04-08T08:00:00.000Z', '2026-04-12T14:00:00.000Z');

INSERT OR IGNORE INTO orders (id, identifier, status, order_sub_status, hospital_id, vendor_id, provider_id, patient_name, patient_last_name, patient_gender, patient_birth_date, diagnosis, icd10, extremity, department, priority, changed_by_user_id, notified_hospital, order_sub_status_history, sign_date_time, created_at, updated_at)
VALUES ('ord-003', 'ORD-2026003', 'PENDING', 'NEW_ORDER', 'hosp-001', NULL, 'prov-001', 'Robert', 'Johnson', 'Male', '1965-12-01', 'Back pain', 'M54.5', 'Lumbar Spine', 'Neurology', 'routine', 'user-hosp-001', 0, '[{"status":"NEW_ORDER","timestamp":"2026-04-15T10:00:00.000Z"}]', '2026-04-15T10:00:00.000Z', '2026-04-15T10:00:00.000Z', '2026-04-15T10:00:00.000Z');

-- Demo Order Items
INSERT OR IGNORE INTO order_items (id, order_id, code, description, quantity, created_at)
VALUES ('oi-001', 'ord-001', 'L1832', 'Knee Orthosis, Bilateral Tibial Plateau', 1, '2026-04-10T08:00:00.000Z');

INSERT OR IGNORE INTO order_items (id, order_id, code, description, quantity, created_at)
VALUES ('oi-002', 'ord-002', 'L3900', 'Shoulder Orthosis, complex', 1, '2026-04-08T08:00:00.000Z');

INSERT OR IGNORE INTO order_items (id, order_id, code, description, quantity, created_at)
VALUES ('oi-003', 'ord-003', 'L0637', 'Lumbar-Sacral Orthosis, rigid', 1, '2026-04-15T10:00:00.000Z');

-- Demo Invoice for completed order
INSERT OR IGNORE INTO invoices (id, number, order_id, hospital_id, vendor_id, provider_id, status, total, created_at, updated_at)
VALUES ('inv-db-001', 'INV-1001', 'ord-002', 'hosp-001', 'vend-001', 'prov-001', 'ORDER_COMPLETED', 0, '2026-04-12T14:00:00.000Z', '2026-04-12T14:00:00.000Z');

-- Demo Invoice Items
INSERT OR IGNORE INTO invoice_items (id, invoice_id, code, description, quantity, created_at)
VALUES ('iitem-001', 'inv-db-001', 'L3900', 'Shoulder Orthosis, complex', 1, '2026-04-12T14:00:00.000Z');

-- Demo Order History
INSERT OR IGNORE INTO order_history (id, order_id, description, changed_by_user_id, created_at)
VALUES ('oh-001', 'ord-001', 'Order created', 'user-hosp-001', '2026-04-10T08:00:00.000Z');
INSERT OR IGNORE INTO order_history (id, order_id, description, changed_by_user_id, created_at)
VALUES ('oh-002', 'ord-001', 'Vendor assigned to order', 'user-hosp-001', '2026-04-10T09:00:00.000Z');
INSERT OR IGNORE INTO order_history (id, order_id, description, changed_by_user_id, created_at)
VALUES ('oh-003', 'ord-002', 'Order created', 'user-hosp-001', '2026-04-08T08:00:00.000Z');
INSERT OR IGNORE INTO order_history (id, order_id, description, changed_by_user_id, created_at)
VALUES ('oh-004', 'ord-002', 'Order completed', 'user-hosp-001', '2026-04-12T14:00:00.000Z');
INSERT OR IGNORE INTO order_history (id, order_id, description, changed_by_user_id, created_at)
VALUES ('oh-005', 'ord-003', 'Order created', 'user-hosp-001', '2026-04-15T10:00:00.000Z');

-- Hospital Vendor relationship
INSERT OR IGNORE INTO hospital_vendors (id, hospital_id, vendor_id, provider_id, created_at, updated_at)
VALUES ('hv-001', 'hosp-001', 'vend-001', 'prov-001', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Demo Inventory (catalog container - no name column)
INSERT OR IGNORE INTO inventory (id, vendor_id, created_at, updated_at)
VALUES ('inv-cat-001', 'vend-001', '2026-04-16T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Demo Inventory Items (uses hcpc_code not code)
INSERT OR IGNORE INTO inventory_items (id, inventory_id, hcpc_code, description, manufacturer_name, created_at)
VALUES ('ii-001', 'inv-cat-001', 'L1832', 'Knee Orthosis, Bilateral Tibial Plateau', 'OrthoTech', '2026-04-16T00:00:00.000Z');
INSERT OR IGNORE INTO inventory_items (id, inventory_id, hcpc_code, description, manufacturer_name, created_at)
VALUES ('ii-002', 'inv-cat-001', 'L3900', 'Shoulder Orthosis, complex', 'BioMed Supplies', '2026-04-16T00:00:00.000Z');
INSERT OR IGNORE INTO inventory_items (id, inventory_id, hcpc_code, description, manufacturer_name, created_at)
VALUES ('ii-003', 'inv-cat-001', 'L0637', 'Lumbar-Sacral Orthosis, rigid', 'SpineSupport Inc', '2026-04-16T00:00:00.000Z');

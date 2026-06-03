-- Migration 0020: Ensure vend-001 is linked to super-vendor sv-test-001
-- This is idempotent: only sets super_vendor_id if it is still NULL.
-- Required so that the SUPER_VENDOR user (supervendor@curavend.com) can see
-- orders, invoices, and vendor KPIs for the MedSupply Pro sub-vendor.
UPDATE vendors SET super_vendor_id = 'sv-test-001' WHERE id = 'vend-001' AND super_vendor_id IS NULL;

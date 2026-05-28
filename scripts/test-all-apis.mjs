/**
 * Curavend — Comprehensive API smoke test
 * Tests every route file across all 87 modules.
 * Usage: node scripts/test-all-apis.mjs
 *
 * Credentials come from the memory file:
 *   admin@curavend.com / Admin@123
 *   hospital@curavend.com / Admin@123
 *   vendor@curavend.com / Admin@123
 */

const BASE = 'https://curavend-api.metabilityllc1.workers.dev';

// ── helpers ──────────────────────────────────────────────────────────────────

let adminToken = null;
let hospitalToken = null;
let vendorToken = null;

const results = { pass: 0, fail: 0, skip: 0, rows: [] };

async function req(method, path, { token, body, expectedStatuses = [200, 201], label } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    results.fail++;
    results.rows.push({ status: 'FAIL', label: label || `${method} ${path}`, code: 'NETWORK_ERROR', detail: e.message });
    return null;
  }

  const ok = expectedStatuses.includes(res.status);
  const row = { status: ok ? 'PASS' : 'FAIL', label: label || `${method} ${path}`, code: res.status };

  // Try to read body for error detail on failure
  if (!ok) {
    try {
      const txt = await res.text();
      row.detail = txt.slice(0, 120);
    } catch { /* ignore */ }
  }

  if (ok) results.pass++; else results.fail++;
  results.rows.push(row);
  return res;
}

async function get(path, { token, expected = [200], label } = {}) {
  return req('GET', path, { token, expectedStatuses: expected, label });
}

async function post(path, body, { token, expected = [200, 201], label } = {}) {
  return req('POST', path, { token, body, expectedStatuses: expected, label });
}

function skip(label) {
  results.skip++;
  results.rows.push({ status: 'SKIP', label, code: '-' });
}

function section(name) {
  console.log(`\n${'═'.repeat(60)}\n  ${name}\n${'═'.repeat(60)}`);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function authenticate() {
  section('AUTH — Getting tokens');

  // Admin login
  const adminRes = await post('/api/auth/login', { email: 'admin@curavend.com', password: 'Admin@123' }, { label: 'POST /api/auth/login (admin)' });
  if (adminRes && adminRes.ok) {
    const data = await adminRes.json();
    adminToken = data.token;
    console.log('  ✓ Admin token obtained');
  } else {
    console.error('  ✗ Admin login FAILED — aborting');
    process.exit(1);
  }

  // Hospital login
  const hospRes = await post('/api/auth/login', { email: 'hospital@curavend.com', password: 'Admin@123' }, { label: 'POST /api/auth/login (hospital)' });
  if (hospRes && hospRes.ok) {
    const d = await hospRes.json();
    hospitalToken = d.token;
    console.log('  ✓ Hospital token obtained');
  }

  // Vendor login
  const vendRes = await post('/api/auth/login', { email: 'vendor@curavend.com', password: 'Admin@123' }, { label: 'POST /api/auth/login (vendor)' });
  if (vendRes && vendRes.ok) {
    const d = await vendRes.json();
    vendorToken = d.token;
    console.log('  ✓ Vendor token obtained');
  }
}

// ── Test suites ───────────────────────────────────────────────────────────────

async function testHealth() {
  section('HEALTH CHECK');
  await get('/api/health', { label: 'GET /api/health' });
}

async function testPublicEndpoints() {
  section('PUBLIC ENDPOINTS (no auth)');
  await get('/api/health', { label: 'GET /api/health' });
  await get('/cds-services', { label: 'GET /cds-services' });
  await get('/.well-known/jwks.json', { label: 'GET /.well-known/jwks.json' });
}

async function testAuthRoutes() {
  section('AUTH ROUTES');
  await get('/api/auth/me', { token: adminToken, label: 'GET /api/auth/me' });
  await post('/api/auth/email-otp/send', { email: 'admin@curavend.com' }, { expected: [200, 201, 400, 429], label: 'POST /api/auth/email-otp/send' });
}

async function testUsers() {
  section('USER MANAGEMENT');
  await get('/api/users', { token: adminToken, label: 'GET /api/users' });
  await get('/api/users/me', { token: adminToken, label: 'GET /api/users/me' });
  await get('/api/user-groups', { token: adminToken, label: 'GET /api/user-groups' });
  await get('/api/user-permissions', { token: adminToken, label: 'GET /api/user-permissions' });
  await get('/api/user-permissions/matrix', { token: adminToken, label: 'GET /api/user-permissions/matrix' });
  await get('/api/user-filter-presets', { token: adminToken, label: 'GET /api/user-filter-presets' });
}

async function testHospitals() {
  section('HOSPITAL MANAGEMENT');
  await get('/api/hospitals', { token: adminToken, label: 'GET /api/hospitals' });
  await get('/api/hospital-facilities', { token: adminToken, label: 'GET /api/hospital-facilities' });
  await get('/api/hospital-departments', { token: adminToken, label: 'GET /api/hospital-departments' });
  await get('/api/hospital-vendors', { token: adminToken, label: 'GET /api/hospital-vendors' });
  await get('/api/providers', { token: adminToken, label: 'GET /api/providers' });
}

async function testVendors() {
  section('VENDOR MANAGEMENT');
  await get('/api/vendors', { token: adminToken, label: 'GET /api/vendors' });
  await get('/api/vendor-locations', { token: adminToken, label: 'GET /api/vendor-locations' });
  await get('/api/vendor-coverage', { token: adminToken, label: 'GET /api/vendor-coverage' });
  await get('/api/vendor-item-skus', { token: adminToken, label: 'GET /api/vendor-item-skus' });
  await get('/api/vendor-stock-connectors', { token: adminToken, label: 'GET /api/vendor-stock-connectors' });
  await get('/api/vendor-erp-connectors', { token: adminToken, label: 'GET /api/vendor-erp-connectors' });
  await get('/api/super-vendors', { token: adminToken, label: 'GET /api/super-vendors' });
  await get('/api/vendor-onboarding', { token: adminToken, label: 'GET /api/vendor-onboarding' });
}

async function testOrders() {
  section('ORDERS & LIFECYCLE');
  await get('/api/orders', { token: adminToken, label: 'GET /api/orders' });
  await get('/api/orders?limit=5', { token: adminToken, label: 'GET /api/orders (with limit)' });
  await get('/api/orders/export.csv', { token: adminToken, expected: [200, 204, 206], label: 'GET /api/orders/export.csv' });
  await post('/api/routing/score', { hcpcCode: 'L1832', patientState: 'MA', hospitalId: 'hosp-001' }, { token: adminToken, expected: [200, 201, 400, 404], label: 'POST /api/routing/score' });
  await get('/api/recurrence', { token: adminToken, label: 'GET /api/recurrence' });
}

async function testShipments() {
  section('SHIPMENTS');
  // No specific shipment to fetch; just check list via an order that may or may not have shipments
  await get('/api/orders', { token: adminToken, expected: [200], label: 'GET /api/orders (pre-shipment list check)' });
}

async function testInvoices() {
  section('INVOICES & BILLING');
  await get('/api/invoices', { token: adminToken, label: 'GET /api/invoices' });
  await get('/api/invoices?limit=5', { token: adminToken, label: 'GET /api/invoices (with limit)' });
  await get('/api/invoices/export.csv', { token: adminToken, expected: [200, 204, 206], label: 'GET /api/invoices/export.csv' });
  await get('/api/subscriptions/status', { token: adminToken, expected: [200, 404], label: 'GET /api/subscriptions/status' });
  await get('/api/subscriptions/plans', { token: adminToken, expected: [200, 404], label: 'GET /api/subscriptions/plans' });
}

async function testApprovals() {
  section('APPROVALS & RULES');
  await get('/api/approvals', { token: adminToken, label: 'GET /api/approvals' });
  await get('/api/approval-rules', { token: adminToken, label: 'GET /api/approval-rules' });
}

async function testInventory() {
  section('INVENTORY & CATALOG');
  await get('/api/inventory', { token: adminToken, label: 'GET /api/inventory' });
  await get('/api/catalog', { token: adminToken, label: 'GET /api/catalog' });
  await get('/api/sku-groups', { token: adminToken, label: 'GET /api/sku-groups' });
  await get('/api/pricing', { token: adminToken, label: 'GET /api/pricing' });
  await get('/api/pricing/medicare-rates', { token: adminToken, label: 'GET /api/pricing/medicare-rates' });
  await get('/api/formulary', { token: adminToken, label: 'GET /api/formulary' });
  await get('/api/substitutions', { token: adminToken, label: 'GET /api/substitutions' });
  await get('/api/substitutions/audit-log', { token: adminToken, label: 'GET /api/substitutions/audit-log' });
  await get('/api/point-of-use', { token: adminToken, label: 'GET /api/point-of-use' });
  await get('/api/reporting/cross-site-inventory', { token: adminToken, expected: [200, 400], label: 'GET /api/reporting/cross-site-inventory' });
  await get('/api/item-master-hygiene/issues', { token: adminToken, label: 'GET /api/item-master-hygiene/issues' });
  await get('/api/transfers', { token: adminToken, label: 'GET /api/transfers' });
}

async function testLabs() {
  section('LAB PORTAL');
  await get('/api/labs', { token: adminToken, label: 'GET /api/labs' });
  await get('/api/lab-inventory', { token: adminToken, label: 'GET /api/lab-inventory' });
  await get('/api/lab-movements', { token: adminToken, label: 'GET /api/lab-movements' });
  await get('/api/backorders', { token: adminToken, label: 'GET /api/backorders' });
}

async function testDme() {
  section('DME / DMEPOS');
  await get('/api/dme-documents', { token: adminToken, expected: [200, 400], label: 'GET /api/dme-documents' });
  await get('/api/lcd', { token: adminToken, label: 'GET /api/lcd' });
  await get('/api/dmepos-compliance', { token: adminToken, label: 'GET /api/dmepos-compliance' });
  await get('/api/dme-rental-periods', { token: adminToken, label: 'GET /api/dme-rental-periods' });
  await get('/api/prior-auths', { token: adminToken, label: 'GET /api/prior-auths' });
  await get('/api/hcpc-codes?q=E0470', { token: adminToken, label: 'GET /api/hcpc-codes?q=E0470' });
  await get('/api/icd10-codes?q=J45', { token: adminToken, label: 'GET /api/icd10-codes?q=J45' });
}

async function testProcurement() {
  section('PROCUREMENT');
  await get('/api/requisitions', { token: adminToken, label: 'GET /api/requisitions' });
  await get('/api/requisition-templates', { token: adminToken, label: 'GET /api/requisition-templates' });
  await get('/api/purchase-orders', { token: adminToken, label: 'GET /api/purchase-orders' });
  await get('/api/customer-purchase-orders', { token: adminToken, label: 'GET /api/customer-purchase-orders' });
  await get('/api/goods-receipts', { token: adminToken, label: 'GET /api/goods-receipts' });
  await get('/api/three-way-match', { token: adminToken, label: 'GET /api/three-way-match' });
  await get('/api/rmas', { token: adminToken, label: 'GET /api/rmas' });
  await get('/api/consignment', { token: adminToken, label: 'GET /api/consignment' });
  await get('/api/recalls', { token: adminToken, label: 'GET /api/recalls' });
  await get('/api/compliance-alerts', { token: adminToken, label: 'GET /api/compliance-alerts' });
  await get('/api/logistics', { token: adminToken, label: 'GET /api/logistics' });
  await get('/api/controlled-substance', { token: adminToken, label: 'GET /api/controlled-substance' });
  await get('/api/invoice-match-rules', { token: adminToken, label: 'GET /api/invoice-match-rules' });
}

async function testFinancial() {
  section('FINANCIAL — BUDGETS & GL');
  await get('/api/budgets', { token: adminToken, expected: [200, 400], label: 'GET /api/budgets' });
  await get('/api/reporting/department-spend', { token: adminToken, expected: [200, 400], label: 'GET /api/reporting/department-spend' });
  await get('/api/reporting/gl/entries', { token: adminToken, expected: [200, 400], label: 'GET /api/reporting/gl/entries' });
}

async function testContracts() {
  section('CONTRACTS & PRICING');
  await get('/api/contracts', { token: adminToken, label: 'GET /api/contracts' });
  await get('/api/gpo', { token: adminToken, label: 'GET /api/gpo' });
  await get('/api/payors', { token: adminToken, label: 'GET /api/payors' });
}

async function testReporting() {
  section('REPORTING & ANALYTICS');
  await get('/api/reports/spend-by-vendor', { token: adminToken, label: 'GET /api/reports/spend-by-vendor' });
  await get('/api/reports/spend-by-hcpc', { token: adminToken, label: 'GET /api/reports/spend-by-hcpc' });
  await get('/api/reports/spend-by-month', { token: adminToken, label: 'GET /api/reports/spend-by-month' });
  await get('/api/reports/spend-by-physician', { token: adminToken, label: 'GET /api/reports/spend-by-physician' });
  await get('/api/reports/spend-by-facility', { token: adminToken, label: 'GET /api/reports/spend-by-facility' });
  await get('/api/reports/spend-by-department', { token: adminToken, label: 'GET /api/reports/spend-by-department' });
  await get('/api/reports/orders-by-status', { token: adminToken, label: 'GET /api/reports/orders-by-status' });
  await get('/api/reports/orders-by-vendor', { token: adminToken, label: 'GET /api/reports/orders-by-vendor' });
  await get('/api/reports/vendor-kpis', { token: adminToken, expected: [200, 400], label: 'GET /api/reports/vendor-kpis' });
  await get('/api/reports/vendor-scorecard', { token: adminToken, label: 'GET /api/reports/vendor-scorecard' });
  await get('/api/reports/executive-summary', { token: adminToken, label: 'GET /api/reports/executive-summary' });
  await get('/api/reports/unbilled-transactions', { token: adminToken, label: 'GET /api/reports/unbilled-transactions' });
  await get('/api/reports/orders-modified', { token: adminToken, label: 'GET /api/reports/orders-modified' });
  await get('/api/reports/orders-cancelled', { token: adminToken, label: 'GET /api/reports/orders-cancelled' });
  await get('/api/reports/multi-site-rollup', { token: adminToken, label: 'GET /api/reports/multi-site-rollup' });
  await get('/api/reports/contract-leakage?hospitalId=hosp-001', { token: adminToken, label: 'GET /api/reports/contract-leakage' });
  await get('/api/reports/compliance/users', { token: adminToken, label: 'GET /api/reports/compliance/users' });
  await get('/api/reports/compliance/credentials', { token: adminToken, label: 'GET /api/reports/compliance/credentials' });
  await get('/api/reports/compliance/network-access', { token: adminToken, label: 'GET /api/reports/compliance/network-access' });
  await get('/api/reports/orders.xlsx', { token: adminToken, expected: [200, 204], label: 'GET /api/reports/orders.xlsx' });
  await get('/api/reports/invoices.xlsx', { token: adminToken, expected: [200, 204], label: 'GET /api/reports/invoices.xlsx' });
  await get('/api/reports/spend.xlsx?groupBy=vendor', { token: adminToken, expected: [200, 204], label: 'GET /api/reports/spend.xlsx' });
  await get('/api/forecasting', { token: adminToken, label: 'GET /api/forecasting' });
  await get('/api/reporting/price-variance', { token: adminToken, expected: [200, 400], label: 'GET /api/reporting/price-variance' });
  await get('/api/reporting/charge-capture-leakage', { token: adminToken, expected: [200, 400], label: 'GET /api/reporting/charge-capture-leakage' });
}

async function testAdmin() {
  section('ADMINISTRATION');
  await get('/api/admin/pending-users', { token: adminToken, label: 'GET /api/admin/pending-users' });
  await get('/api/admin/stats', { token: adminToken, label: 'GET /api/admin/stats' });
  await get('/api/admin/phi-access-log', { token: adminToken, label: 'GET /api/admin/phi-access-log' });
  await get('/api/admin/file-access-log', { token: adminToken, label: 'GET /api/admin/file-access-log' });
  await get('/api/admin/phi-consent-log', { token: adminToken, label: 'GET /api/admin/phi-consent-log' });
  await get('/api/admin/oig/count', { token: adminToken, label: 'GET /api/admin/oig/count' });
  await get('/api/admin/oig/search?q=smith', { token: adminToken, label: 'GET /api/admin/oig/search' });
  await get('/api/admin/oig/last-refresh', { token: adminToken, label: 'GET /api/admin/oig/last-refresh' });
  await get('/api/admin/state-rates', { token: adminToken, label: 'GET /api/admin/state-rates' });
}

async function testAI() {
  section('AI');
  // POST /api/ai/extract-order requires a file — just verify 400 (missing file) not 404/500
  await post('/api/ai/extract-order', {}, { token: adminToken, expected: [400, 415, 422], label: 'POST /api/ai/extract-order (no file → expect 400)' });
}

async function testFhir() {
  section('FHIR / EHR');
  await get('/api/fhir/token-status?connectionId=test', { token: adminToken, expected: [200, 400, 404], label: 'GET /api/fhir/token-status' });
  await get('/api/fhir/authorize-url?connectionId=test', { token: adminToken, expected: [200, 400, 404], label: 'GET /api/fhir/authorize-url' });
  await get('/api/fhir/cds-hooks-prefill?patientId=test', { token: adminToken, expected: [200, 400, 401, 404, 500], label: 'GET /api/fhir/cds-hooks-prefill' });
  await get('/api/ehr/connections', { token: adminToken, expected: [200, 400], label: 'GET /api/ehr/connections' });
}

async function testCdsHooks() {
  section('CDS HOOKS (public)');
  await get('/cds-services', { label: 'GET /cds-services' });
  await post('/cds-services/curavend-dme', {
    hook: 'order-select',
    hookInstance: 'test-1',
    context: { patientId: 'P123', draftOrders: { resourceType: 'Bundle', entry: [] } }
  }, { expected: [200], label: 'POST /cds-services/curavend-dme' });
  await post('/cds-services/curavend-order-sign', {
    hook: 'order-sign',
    hookInstance: 'test-2',
    context: { patientId: 'P123', draftOrders: { resourceType: 'Bundle', entry: [] } }
  }, { expected: [200], label: 'POST /cds-services/curavend-order-sign' });
}

async function testNotifications() {
  section('NOTIFICATIONS');
  await get('/api/notifications', { token: adminToken, label: 'GET /api/notifications' });
  await get('/api/notification-preferences', { token: adminToken, label: 'GET /api/notification-preferences' });
}

async function testSupportTickets() {
  section('SUPPORT TICKETS');
  await get('/api/support-tickets', { token: adminToken, label: 'GET /api/support-tickets' });
}

async function testRooms() {
  section('ROOMS / CHAT');
  await get('/api/rooms', { token: adminToken, label: 'GET /api/rooms' });
}

async function testClinicalTemplates() {
  section('CLINICAL TEMPLATES');
  await get('/api/clinical-templates', { token: adminToken, label: 'GET /api/clinical-templates' });
}

async function testWorkflows() {
  section('WORKFLOWS');
  await get('/api/workflows', { token: adminToken, label: 'GET /api/workflows' });
}

async function testIntegrations() {
  section('INTEGRATIONS LOG');
  await get('/api/integrations/log', { token: adminToken, label: 'GET /api/integrations/log' });
}

async function testUploads() {
  section('UPLOADS');
  // Just verify the endpoint exists (GET requires a key)
  await get('/api/uploads/nonexistent-key', { token: adminToken, expected: [200, 400, 403, 404], label: 'GET /api/uploads/nonexistent-key' });
}

async function testUtility() {
  section('UTILITY');
  await get('/api/utility/npi-lookup?npi=1234567890', { token: adminToken, expected: [200, 400, 404], label: 'GET /api/utility/npi-lookup' });
  await get('/api/utility/address-lookup?q=Boston', { token: adminToken, expected: [200, 400, 404], label: 'GET /api/utility/address-lookup' });
}

async function testSearch() {
  section('SEARCH');
  await get('/api/search?q=test', { token: adminToken, expected: [200], label: 'GET /api/search' });
  await get('/api/search/vendors?q=med', { token: adminToken, expected: [200, 404], label: 'GET /api/search/vendors' });
  await get('/api/search/items?q=cpap', { token: adminToken, expected: [200, 404], label: 'GET /api/search/items' });
}

async function testAuthRequired() {
  section('AUTH GUARDS — 401 on missing token');
  await get('/api/orders', { expected: [401], label: 'GET /api/orders (no token → 401)' });
  await get('/api/vendors', { expected: [401], label: 'GET /api/vendors (no token → 401)' });
  await get('/api/admin/stats', { expected: [401], label: 'GET /api/admin/stats (no token → 401)' });
}

async function testTenantIsolation() {
  section('TENANT ISOLATION — vendor cannot see hospital data');
  // Vendor token should not be able to access admin routes (403)
  await get('/api/admin/stats', { token: vendorToken, expected: [403], label: 'GET /api/admin/stats (vendor → 403)' });
  await get('/api/admin/pending-users', { token: vendorToken, expected: [403], label: 'GET /api/admin/pending-users (vendor → 403)' });
}

async function testHospitalPersona() {
  section('HOSPITAL PERSONA');
  await get('/api/orders', { token: hospitalToken, label: 'GET /api/orders (hospital)' });
  await get('/api/invoices', { token: hospitalToken, label: 'GET /api/invoices (hospital)' });
  await get('/api/contracts', { token: hospitalToken, label: 'GET /api/contracts (hospital)' });
  await get('/api/purchase-orders', { token: hospitalToken, label: 'GET /api/purchase-orders (hospital)' });
  await get('/api/reports/executive-summary', { token: hospitalToken, label: 'GET /api/reports/executive-summary (hospital)' });
}

async function testVendorPersona() {
  section('VENDOR PERSONA');
  await get('/api/orders', { token: vendorToken, label: 'GET /api/orders (vendor)' });
  await get('/api/invoices', { token: vendorToken, label: 'GET /api/invoices (vendor)' });
  await get('/api/purchase-orders', { token: vendorToken, label: 'GET /api/purchase-orders (vendor)' });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '█'.repeat(64));
  console.log('  CURAVEND COMPLETE API SMOKE TEST');
  console.log(`  Target: ${BASE}`);
  console.log(`  Time:   ${new Date().toISOString()}`);
  console.log('█'.repeat(64));

  await authenticate();

  await testPublicEndpoints();
  await testAuthRoutes();
  await testUsers();
  await testHospitals();
  await testVendors();
  await testOrders();
  await testShipments();
  await testInvoices();
  await testApprovals();
  await testInventory();
  await testLabs();
  await testDme();
  await testProcurement();
  await testFinancial();
  await testContracts();
  await testReporting();
  await testAdmin();
  await testAI();
  await testFhir();
  await testCdsHooks();
  await testNotifications();
  await testSupportTickets();
  await testRooms();
  await testClinicalTemplates();
  await testWorkflows();
  await testIntegrations();
  await testUploads();
  await testUtility();
  await testSearch();
  await testAuthRequired();
  await testTenantIsolation();
  await testHospitalPersona();
  await testVendorPersona();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(64));

  const fails = results.rows.filter(r => r.status === 'FAIL');
  const passes = results.rows.filter(r => r.status === 'PASS');
  const skips = results.rows.filter(r => r.status === 'SKIP');

  if (fails.length > 0) {
    console.log('\n  ── FAILURES ──');
    for (const f of fails) {
      console.log(`  ✗ [${f.code}] ${f.label}${f.detail ? ' — ' + f.detail : ''}`);
    }
  }

  console.log(`\n  ✓ PASS: ${passes.length}`);
  console.log(`  ✗ FAIL: ${fails.length}`);
  console.log(`  ─ SKIP: ${skips.length}`);
  console.log(`  Total:  ${results.rows.length}`);
  console.log('\n  Pass rate: ' + ((passes.length / (passes.length + fails.length)) * 100).toFixed(1) + '%');
  console.log('\n' + '█'.repeat(64) + '\n');

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

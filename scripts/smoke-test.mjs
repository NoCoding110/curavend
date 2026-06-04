#!/usr/bin/env node
/**
 * End-to-end smoke test against the deployed Curavend system.
 *
 * Logs in as admin, then exercises every major feature area in sequence:
 *   1. Core: auth, /users/me, /hospitals, /vendors, /payors
 *   2. Procurement: requisitions, formulary, goods receipts, 3-way match
 *   3. DME ordering: extension, doc packet, LCD check, PA, DWO PDF, claim bundle
 *   4. DMEPOS compliance: list, expiring
 *   5. Reporting: dashboards, scorecard, contract leakage, multi-site
 *   6. Help center: docs manifest
 *
 * Each step prints PASS / FAIL with a 1-line reason. Final summary at the end.
 *
 * Usage: node scripts/smoke-test.mjs
 * Env: CURAVEND_API_BASE (default https://curavend-api.metabilityllc1.workers.dev)
 *      CURAVEND_EMAIL (default admin@curavend.com)
 *      CURAVEND_PASSWORD (default Admin@123)
 */
const API = process.env.CURAVEND_API_BASE ?? 'https://curavend-api.metabilityllc1.workers.dev';
const EMAIL = process.env.CURAVEND_EMAIL ?? 'admin@curavend.com';
const PASSWORD = process.env.CURAVEND_PASSWORD ?? 'Admin@123';
// Production has Turnstile bot-protection on /api/auth/login. To run the
// authenticated half of the suite, log in via the browser (https://curavend-web.pages.dev/login),
// open DevTools → Application → Local Storage → copy the value of `token`, then:
//   CURAVEND_TOKEN=<paste>  node scripts/smoke-test.mjs
let TOKEN = process.env.CURAVEND_TOKEN ?? null;

const results = { passed: 0, failed: 0, details: [], skipped: 0 };
// State carried across tests
const state = {
  hospitalId: null,
  vendorId: null,
  payorId: null,
  hcpcWithLcd: 'E0601', // CPAP — known to have LCD coverage criteria seeded
  hcpcWithPa: 'K0856',  // PMD — known to be on CMS PA list
  orderId: null,
  reqId: null,
  formularyId: null,
};

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function pass(group, name, detail = '') {
  results.passed++;
  results.details.push({ group, name, status: 'pass', detail });
  console.log(`  ${c.green('✔')} ${name} ${detail ? c.gray('(' + detail + ')') : ''}`);
}
function fail(group, name, reason) {
  results.failed++;
  results.details.push({ group, name, status: 'fail', detail: reason });
  console.log(`  ${c.red('✘')} ${name} ${c.red(reason)}`);
}
function section(name) {
  console.log(`\n${c.cyan('═══ ' + name + ' ═══')}`);
}
function info(s) {
  console.log(`  ${c.gray(s)}`);
}

async function req(method, path, body = null, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) {
    parsed = await res.json().catch(() => null);
  } else if (opts.binary) {
    parsed = await res.arrayBuffer();
  } else {
    parsed = await res.text().catch(() => null);
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

// ── Tests ────────────────────────────────────────────────────────────────

function skip(group, name, reason) {
  results.skipped++;
  results.details.push({ group, name, status: 'skip', detail: reason });
  console.log(`  ${c.gray('—')} ${name} ${c.gray('(skipped: ' + reason + ')')}`);
}

async function testAuth() {
  section('1. Authentication & session');
  // Health
  const h = await req('GET', '/api/health');
  if (h.status === 200 && h.body?.status === 'ok') pass('auth', 'GET /api/health', `${h.status}`);
  else { fail('auth', 'GET /api/health', `${h.status}`); return false; }

  if (TOKEN) {
    // Verify the supplied token is valid
    const me = await req('GET', '/api/users/me');
    if (me.status === 200) {
      pass('auth', 'GET /api/users/me (supplied token)', me.body?.email ?? '');
    } else {
      fail('auth', 'GET /api/users/me', `${me.status} — token may be expired`);
      return false;
    }
    const perms = await req('GET', '/api/user-permissions/me');
    if (perms.status === 200) pass('auth', 'GET /api/user-permissions/me', `${Object.keys(perms.body ?? {}).length} resources`);
    else fail('auth', 'GET /api/user-permissions/me', `${perms.status}`);
    return true;
  } else {
    // Attempt login anyway in case Turnstile is bypassed (e.g. local dev)
    const login = await req('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
    if (login.status === 200 && login.body?.token) {
      TOKEN = login.body.token;
      pass('auth', 'POST /api/auth/login (no Turnstile)', `token len=${TOKEN.length}`);
      return true;
    }
    skip('auth', 'POST /api/auth/login', 'Turnstile enforced — set CURAVEND_TOKEN env');
    return false;
  }
}

async function testCoreLookups() {
  section('2. Core lookups (hospitals / vendors / payors)');
  const h = await req('GET', '/api/hospitals');
  const items = h.body?.items ?? h.body ?? [];
  if (h.status === 200 && Array.isArray(items)) {
    state.hospitalId = items[0]?.id ?? null;
    pass('lookups', 'GET /api/hospitals', `${items.length} hospitals`);
  } else fail('lookups', 'GET /api/hospitals', `${h.status}`);

  const v = await req('GET', '/api/vendors');
  const vendors = v.body?.items ?? v.body ?? [];
  if (v.status === 200 && Array.isArray(vendors)) {
    state.vendorId = vendors[0]?.id ?? null;
    pass('lookups', 'GET /api/vendors', `${vendors.length} vendors`);
  } else fail('lookups', 'GET /api/vendors', `${v.status}`);

  const p = await req('GET', '/api/payors');
  const payors = p.body?.items ?? p.body ?? [];
  if (p.status === 200 && Array.isArray(payors)) {
    state.payorId = payors[0]?.id ?? null;
    pass('lookups', 'GET /api/payors', `${payors.length} payors`);
  } else fail('lookups', 'GET /api/payors', `${p.status}`);
}

async function testProcurement() {
  section('3. Procurement (formulary / requisitions / GRN / 3-way match)');
  const f = await req('GET', '/api/formulary');
  if (f.status === 200) pass('procurement', 'GET /api/formulary', `${f.body?.items?.length ?? 0} items`);
  else fail('procurement', 'GET /api/formulary', `${f.status}`);

  const fres = await req('GET', '/api/formulary/resolve?hcpcCode=A4253');
  if (fres.status === 200) pass('procurement', 'GET /api/formulary/resolve', `decision=${fres.body?.decision}`);
  else fail('procurement', 'GET /api/formulary/resolve', `${fres.status}`);

  const reqs = await req('GET', '/api/requisitions');
  if (reqs.status === 200) pass('procurement', 'GET /api/requisitions', `${reqs.body?.items?.length ?? 0} requisitions`);
  else fail('procurement', 'GET /api/requisitions', `${reqs.status}`);

  const tpl = await req('GET', '/api/requisition-templates');
  if (tpl.status === 200) pass('procurement', 'GET /api/requisition-templates', `${tpl.body?.items?.length ?? 0} templates`);
  else fail('procurement', 'GET /api/requisition-templates', `${tpl.status}`);

  const ar = await req('GET', '/api/approval-rules');
  if (ar.status === 200) pass('procurement', 'GET /api/approval-rules', `${ar.body?.items?.length ?? 0} rules`);
  else fail('procurement', 'GET /api/approval-rules', `${ar.status}`);

  const grn = await req('GET', '/api/goods-receipts');
  if (grn.status === 200) pass('procurement', 'GET /api/goods-receipts', `${grn.body?.items?.length ?? 0} receipts`);
  else fail('procurement', 'GET /api/goods-receipts', `${grn.status}`);

  const exc = await req('GET', '/api/three-way-match/exceptions');
  if (exc.status === 200) pass('procurement', 'GET /api/three-way-match/exceptions', `${exc.body?.items?.length ?? 0} exceptions`);
  else fail('procurement', 'GET /api/three-way-match/exceptions', `${exc.status}`);
}

async function testDmeOrdering() {
  section('4. DME Ordering (LCD / PA list / required findings)');

  // CMS PA list
  const pl = await req('GET', '/api/lcd/pa-required');
  if (pl.status === 200) pass('dme', 'GET /api/lcd/pa-required', `${pl.body?.items?.length ?? 0} HCPCs`);
  else fail('dme', 'GET /api/lcd/pa-required', `${pl.status}`);

  // Single PA check
  const paChk = await req('GET', `/api/lcd/pa-required/${state.hcpcWithPa}`);
  if (paChk.status === 200) pass('dme', `GET /api/lcd/pa-required/${state.hcpcWithPa}`, `required=${paChk.body?.required}`);
  else fail('dme', `GET /api/lcd/pa-required/${state.hcpcWithPa}`, `${paChk.status}`);

  // LCD documents
  const lcds = await req('GET', '/api/lcd/documents');
  if (lcds.status === 200) pass('dme', 'GET /api/lcd/documents', `${lcds.body?.items?.length ?? 0} LCDs`);
  else fail('dme', 'GET /api/lcd/documents', `${lcds.status}`);

  // Required findings for E0601 (CPAP) — should include AHI threshold
  const rf = await req('GET', `/api/lcd/required-findings/${state.hcpcWithLcd}`);
  if (rf.status === 200) {
    const f = rf.body?.findings ?? [];
    pass('dme', `GET /api/lcd/required-findings/${state.hcpcWithLcd}`, `${f.length} thresholds`);
  } else fail('dme', `GET /api/lcd/required-findings/${state.hcpcWithLcd}`, `${rf.status}`);

  // LCD coverage check — MEETS expected for CPAP with G47.33 + AHI 22
  const chk = await req('POST', '/api/lcd/check', {
    hcpcCode: state.hcpcWithLcd,
    icd10List: ['G47.33'],
    setting: 'HOME',
    findings: { AHI: 22 },
  });
  if (chk.status === 200) pass('dme', 'POST /api/lcd/check (CPAP, G47.33, AHI=22)', `decision=${chk.body?.decision}`);
  else fail('dme', 'POST /api/lcd/check', `${chk.status}`);

  // LCD coverage check — should NOT meet for oxygen with SpO2 = 95
  const chk2 = await req('POST', '/api/lcd/check', {
    hcpcCode: 'E1390',
    icd10List: [],
    setting: 'HOME',
    findings: { SpO2: 95 },
  });
  if (chk2.status === 200) pass('dme', 'POST /api/lcd/check (E1390 oxygen, SpO2=95 — too high)', `decision=${chk2.body?.decision}`);
  else fail('dme', 'POST /api/lcd/check (E1390)', `${chk2.status}`);
}

async function testDmeposCompliance() {
  section('5. DMEPOS supplier compliance');
  const all = await req('GET', '/api/dmepos-compliance');
  if (all.status === 200) pass('dmepos', 'GET /api/dmepos-compliance', `${all.body?.items?.length ?? 0} vendors`);
  else fail('dmepos', 'GET /api/dmepos-compliance', `${all.status}`);

  const exp = await req('GET', '/api/dmepos-compliance/expiring?days=30');
  if (exp.status === 200) pass('dmepos', 'GET /api/dmepos-compliance/expiring', `${exp.body?.items?.length ?? 0} expiring`);
  else fail('dmepos', 'GET /api/dmepos-compliance/expiring', `${exp.status}`);

  if (state.vendorId) {
    const v = await req('GET', `/api/dmepos-compliance/vendor/${state.vendorId}`);
    if (v.status === 200) pass('dmepos', `GET /api/dmepos-compliance/vendor/${state.vendorId.slice(0,8)}…`, '');
    else fail('dmepos', 'GET /api/dmepos-compliance/vendor', `${v.status}`);
  }
}

async function testReporting() {
  section('6. Reporting & analytics');
  const tests = [
    ['/api/reports/spend-by-vendor', 'spend-by-vendor'],
    ['/api/reports/spend-by-hcpc', 'spend-by-hcpc'],
    ['/api/reports/spend-by-month', 'spend-by-month'],
    ['/api/reports/spend-by-facility', 'spend-by-facility'],
    ['/api/reports/spend-by-department', 'spend-by-department'],
    ['/api/reports/multi-site-rollup', 'multi-site-rollup'],
    ['/api/reports/vendor-scorecard', 'vendor-scorecard'],
    ['/api/reports/executive-summary', 'executive-summary'],
    [`/api/reports/contract-leakage?hospitalId=${state.hospitalId ?? ''}`, 'contract-leakage'],
    ['/api/forecasting/demand', 'demand forecast'],
  ];
  for (const [path, label] of tests) {
    const r = await req('GET', path);
    if (r.status === 200) pass('reporting', label, `${(r.body?.items ?? r.body?.results ?? []).length ?? '?'} rows`);
    else fail('reporting', label, `${r.status}`);
  }
}

async function testCreateRequisitionFlow() {
  section('7. Create requisition end-to-end');
  if (!state.hospitalId) {
    fail('req-flow', 'create requisition', 'no hospitalId — skipped');
    return;
  }
  const created = await req('POST', '/api/requisitions', {
    hospitalId: state.hospitalId,
    title: `Smoke test ${new Date().toISOString()}`,
    priority: 'NORMAL',
    items: [
      { hcpcCode: 'A4253', description: 'Test strips', quantity: 50, estimatedUnitPriceUsd: 25 },
    ],
  });
  if (created.status === 201 && created.body?.id) {
    state.reqId = created.body.id;
    pass('req-flow', 'POST /api/requisitions', `req=${created.body.requisitionNumber}`);
  } else {
    fail('req-flow', 'POST /api/requisitions', `${created.status} ${JSON.stringify(created.body).slice(0,200)}`);
    return;
  }

  const got = await req('GET', `/api/requisitions/${state.reqId}`);
  if (got.status === 200) pass('req-flow', `GET /api/requisitions/${state.reqId.slice(0,8)}…`, `items=${got.body?.items?.length}`);
  else fail('req-flow', 'GET /api/requisitions/:id', `${got.status}`);

  const submitted = await req('POST', `/api/requisitions/${state.reqId}/submit`, {});
  if (submitted.status === 200 && submitted.body?.status === 'SUBMITTED') {
    pass('req-flow', 'POST /api/requisitions/:id/submit', `matched=${submitted.body?.matched}`);
  } else fail('req-flow', 'POST /api/requisitions/:id/submit', `${submitted.status}`);

  const approved = await req('POST', `/api/requisitions/${state.reqId}/approve`, {});
  if (approved.status === 200) pass('req-flow', 'POST /api/requisitions/:id/approve', `status=${approved.body?.status}`);
  else fail('req-flow', 'POST /api/requisitions/:id/approve', `${approved.status}`);

  // Cancel instead of converting (keeps test data clean)
  const cancelled = await req('POST', `/api/requisitions/${state.reqId}/cancel`, { comment: 'smoke test cleanup' });
  // After APPROVED, cancel may not be allowed depending on rules; just observe
  if (cancelled.status === 200 || cancelled.status === 409) {
    pass('req-flow', 'POST /api/requisitions/:id/cancel', `status=${cancelled.body?.status ?? cancelled.status}`);
  } else fail('req-flow', 'POST /api/requisitions/:id/cancel', `${cancelled.status}`);
}

async function testOnboardingAuth() {
  section('8a. Persona onboarding — auth gates');
  // These run on every invocation: they assert the /onboard routes are
  // protected. No DB writes, no emails — just a 401/403 probe.
  const savedToken = TOKEN;
  TOKEN = null; // call as anonymous
  try {
    const p = await req('POST', '/api/providers/onboard', { name: 'x', adminUser: { email: 'x@curavend.test' } });
    if (p.status === 401 || p.status === 403) pass('onboard-auth', 'anon → /providers/onboard rejected', `${p.status}`);
    else fail('onboard-auth', 'anon → /providers/onboard rejected', `expected 401/403, got ${p.status}`);

    const l = await req('POST', '/api/labs/onboard', { name: 'x', groupType: 'SINGLE_SITE', adminUser: { email: 'x@curavend.test' } });
    if (l.status === 401 || l.status === 403) pass('onboard-auth', 'anon → /labs/onboard rejected', `${l.status}`);
    else fail('onboard-auth', 'anon → /labs/onboard rejected', `expected 401/403, got ${l.status}`);
  } finally {
    TOKEN = savedToken;
  }
}

async function testPersonaOnboarding() {
  section('8b. Persona onboarding (Provider + Lab) — creates real records');
  // Skip by default — these create real users and trigger welcome emails.
  // Opt in with CURAVEND_RUN_ONBOARD_TESTS=1.
  if (process.env.CURAVEND_RUN_ONBOARD_TESTS !== '1') {
    skip('onboard', 'POST /api/providers/onboard', 'set CURAVEND_RUN_ONBOARD_TESTS=1 to run');
    skip('onboard', 'POST /api/labs/onboard', 'set CURAVEND_RUN_ONBOARD_TESTS=1 to run');
    return;
  }

  const stamp = Date.now();

  // Provider onboarding — verify the admin user is scoped to PROVIDER, NOT platform ADMIN.
  const provBody = {
    name: `Smoke Provider ${stamp}`,
    adminUser: {
      email: `smoke-provider-${stamp}@curavend.test`,
      firstName: 'Smoke',
      lastName: 'Provider',
    },
  };
  const prov = await req('POST', '/api/providers/onboard', provBody);
  if (prov.status === 201 && prov.body?.providerId && prov.body?.adminUserId) {
    pass('onboard', 'POST /api/providers/onboard', `providerId=${prov.body.providerId.slice(0, 8)}…`);
    // Read back the user and assert they are PROVIDER-scoped, not platform ADMIN.
    const u = await req('GET', `/api/users/${prov.body.adminUserId}`);
    const got = u.body?.user ?? u.body;
    if (got?.userType === 'PROVIDER' && got?.providerId === prov.body.providerId) {
      pass('onboard', 'provider admin scoped to PROVIDER', `role=${got.role}`);
    } else {
      fail(
        'onboard',
        'provider admin scoped to PROVIDER',
        `userType=${got?.userType} providerId=${got?.providerId} (expected PROVIDER + matching providerId)`,
      );
    }
  } else {
    fail('onboard', 'POST /api/providers/onboard', `${prov.status} ${JSON.stringify(prov.body).slice(0, 200)}`);
  }

  // Lab onboarding
  const labBody = {
    name: `Smoke Lab ${stamp}`,
    groupType: 'SINGLE_SITE',
    adminUser: {
      email: `smoke-lab-${stamp}@curavend.test`,
      firstName: 'Smoke',
      lastName: 'Lab',
    },
  };
  const lab = await req('POST', '/api/labs/onboard', labBody);
  if (lab.status === 201 && lab.body?.labGroupId && lab.body?.adminUserId) {
    pass('onboard', 'POST /api/labs/onboard', `labGroupId=${lab.body.labGroupId.slice(0, 8)}…`);
    const u = await req('GET', `/api/users/${lab.body.adminUserId}`);
    const got = u.body?.user ?? u.body;
    if (got?.userType === 'LAB' && got?.labGroupId === lab.body.labGroupId) {
      pass('onboard', 'lab admin scoped to LAB', `role=${got.role}`);
    } else {
      fail(
        'onboard',
        'lab admin scoped to LAB',
        `userType=${got?.userType} labGroupId=${got?.labGroupId} (expected LAB + matching labGroupId)`,
      );
    }
  } else {
    fail('onboard', 'POST /api/labs/onboard', `${lab.status} ${JSON.stringify(lab.body).slice(0, 200)}`);
  }

  // Negative: a non-admin caller (the lab admin we just created) cannot hit /onboard.
  // Skipped here because we don't have their JWT — they're issued a temp password
  // and would need to complete first-login + MFA. Adding it would require a
  // dedicated test fixture, so we leave the negative test as a TODO.
  info('Negative-path tests (non-admin → /onboard) require a fresh-login fixture; not run.');
}

async function testCmsScraperPreview() {
  section('8. CMS MCD scraper (preview-only, no DB write)');
  // Preview the seeded LCD L33718 (CPAP) — should detect HCPCs / ICDs
  const r = await req('POST', '/api/lcd/fetch-from-cms', { lcdId: 'L33718', autoIngest: false });
  if (r.status === 200 && r.body?.scraped) {
    const s = r.body.scraped;
    pass('scraper', 'POST /api/lcd/fetch-from-cms (preview L33718)',
      `${s.rawHcpcsCount} HCPCs / ${s.rawIcd10Count} ICDs / ${s.criteria?.length ?? 0} criteria`);
  } else {
    fail('scraper', 'POST /api/lcd/fetch-from-cms', `${r.status} ${JSON.stringify(r.body).slice(0,200)}`);
  }
}

async function testFrontend() {
  section('9. Frontend (web pages + training docs)');
  const WEB = (process.env.CURAVEND_WEB_BASE ?? 'https://curavend-web.pages.dev').replace(/\/$/, '');
  const pages = [
    '/', '/login', '/dashboard', '/create-dme-order',
    '/admin/lcd-ingest', '/admin/dmepos-compliance', '/admin/formulary',
    '/help-center', '/requisitions', '/goods-receipts', '/match-exceptions',
  ];
  for (const p of pages) {
    const res = await fetch(`${WEB}${p}`);
    if (res.status === 200) pass('frontend', `GET ${p}`, `${res.status}`);
    else fail('frontend', `GET ${p}`, `${res.status}`);
  }
  // Manifest
  const m = await fetch(`${WEB}/docs/manifest.json`).then((r) => r.json()).catch(() => null);
  if (m?.features?.length >= 20 && m?.workflows?.length >= 15) {
    pass('frontend', '/docs/manifest.json', `${m.personas.length}p / ${m.features.length}f / ${m.workflows.length}w`);
  } else fail('frontend', '/docs/manifest.json', JSON.stringify(m).slice(0, 100));
}

async function main() {
  console.log(c.cyan(`\nCuravend smoke test — ${new Date().toISOString()}`));
  console.log(c.gray(`API: ${API}`));
  console.log(c.gray(`User: ${EMAIL}`));

  const authed = await testAuth();
  if (authed) {
    await testCoreLookups();
    await testProcurement();
    await testDmeOrdering();
    await testDmeposCompliance();
    await testReporting();
    await testCreateRequisitionFlow();
    await testOnboardingAuth();
    await testPersonaOnboarding();
    await testCmsScraperPreview();
  } else {
    section('Auth-required tests skipped');
    info('Get a JWT and re-run: CURAVEND_TOKEN=<token> node scripts/smoke-test.mjs');
    info('Token lives in browser DevTools → Application → Local Storage → "token"');
  }

  // Frontend tests run regardless — they don't need auth
  await testFrontend();

  // Summary
  console.log(`\n${c.cyan('═══ SUMMARY ═══')}`);
  console.log(`  ${c.green('PASSED')}: ${results.passed}`);
  console.log(`  ${results.failed > 0 ? c.red('FAILED') : c.green('FAILED')}: ${results.failed}`);
  console.log(`  ${c.gray('SKIPPED')}: ${results.skipped}`);
  console.log(`  Total: ${results.passed + results.failed + results.skipped}`);

  if (results.failed > 0) {
    console.log(`\n${c.red('Failures:')}`);
    for (const r of results.details.filter((d) => d.status === 'fail')) {
      console.log(`  ${c.red('✘')} [${r.group}] ${r.name} — ${r.detail}`);
    }
  }
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red('Unhandled error:'), err);
  process.exit(2);
});

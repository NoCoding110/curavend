#!/usr/bin/env node
/**
 * Capture screenshots of every documented page on the live Curavend
 * deployment using Puppeteer. Writes PNGs to docs/training/images/.
 *
 * Prerequisites:
 *   npm i -g puppeteer  (or run via npx)
 *
 * Run:
 *   node capture-screenshots.mjs
 *
 * Configure with environment variables:
 *   CURAVEND_BASE_URL    default https://curavend-web.pages.dev
 *   CURAVEND_EMAIL       login email
 *   CURAVEND_PASSWORD    login password
 *   CURAVEND_ROLE        hospital | vendor | lab | provider | super-vendor | admin
 *                        determines which set of pages to capture
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../images');

const BASE = process.env.CURAVEND_BASE_URL ?? 'https://curavend-web.pages.dev';
const EMAIL = process.env.CURAVEND_EMAIL;
const PASSWORD = process.env.CURAVEND_PASSWORD;
const ROLE = (process.env.CURAVEND_ROLE ?? 'admin').toLowerCase();

if (!EMAIL || !PASSWORD) {
  console.error('Set CURAVEND_EMAIL and CURAVEND_PASSWORD env vars.');
  process.exit(1);
}

// Pages to capture, keyed by role. Each entry: [route, filename-without-ext, optional-wait-selector].
const PAGES_BY_ROLE = {
  admin: [
    ['/dashboard',                          'admin-dashboard'],
    ['/provider-orders',                    'admin-orders-list'],
    ['/approvals',                          'admin-approvals'],
    ['/requisitions',                       'admin-requisitions'],
    ['/requisition-templates',              'admin-requisition-templates'],
    ['/goods-receipts',                     'admin-goods-receipts'],
    ['/match-exceptions',                   'admin-match-exceptions'],
    ['/prior-auths',                        'admin-prior-auths'],
    ['/billing-orders',                     'admin-invoices'],
    ['/contract-pricing',                   'admin-contracts'],
    ['/admin/formulary',                    'admin-formulary'],
    ['/admin/gpo-contracts',                'admin-gpo'],
    ['/admin/payors',                       'admin-payors'],
    ['/admin/ehr-connections',              'admin-ehr'],
    ['/admin/approval-rules',               'admin-approval-rules'],
    ['/admin/workflows',                    'admin-workflows'],
    ['/reporting/multi-site-spend',         'admin-multi-site-spend'],
    ['/reporting/contract-leakage',         'admin-contract-leakage'],
    ['/reporting/forecast',                 'admin-forecast'],
    ['/vendors',                            'admin-vendors'],
    ['/hospitals',                          'admin-hospitals'],
    ['/admin',                              'admin-panel'],
    ['/admin/approvals',                    'admin-user-approvals'],
  ],
  hospital: [
    ['/dashboard',                          'hospital-dashboard'],
    ['/provider-orders',                    'hospital-orders-list'],
    ['/create-order',                       'hospital-create-order'],
    ['/approvals',                          'hospital-approvals'],
    ['/requisitions',                       'hospital-requisitions'],
    ['/billing-orders',                     'hospital-invoices'],
    ['/contract-pricing',                   'hospital-contracts'],
    ['/hospital-facilities',                'hospital-facilities'],
    ['/hospital-departments',               'hospital-departments'],
    ['/hospital-physicians',                'hospital-physicians'],
    ['/facility-vendors',                   'hospital-vendors'],
    ['/sku-catalog',                        'hospital-catalog'],
    ['/price-lookup',                       'hospital-price-lookup'],
  ],
  vendor: [
    ['/dashboard',                          'vendor-dashboard'],
    ['/provider-orders',                    'vendor-orders-list'],
    ['/billing-orders',                     'vendor-invoices'],
    ['/inventory-management',               'vendor-inventory'],
    ['/vendor-skus',                        'vendor-skus'],
    ['/stock-feeds',                        'vendor-stock-feeds'],
    ['/erp-connectors',                     'vendor-erp'],
    ['/vendor-locations',                   'vendor-locations'],
    ['/purchase-orders',                    'vendor-purchase-orders'],
    ['/consignment',                        'vendor-consignment'],
  ],
  lab: [
    ['/labs',                               'lab-dashboard'],
    ['/labs/orders',                        'lab-orders'],
    ['/labs/groups',                        'lab-groups'],
    ['/labs/kit-sites',                     'lab-kit-sites'],
  ],
  provider: [
    ['/dashboard',                          'provider-dashboard'],
    ['/provider-orders',                    'provider-orders'],
    ['/approvals',                          'provider-approvals'],
    ['/prior-auths',                        'provider-prior-auths'],
  ],
};

async function loadPuppeteer() {
  try {
    const mod = await import('puppeteer');
    return mod.default ?? mod;
  } catch {
    console.error(
      'puppeteer is not installed. Run `npm i puppeteer` (or `pnpm add -D puppeteer` at repo root) and re-run.',
    );
    process.exit(1);
  }
}

async function main() {
  const pages = PAGES_BY_ROLE[ROLE];
  if (!pages) {
    console.error(`Unknown role: ${ROLE}. Choose from: ${Object.keys(PAGES_BY_ROLE).join(', ')}`);
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const puppeteer = await loadPuppeteer();
  console.log(`Launching headless browser…`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Login
  console.log(`Logging in as ${EMAIL}…`);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });
  await page.type('input[type="email"], input[name="email"]', EMAIL);
  await page.type('input[type="password"], input[name="password"]', PASSWORD);
  // Wait for Turnstile if present
  await new Promise((r) => setTimeout(r, 8000));
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
  ]);
  console.log(`Logged in. Current URL: ${page.url()}`);

  // Capture each page
  for (const [route, filename] of pages) {
    const fullUrl = `${BASE}${route}`;
    console.log(`📸 ${route} → ${filename}.png`);
    try {
      await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1500)); // let any deferred content render
      await page.screenshot({
        path: path.join(OUT_DIR, `${filename}.png`),
        fullPage: false,
      });
    } catch (err) {
      console.warn(`  ⚠ Failed: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`Done. ${pages.length} screenshots in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('capture-screenshots failed:', err);
  process.exit(1);
});

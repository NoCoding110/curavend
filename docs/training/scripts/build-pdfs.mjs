#!/usr/bin/env node
/**
 * Bundle the training docs into role-specific PDFs.
 *
 * Output: docs/training/dist/curavend-{role}.pdf, plus a full reference at
 *         docs/training/dist/curavend-complete.pdf.
 *
 * Uses puppeteer to render HTML (produced from markdown via the `marked`
 * package) into print-styled PDF.
 *
 * Run:
 *   node build-pdfs.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, '../dist');

// Persona -> ordered list of MD files included in that persona's PDF.
// Keep persona-relevant docs only, but include README front matter at the top.
const PERSONA_BUNDLES = {
  hospital: [
    'README.md',
    'personas/hospital.md',
    'features/01-dashboard.md',
    'features/02-orders.md',
    'features/03-requisitions.md',
    'features/04-formulary.md',
    'features/05-approvals.md',
    'features/06-prior-auths.md',
    'features/07-goods-receipts.md',
    'features/08-three-way-match.md',
    'features/09-invoices.md',
    'features/10-contracts-pricing.md',
    'features/11-gpo-contracts.md',
    'features/14-multi-site-spend.md',
    'features/15-contract-leakage.md',
    'workflows/02-create-and-submit-requisition.md',
    'workflows/03-approve-requisition-and-convert.md',
    'workflows/04-record-goods-receipt.md',
    'workflows/05-resolve-match-exception.md',
    'workflows/07-create-formulary-with-substitutes.md',
    'workflows/08-process-prior-authorization.md',
    'workflows/09-run-multi-site-spend-report.md',
    'workflows/10-detect-contract-leakage.md',
  ],
  vendor: [
    'README.md',
    'personas/vendor.md',
    'features/01-dashboard.md',
    'features/02-orders.md',
    'features/07-goods-receipts.md',
    'features/09-invoices.md',
    'features/10-contracts-pricing.md',
    'features/17-vendor-scorecard.md',
  ],
  lab: ['README.md', 'personas/lab.md'],
  provider: [
    'README.md',
    'personas/provider.md',
    'features/02-orders.md',
    'features/06-prior-auths.md',
    'workflows/02-create-and-submit-requisition.md',
    'workflows/08-process-prior-authorization.md',
  ],
  'super-vendor': [
    'README.md',
    'personas/super-vendor.md',
    'features/02-orders.md',
    'features/09-invoices.md',
  ],
  admin: 'ALL', // shortcut: include every doc
};

async function loadModules() {
  let puppeteer, marked;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.error('puppeteer not installed. Run `pnpm add -w puppeteer marked` at repo root.');
    process.exit(1);
  }
  try {
    marked = (await import('marked')).marked;
  } catch {
    console.error('marked not installed. Run `pnpm add -w marked` at repo root.');
    process.exit(1);
  }
  return { puppeteer, marked };
}

async function allDocsInOrder() {
  const out = ['README.md'];
  for (const sub of ['personas', 'features', 'workflows']) {
    try {
      const files = (await fs.readdir(path.join(SRC, sub))).sort();
      for (const f of files) if (f.endsWith('.md')) out.push(`${sub}/${f}`);
    } catch { /* dir may not exist */ }
  }
  return out;
}

function html(title, body) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.55; color: #222; padding: 32px 48px; max-width: 920px; margin: 0 auto; }
  h1 { font-size: 26px; border-bottom: 2px solid #ddd; padding-bottom: 8px; page-break-before: always; }
  h1:first-of-type { page-break-before: avoid; }
  h2 { font-size: 18px; margin-top: 24px; color: #1f1f1f; }
  h3 { font-size: 15px; margin-top: 18px; }
  code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-size: 12px; color: #c7254e; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 4px; overflow-x: auto; border: 1px solid #e1e4e8; }
  pre code { background: transparent; color: inherit; padding: 0; }
  table { border-collapse: collapse; margin: 12px 0; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 13px; }
  th { background: #f6f8fa; }
  blockquote { border-left: 3px solid #1BAEE5; padding: 6px 12px; color: #555; margin: 12px 0; }
  img { max-width: 100%; }
  hr.divider { margin: 32px 0; border: none; border-top: 1px dashed #ccc; }
  .toc { background: #fafafa; padding: 16px 20px; border-radius: 6px; border: 1px solid #eee; margin-bottom: 24px; }
  .toc ul { margin: 4px 0; padding-left: 20px; }
  a { color: #1BAEE5; text-decoration: none; }
</style>
</head>
<body>${body}</body></html>`;
}

async function bundleBody(files, marked) {
  const parts = [];
  for (const f of files) {
    const p = path.join(SRC, f);
    try {
      const md = await fs.readFile(p, 'utf8');
      // Rewrite relative image paths so the PDF can find them as file:// URLs
      const adjusted = md.replace(/!\[([^\]]*)\]\(\.\.\/images\//g, `![$1](${path.join(SRC, 'images').replace(/\\/g, '/')}/`);
      parts.push(marked.parse(adjusted));
      parts.push('<hr class="divider"/>');
    } catch (err) {
      parts.push(`<p><em>Missing: ${f}</em></p>`);
    }
  }
  return parts.join('\n');
}

async function buildPdf(puppeteer, title, htmlContent, outPath) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: outPath,
    format: 'Letter',
    margin: { top: '24mm', right: '20mm', bottom: '24mm', left: '20mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:9px; width:100%; padding:0 20mm; color:#888;">${title}</div>`,
    footerTemplate: `<div style="font-size:9px; width:100%; padding:0 20mm; color:#888; text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  await browser.close();
}

async function main() {
  const { puppeteer, marked } = await loadModules();
  await fs.mkdir(OUT, { recursive: true });

  for (const [role, files] of Object.entries(PERSONA_BUNDLES)) {
    const list = files === 'ALL' ? await allDocsInOrder() : files;
    console.log(`📕 Building curavend-${role}.pdf (${list.length} sections)…`);
    const body = await bundleBody(list, marked);
    const title = `Curavend Training — ${role.toUpperCase()}`;
    const doc = html(title, `<h1>${title}</h1><p><em>Generated ${new Date().toISOString().slice(0, 10)}</em></p>${body}`);
    await buildPdf(puppeteer, title, doc, path.join(OUT, `curavend-${role}.pdf`));
  }

  // Complete reference
  console.log(`📘 Building curavend-complete.pdf (all docs)…`);
  const all = await allDocsInOrder();
  const body = await bundleBody(all, marked);
  const title = 'Curavend Training — Complete Reference';
  const doc = html(title, `<h1>${title}</h1><p><em>Generated ${new Date().toISOString().slice(0, 10)}</em></p>${body}`);
  await buildPdf(puppeteer, title, doc, path.join(OUT, 'curavend-complete.pdf'));

  console.log(`Done. PDFs in ${OUT}`);
}

main().catch((err) => {
  console.error('build-pdfs failed:', err);
  process.exit(1);
});

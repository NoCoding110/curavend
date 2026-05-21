/**
 * Lab order asset generation workflow.
 *
 * Triggered after a lab order is created. Produces:
 *   1. TRF (Test Request Form) PDF — Browser Rendering
 *   2. Shipping label PDF — pdf-lib programmatic
 *   3. Return label PDF — pdf-lib programmatic
 *   4. Stickers PDF — pdf-lib + bwip-js barcodes
 *   5. Merged consolidated assets PDF
 *   6. Mark lab order READY_FOR_APPROVAL
 *
 * Each step is idempotent: it checks for an existing blob key and re-uses it
 * if present, so a retried step doesn't generate duplicate work.
 */
import { eq } from 'drizzle-orm';
import { labOrders, labKitSites, labGroups, labOrderItems } from '@curavend/db';
import { getDb } from '../lib/db';
import type { Env } from '../lib/env';
import {
  renderHtmlToPdfWithFallback,
  renderProgrammaticPdf,
  mergePdfs,
} from '../services/pdfService';
import { uploadFile, buildStorageKey } from '../services/storageService';

interface LabAssetGenContext {
  labOrderId: string;
  trfBlobKey?: string;
  shippingLabelBlobKey?: string;
  returnLabelBlobKey?: string;
  stickersBlobKey?: string;
  consolidatedBlobKey?: string;
}

async function loadLabOrder(env: Env, labOrderId: string) {
  const db = getDb(env.DB);
  const orderRows = await db
    .select()
    .from(labOrders)
    .where(eq(labOrders.id, labOrderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) throw new Error(`Lab order ${labOrderId} not found`);
  const groupRows = await db
    .select()
    .from(labGroups)
    .where(eq(labGroups.id, order.labGroupId))
    .limit(1);
  const site = order.kitSiteId
    ? (
        await db
          .select()
          .from(labKitSites)
          .where(eq(labKitSites.id, order.kitSiteId))
          .limit(1)
      )[0]
    : null;
  const items = await db
    .select()
    .from(labOrderItems)
    .where(eq(labOrderItems.labOrderId, order.id));
  return { order, group: groupRows[0] ?? null, site, items };
}

async function generateTrf(env: Env, ctx: LabAssetGenContext): Promise<Partial<LabAssetGenContext>> {
  // Idempotent: skip if already generated
  const db = getDb(env.DB);
  const existing = (
    await db
      .select()
      .from(labOrders)
      .where(eq(labOrders.id, ctx.labOrderId))
      .limit(1)
  )[0];
  if (existing?.trfBlobKey) return { trfBlobKey: existing.trfBlobKey };

  const { order, group, site, items } = await loadLabOrder(env, ctx.labOrderId);
  const html = renderTrfHtml({ order, group, site, items });
  const { bytes } = await renderHtmlToPdfWithFallback(env.BROWSER, html, `TRF - ${order.orderNumber}`);
  const key = buildStorageKey(
    `lab-orders/${order.id}/trf`,
    `${order.orderNumber}-trf.pdf`,
  );
  await uploadFile(
    env.R2,
    key,
    bytes.buffer as ArrayBuffer,
    'application/pdf',
    { kind: 'lab-trf', labOrderId: order.id },
  );
  await db
    .update(labOrders)
    .set({ trfBlobKey: key, updatedAt: new Date().toISOString() })
    .where(eq(labOrders.id, order.id));
  return { trfBlobKey: key };
}

async function generateShippingLabel(env: Env, ctx: LabAssetGenContext): Promise<Partial<LabAssetGenContext>> {
  const db = getDb(env.DB);
  const existing = (
    await db
      .select()
      .from(labOrders)
      .where(eq(labOrders.id, ctx.labOrderId))
      .limit(1)
  )[0];
  if (existing?.shippingLabelBlobKey) return { shippingLabelBlobKey: existing.shippingLabelBlobKey };

  const { order, site } = await loadLabOrder(env, ctx.labOrderId);
  const bytes = await renderProgrammaticPdf({
    title: `Shipping Label ${order.orderNumber}`,
    pages: [
      {
        width: 288, // 4 in
        height: 432, // 6 in (shipping label size)
        blocks: [
          { type: 'text', text: 'SHIP TO:', x: 12, y: 400, size: 10, bold: true },
          { type: 'text', text: order.patientName ?? site?.siteName ?? 'Patient', x: 12, y: 380, size: 14, bold: true },
          { type: 'text', text: order.patientAddress ?? site?.addressLine1 ?? '', x: 12, y: 360, size: 11 },
          { type: 'text', text: `${order.patientCity ?? site?.city ?? ''}, ${order.patientState ?? site?.state ?? ''} ${order.patientZip ?? site?.zip ?? ''}`, x: 12, y: 344, size: 11 },
          { type: 'line', x1: 12, y1: 320, x2: 276, y2: 320, width: 1 },
          { type: 'text', text: 'FROM:', x: 12, y: 296, size: 10, bold: true },
          { type: 'text', text: 'Curavend Lab Services', x: 12, y: 278, size: 12, bold: true },
          { type: 'text', text: '123 Healthcare Way', x: 12, y: 262, size: 10 },
          { type: 'text', text: 'Boston, MA 02118', x: 12, y: 248, size: 10 },
          { type: 'line', x1: 12, y1: 228, x2: 276, y2: 228, width: 1 },
          { type: 'text', text: `Order #: ${order.orderNumber}`, x: 12, y: 200, size: 11, bold: true },
          { type: 'text', text: `Tracking: ${order.trackingNumber ?? 'pending'}`, x: 12, y: 184, size: 10 },
          { type: 'barcode', value: order.orderNumber, format: 'code128', x: 36, y: 60, width: 216, height: 90 },
        ],
      },
    ],
  });
  const key = buildStorageKey(`lab-orders/${order.id}/shipping`, `${order.orderNumber}-shipping.pdf`);
  await uploadFile(env.R2, key, bytes.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'lab-shipping',
    labOrderId: order.id,
  });
  await db
    .update(labOrders)
    .set({ shippingLabelBlobKey: key, updatedAt: new Date().toISOString() })
    .where(eq(labOrders.id, order.id));
  return { shippingLabelBlobKey: key };
}

async function generateReturnLabel(env: Env, ctx: LabAssetGenContext): Promise<Partial<LabAssetGenContext>> {
  const db = getDb(env.DB);
  const existing = (
    await db
      .select()
      .from(labOrders)
      .where(eq(labOrders.id, ctx.labOrderId))
      .limit(1)
  )[0];
  if (existing?.returnLabelBlobKey) return { returnLabelBlobKey: existing.returnLabelBlobKey };

  const { order } = await loadLabOrder(env, ctx.labOrderId);
  const bytes = await renderProgrammaticPdf({
    title: `Return Label ${order.orderNumber}`,
    pages: [
      {
        width: 288,
        height: 432,
        blocks: [
          { type: 'text', text: 'PREPAID RETURN', x: 12, y: 400, size: 12, bold: true },
          { type: 'text', text: 'RETURN TO:', x: 12, y: 376, size: 10, bold: true },
          { type: 'text', text: 'Curavend Lab Receiving', x: 12, y: 360, size: 14, bold: true },
          { type: 'text', text: '456 Specimen Drive', x: 12, y: 344, size: 11 },
          { type: 'text', text: 'Burlington, NC 27215', x: 12, y: 328, size: 11 },
          { type: 'line', x1: 12, y1: 308, x2: 276, y2: 308, width: 1 },
          { type: 'text', text: `Return Auth #: ${order.orderNumber}-R`, x: 12, y: 280, size: 11, bold: true },
          { type: 'text', text: 'Use included pre-paid label.', x: 12, y: 260, size: 10 },
          { type: 'barcode', value: `${order.orderNumber}-R`, format: 'code128', x: 36, y: 60, width: 216, height: 90 },
        ],
      },
    ],
  });
  const key = buildStorageKey(`lab-orders/${order.id}/return`, `${order.orderNumber}-return.pdf`);
  await uploadFile(env.R2, key, bytes.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'lab-return',
    labOrderId: order.id,
  });
  await db
    .update(labOrders)
    .set({ returnLabelBlobKey: key, updatedAt: new Date().toISOString() })
    .where(eq(labOrders.id, order.id));
  return { returnLabelBlobKey: key };
}

async function generateStickers(env: Env, ctx: LabAssetGenContext): Promise<Partial<LabAssetGenContext>> {
  const db = getDb(env.DB);
  const existing = (
    await db
      .select()
      .from(labOrders)
      .where(eq(labOrders.id, ctx.labOrderId))
      .limit(1)
  )[0];
  if (existing?.stickersBlobKey) return { stickersBlobKey: existing.stickersBlobKey };

  const { order, items } = await loadLabOrder(env, ctx.labOrderId);
  // Letter-size page; 2x5 sticker grid (4"x1")
  const stickerWidth = 288; // 4 in
  const stickerHeight = 72; // 1 in
  const blocks = [];
  let y = 720;
  let col = 0;
  for (let i = 0; i < Math.max(items.length, 1); i++) {
    const item = items[i];
    const x = col === 0 ? 18 : 306;
    blocks.push(
      { type: 'text' as const, text: order.orderNumber, x: x + 6, y: y + 50, size: 10, bold: true },
      { type: 'text' as const, text: order.patientName ?? 'Patient', x: x + 6, y: y + 34, size: 9 },
      { type: 'text' as const, text: item?.testName ?? 'Test', x: x + 6, y: y + 18, size: 9 },
      { type: 'barcode' as const, value: item?.barcode ?? `${order.orderNumber}-${i + 1}`, format: 'code128' as const, x: x + 130, y: y + 8, width: 150, height: 54 },
    );
    if (col === 0) {
      col = 1;
    } else {
      col = 0;
      y -= stickerHeight + 6;
    }
    if (y < 36) break;
  }
  const bytes = await renderProgrammaticPdf({
    title: `Stickers ${order.orderNumber}`,
    pages: [{ width: 612, height: 792, blocks }],
  });
  const key = buildStorageKey(`lab-orders/${order.id}/stickers`, `${order.orderNumber}-stickers.pdf`);
  await uploadFile(env.R2, key, bytes.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'lab-stickers',
    labOrderId: order.id,
  });
  await db
    .update(labOrders)
    .set({ stickersBlobKey: key, updatedAt: new Date().toISOString() })
    .where(eq(labOrders.id, order.id));
  return { stickersBlobKey: key };
}

async function mergeConsolidated(env: Env, ctx: LabAssetGenContext): Promise<Partial<LabAssetGenContext>> {
  const db = getDb(env.DB);
  const existing = (
    await db
      .select()
      .from(labOrders)
      .where(eq(labOrders.id, ctx.labOrderId))
      .limit(1)
  )[0];
  if (existing?.consolidatedAssetsBlobKey) return { consolidatedBlobKey: existing.consolidatedAssetsBlobKey };
  if (!existing) throw new Error('Lab order missing during merge');

  const buffers: Uint8Array[] = [];
  for (const key of [
    existing.trfBlobKey,
    existing.shippingLabelBlobKey,
    existing.returnLabelBlobKey,
    existing.stickersBlobKey,
  ]) {
    if (!key) continue;
    const obj = await env.R2.get(key);
    if (!obj) continue;
    buffers.push(new Uint8Array(await obj.arrayBuffer()));
  }
  if (!buffers.length) throw new Error('No PDFs to merge');
  const merged = await mergePdfs(buffers);
  const key = buildStorageKey(
    `lab-orders/${existing.id}/consolidated`,
    `${existing.orderNumber}-consolidated.pdf`,
  );
  await uploadFile(env.R2, key, merged.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'lab-consolidated',
    labOrderId: existing.id,
  });
  await db
    .update(labOrders)
    .set({ consolidatedAssetsBlobKey: key, updatedAt: new Date().toISOString() })
    .where(eq(labOrders.id, existing.id));
  return { consolidatedBlobKey: key };
}

async function markReadyForApproval(env: Env, ctx: LabAssetGenContext): Promise<Partial<LabAssetGenContext>> {
  const db = getDb(env.DB);
  await db
    .update(labOrders)
    .set({
      status: 'READY_FOR_APPROVAL',
      readyForApproval: 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(labOrders.id, ctx.labOrderId));
  return {};
}

function renderTrfHtml(input: {
  order: any;
  group: any;
  site: any;
  items: any[];
}): string {
  const { order, group, site, items } = input;
  const tests = (() => {
    try {
      return order.testList ? JSON.parse(order.testList) : items.map((i) => ({ testCode: i.testCode, testName: i.testName }));
    } catch {
      return [];
    }
  })();
  const dxCodes = (() => {
    try {
      return order.dxCodeList ? JSON.parse(order.dxCodeList) : [];
    } catch {
      return [];
    }
  })();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>TRF ${escapeHtml(order.orderNumber)}</title>
<style>
body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; color: #111; }
h1 { background: #1e3a5f; color: #fff; padding: 16px; margin: 0 -24px 16px; text-align: center; }
h2 { font-size: 14px; background: #f3f4f6; padding: 8px 12px; border-left: 4px solid #1baee5; margin-top: 20px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; }
th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 12px; }
th { background: #f9fafb; }
.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 12px; }
.kv .row { display: flex; }
.kv .label { color: #6b7280; min-width: 120px; }
.kv .value { font-weight: 600; }
.footer { margin-top: 32px; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head><body>
<h1>Test Request Form</h1>
<h2>Order Information</h2>
<div class="kv">
  <div class="row"><span class="label">Order #</span><span class="value">${escapeHtml(order.orderNumber)}</span></div>
  <div class="row"><span class="label">Reference</span><span class="value">${escapeHtml(order.lcOrderReference ?? '—')}</span></div>
  <div class="row"><span class="label">Group</span><span class="value">${escapeHtml(group?.name ?? '—')} (${escapeHtml(group?.groupType ?? '')})</span></div>
  <div class="row"><span class="label">Site</span><span class="value">${escapeHtml(site?.siteName ?? '—')}${site?.siteNumber ? ' #' + escapeHtml(site.siteNumber) : ''}</span></div>
</div>
<h2>Patient</h2>
<div class="kv">
  <div class="row"><span class="label">Name</span><span class="value">${escapeHtml(order.patientName ?? '')} ${escapeHtml(order.patientLastName ?? '')}</span></div>
  <div class="row"><span class="label">Email</span><span class="value">${escapeHtml(order.patientEmail ?? '—')}</span></div>
  <div class="row"><span class="label">Phone</span><span class="value">${escapeHtml(order.patientPhone ?? '—')}</span></div>
  <div class="row"><span class="label">Address</span><span class="value">${escapeHtml(order.patientAddress ?? '')}, ${escapeHtml(order.patientCity ?? '')}, ${escapeHtml(order.patientState ?? '')} ${escapeHtml(order.patientZip ?? '')}</span></div>
</div>
<h2>Diagnosis Codes (ICD-10)</h2>
<table><thead><tr><th>Code</th></tr></thead><tbody>
${(dxCodes as any[]).map((c: any) => `<tr><td>${escapeHtml(String(c?.code ?? c))}</td></tr>`).join('') || '<tr><td>—</td></tr>'}
</tbody></table>
<h2>Tests Requested</h2>
<table><thead><tr><th>Test Code</th><th>Test Name</th></tr></thead><tbody>
${(tests as any[]).map((t: any) => `<tr><td>${escapeHtml(t.testCode ?? '')}</td><td>${escapeHtml(t.testName ?? '')}</td></tr>`).join('') || '<tr><td colspan="2">—</td></tr>'}
</tbody></table>
<div class="footer">Generated by Curavend on ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const labOrderAssetGenWorkflow = {
  type: 'LAB_ORDER_ASSET_GEN',
  steps: [
    { name: 'generateTrf', execute: generateTrf },
    { name: 'generateShippingLabel', execute: generateShippingLabel },
    { name: 'generateReturnLabel', execute: generateReturnLabel },
    { name: 'generateStickers', execute: generateStickers },
    { name: 'mergeConsolidated', execute: mergeConsolidated },
    { name: 'markReadyForApproval', execute: markReadyForApproval },
  ],
};

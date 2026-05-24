/**
 * /api/dme-bundle — generate Medicare-compliant DWO PDF and claim-ready bundle
 * for a DME order.
 *
 *   GET /:orderId/dwo.pdf           — DWO PDF inline (single document)
 *   GET /:orderId/claim-bundle.pdf  — merged PDF: DWO + every received document
 *                                     + PA approval letter + delivery POD.
 *                                     Ready to submit to payor.
 *
 * Both endpoints render via Cloudflare Browser Rendering (DWO HTML → PDF)
 * and merge with pdf-lib using existing pdfService.mergePdfs.
 *
 * All file reads from R2 use the same blobKey scheme used by /api/uploads.
 */
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orders,
  orderItems,
  payors,
  dmeOrderExtensions,
  dmeOrderDocuments,
  priorAuths,
  orderShipments,
  hospitals,
} from '@curavend/db';
import { NotFoundError, ConflictError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { renderHtmlToPdf, mergePdfs, imageToPdf } from '../services/pdfService';
import { renderDwoHtml } from '../services/dmeDwoTemplate';

/** Convert any bytes (PDF / PNG / JPG) to PDF for merging. Returns null on
 * unsupported MIME (caller skips). */
async function bytesToPdf(bytes: Uint8Array, mimeType: string | null, fileName: string | null): Promise<Uint8Array | null> {
  const lowerName = (fileName ?? '').toLowerCase();
  const isPdf = mimeType?.includes('pdf') || lowerName.endsWith('.pdf');
  const isPng = mimeType?.includes('png') || lowerName.endsWith('.png');
  const isJpg = mimeType === 'image/jpeg' || mimeType === 'image/jpg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
  if (isPdf) return bytes;
  if (isPng || isJpg) {
    // Convert raw bytes to base64 (chunked to avoid call-stack overflow on large images)
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
    }
    const b64 = btoa(bin);
    return imageToPdf(b64, isPng ? 'image/png' : 'image/jpeg');
  }
  return null;
}

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

/** Fetch signature blob from R2 and return it as a data URL embeddable in HTML. */
async function loadSignatureDataUrl(r2: R2Bucket, blobKey: string | null | undefined): Promise<string | null> {
  if (!blobKey) return null;
  try {
    const obj = await r2.get(blobKey);
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    // Chunked base64 to avoid call-stack overflow
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
    }
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/** Build the data envelope for a DWO from joined order data. */
async function loadDwoData(d1: D1Database, orderId: string) {
  const db = getDb(d1);
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const [ext] = await db
    .select()
    .from(dmeOrderExtensions)
    .where(eq(dmeOrderExtensions.orderId, orderId))
    .limit(1);

  let payorName: string | null = null;
  if ((ord as any).payorId) {
    const [p] = await db.select().from(payors).where(eq(payors.id, (ord as any).payorId)).limit(1);
    payorName = (p as any)?.name ?? null;
  }

  let hospitalName: string | null = null;
  if ((ord as any).hospitalId) {
    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, (ord as any).hospitalId)).limit(1);
    hospitalName = (h as any)?.name ?? null;
  }

  // Patient name fallback chain
  const patientName =
    [(ord as any).patientName, (ord as any).patientLastName].filter(Boolean).join(' ').trim() ||
    'Beneficiary';

  return {
    order: ord,
    items,
    ext,
    payorName,
    hospitalName,
    patientName,
  };
}

// ─── GET /:orderId/dwo.pdf ─────────────────────────────────────────────────
app.get('/:orderId/dwo.pdf', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const data = await loadDwoData(c.env.DB, orderId);
  if (!isAdmin(user) && user.hospitalId && (data.order as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }

  const signatureDataUrl = await loadSignatureDataUrl(c.env.R2, (data.ext as any)?.dwoSignatureBlobKey);
  const html = renderDwoHtml({
    orderIdentifier: (data.order as any).identifier ?? orderId,
    orderDate: (data.order as any).createdAt,
    patientName: data.patientName,
    patientDob: (data.order as any).patientBirthDate,
    patientAddress: (data.order as any).patientAddress,
    patientPhone: (data.order as any).patientPhone,
    prescriberName: (data.order as any).authProvider ?? (data.order as any).refProvider,
    prescriberNpi: (data.ext as any)?.dwoSignedByNpi ?? null,
    prescriberPhone: null,
    prescriberSignedDate: (data.ext as any)?.dwoSignedAt ?? (data.order as any).signDateTime,
    prescriberSignatureLine: null,
    signatureDataUrl,
    signatureSignedByName: (data.ext as any)?.dwoSignedByName ?? null,
    signatureSignedByNpi: (data.ext as any)?.dwoSignedByNpi ?? null,
    items: data.items.map((i: any) => ({ code: i.code, description: i.description, quantity: i.quantity })),
    diagnosis: (data.order as any).diagnosis,
    icd10: (data.order as any).icd10,
    lengthOfNeedMonths: (data.ext as any)?.lengthOfNeedMonths ?? null,
    careSetting: (data.ext as any)?.careSetting ?? null,
    clinicalIndication: (data.ext as any)?.clinicalIndication ?? null,
    hospitalName: data.hospitalName,
    payorName: data.payorName,
    payorMemberId: (data.order as any).payorMemberId,
  });

  const pdf = await renderHtmlToPdf(c.env.BROWSER, html, { format: 'Letter' });
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `inline; filename="DWO-${(data.order as any).identifier ?? orderId}.pdf"`);
  return c.body(pdf as any);
});

// ─── GET /:orderId/claim-bundle.pdf ────────────────────────────────────────
// Merges (in order): DWO PDF + every RECEIVED dme_order_documents file +
// PA approval letter (if any prior_auths row in APPROVED) + delivery POD
// (any orderShipment with proof_of_delivery_blob_key).
app.get('/:orderId/claim-bundle.pdf', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }

  const pdfs: Uint8Array[] = [];

  // 1. DWO
  const data = await loadDwoData(c.env.DB, orderId);
  const dwoHtml = renderDwoHtml({
    orderIdentifier: (data.order as any).identifier ?? orderId,
    orderDate: (data.order as any).createdAt,
    patientName: data.patientName,
    patientDob: (data.order as any).patientBirthDate,
    patientAddress: (data.order as any).patientAddress,
    patientPhone: (data.order as any).patientPhone,
    prescriberName: (data.order as any).authProvider ?? (data.order as any).refProvider,
    prescriberNpi: null,
    prescriberPhone: null,
    prescriberSignedDate: (data.order as any).signDateTime,
    prescriberSignatureLine: null,
    items: data.items.map((i: any) => ({ code: i.code, description: i.description, quantity: i.quantity })),
    diagnosis: (data.order as any).diagnosis,
    icd10: (data.order as any).icd10,
    lengthOfNeedMonths: (data.ext as any)?.lengthOfNeedMonths ?? null,
    careSetting: (data.ext as any)?.careSetting ?? null,
    clinicalIndication: (data.ext as any)?.clinicalIndication ?? null,
    hospitalName: data.hospitalName,
    payorName: data.payorName,
    payorMemberId: (data.order as any).payorMemberId,
  });
  pdfs.push(await renderHtmlToPdf(c.env.BROWSER, dwoHtml, { format: 'Letter' }));

  // 2. Every RECEIVED dme_order_documents — PDFs go in directly; PNG/JPG
  //    wound photos are converted via imageToPdf so they appear in the bundle.
  const docs = await db
    .select()
    .from(dmeOrderDocuments)
    .where(and(eq(dmeOrderDocuments.orderId, orderId), eq(dmeOrderDocuments.status, 'RECEIVED')));
  for (const d of docs) {
    if (!d.blobKey) continue;
    const obj = await c.env.R2.get(d.blobKey);
    if (!obj) continue;
    const buf = new Uint8Array(await obj.arrayBuffer());
    const asPdf = await bytesToPdf(buf, d.mimeType, d.fileName);
    if (asPdf) pdfs.push(asPdf);
  }

  // 3. PA approval letters — pull from prior_auths.documentBlobKeys (JSON array)
  const pas = await db
    .select()
    .from(priorAuths)
    .where(and(eq(priorAuths.orderId, orderId), eq(priorAuths.status, 'APPROVED')));
  for (const pa of pas) {
    const raw = (pa as any).documentBlobKeys;
    if (!raw) continue;
    let keys: string[] = [];
    try {
      keys = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch { keys = []; }
    for (const key of keys) {
      if (!key) continue;
      const obj = await c.env.R2.get(key);
      if (!obj) continue;
      const buf = new Uint8Array(await obj.arrayBuffer());
      const mime = (obj as any).httpMetadata?.contentType ?? null;
      const asPdf = await bytesToPdf(buf, mime, key);
      if (asPdf) pdfs.push(asPdf);
    }
  }

  // 4. Delivery POD — orderShipments.podAttachment (URL or R2 blob key).
  //    Driver photo PODs are typically JPG — convert before merging.
  const ships = await db.select().from(orderShipments).where(eq(orderShipments.orderId, orderId));
  for (const s of ships) {
    const pod = (s as any).podAttachment;
    if (!pod) continue;
    // If the value looks like an http URL, skip (POD stored externally — can't merge);
    // otherwise treat as an R2 blob key.
    if (/^https?:\/\//i.test(pod)) continue;
    const obj = await c.env.R2.get(pod);
    if (!obj) continue;
    const buf = new Uint8Array(await obj.arrayBuffer());
    const mime = (obj as any).httpMetadata?.contentType ?? null;
    const asPdf = await bytesToPdf(buf, mime, pod);
    if (asPdf) pdfs.push(asPdf);
  }

  if (pdfs.length === 0) {
    return c.json({ error: 'No PDFs available to bundle' }, 404);
  }

  const merged = await mergePdfs(pdfs);
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `inline; filename="ClaimBundle-${(ord as any).identifier ?? orderId}.pdf"`);
  return c.body(merged as any);
});

export default app;

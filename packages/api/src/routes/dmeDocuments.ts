/**
 * /api/dme-documents — Order-level document packet management.
 *
 * Endpoints:
 *   POST   /materialize/:orderId      — create missing dme_order_documents rows from req catalog
 *   GET    /order/:orderId            — list all docs for an order with status
 *   POST   /:docId/upload             — record an uploaded file (blobKey already in R2)
 *   POST   /:docId/mark-received      — without upload (e.g. provider attests)
 *   POST   /:docId/mark-rejected      — flag a doc as invalid
 *   DELETE /:docId                    — remove an ad-hoc doc
 *   POST   /order/:orderId/ad-hoc     — add a non-catalog doc
 *
 * Plus admin catalog management:
 *   GET    /requirements              — list document_requirements
 *   POST   /requirements              — admin only
 *   PUT    /requirements/:id          — admin only
 *   DELETE /requirements/:id          — admin only
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  dmeDocumentRequirements,
  dmeOrderDocuments,
  dmeOrderExtensions,
  DME_DOCUMENT_TYPES,
  DME_DOC_STATUSES,
  orders,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import {
  materializeOrderDocuments,
  getDocPacketStatus,
} from '../services/dmeDocumentService';
import { initializeRentalPeriods } from '../cron/dmeRentalBilling';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

// ─── POST /materialize/:orderId ────────────────────────────────────────────
app.post('/materialize/:orderId', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }
  const result = await materializeOrderDocuments(c.env.DB, orderId);
  return c.json(result);
});

// ─── GET /order/:orderId ───────────────────────────────────────────────────
app.get('/order/:orderId', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }
  const status = await getDocPacketStatus(c.env.DB, orderId);
  return c.json(status);
});

// ─── POST /:docId/upload ───────────────────────────────────────────────────
// Caller already uploaded the file to R2 (via /api/uploads) and passes the blobKey.
app.post('/:docId/upload', async (c) => {
  const { docId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    blobKey: string;
    fileName?: string;
    mimeType?: string;
    signedAt?: string;
    signedByName?: string;
    notes?: string;
  };
  if (!body.blobKey) throw new ValidationError('blobKey required');
  const [doc] = await db.select().from(dmeOrderDocuments).where(eq(dmeOrderDocuments.id, docId)).limit(1);
  if (!doc) throw new NotFoundError('Document not found');

  // Tenant guard via order
  const [ord] = await db.select().from(orders).where(eq(orders.id, doc.orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }

  // Compute expiresAt from requirement's expiresDays if provided
  let expiresAt: string | null = null;
  if (doc.requirementId) {
    const [req] = await db
      .select()
      .from(dmeDocumentRequirements)
      .where(eq(dmeDocumentRequirements.id, doc.requirementId))
      .limit(1);
    if (req?.expiresDays && body.signedAt) {
      const d = new Date(body.signedAt);
      d.setDate(d.getDate() + req.expiresDays);
      expiresAt = d.toISOString();
    }
  }

  const now = new Date().toISOString();
  await db
    .update(dmeOrderDocuments)
    .set({
      status: 'RECEIVED',
      blobKey: body.blobKey,
      fileName: body.fileName ?? null,
      mimeType: body.mimeType ?? null,
      signedAt: body.signedAt ?? null,
      signedByName: body.signedByName ?? null,
      expiresAt,
      notes: body.notes ?? doc.notes,
      uploadedByUserId: user.id,
      uploadedAt: now,
      updatedAt: now,
    })
    .where(eq(dmeOrderDocuments.id, docId));
  return c.json({ id: docId, status: 'RECEIVED', expiresAt });
});

// ─── POST /:docId/mark-received ────────────────────────────────────────────
app.post('/:docId/mark-received', async (c) => {
  const { docId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as { notes?: string };
  const [doc] = await db.select().from(dmeOrderDocuments).where(eq(dmeOrderDocuments.id, docId)).limit(1);
  if (!doc) throw new NotFoundError('Document not found');
  await db
    .update(dmeOrderDocuments)
    .set({
      status: 'RECEIVED',
      notes: body.notes ?? doc.notes,
      uploadedByUserId: user.id,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(dmeOrderDocuments.id, docId));
  return c.json({ id: docId, status: 'RECEIVED' });
});

// ─── POST /:docId/mark-rejected ────────────────────────────────────────────
app.post('/:docId/mark-rejected', async (c) => {
  const { docId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as { reason?: string };
  if (!body.reason?.trim()) throw new ValidationError('reason required');
  await db
    .update(dmeOrderDocuments)
    .set({
      status: 'REJECTED',
      notes: body.reason.trim(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(dmeOrderDocuments.id, docId));
  return c.json({ id: docId, status: 'REJECTED' });
});

// ─── POST /order/:orderId/ad-hoc ───────────────────────────────────────────
app.post('/order/:orderId/ad-hoc', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as { documentType?: string; notes?: string };
  if (!body.documentType || !(DME_DOCUMENT_TYPES as readonly string[]).includes(body.documentType)) {
    throw new ValidationError(`documentType must be one of ${DME_DOCUMENT_TYPES.join(', ')}`);
  }
  const id = crypto.randomUUID();
  await db.insert(dmeOrderDocuments).values({
    id,
    orderId,
    requirementId: null,
    documentType: body.documentType,
    status: 'MISSING',
    notes: body.notes ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

// ─── DELETE /:docId ────────────────────────────────────────────────────────
app.delete('/:docId', async (c) => {
  const { docId } = c.req.param();
  const db = getDb(c.env.DB);
  const [doc] = await db.select().from(dmeOrderDocuments).where(eq(dmeOrderDocuments.id, docId)).limit(1);
  if (!doc) throw new NotFoundError('Document not found');
  // Only allow deletion of ad-hoc docs (no requirement linked); catalog-bound rows shouldn't be deleted
  if (doc.requirementId) {
    throw new ConflictError('Cannot delete a required document — mark NOT_APPLICABLE instead');
  }
  await db.delete(dmeOrderDocuments).where(eq(dmeOrderDocuments.id, docId));
  return c.json({ id: docId, deleted: true });
});

// ─── Admin catalog endpoints ───────────────────────────────────────────────
app.get('/requirements', async (c) => {
  const db = getDb(c.env.DB);
  const { hcpcCode } = c.req.query();
  const rows = hcpcCode
    ? await db.select().from(dmeDocumentRequirements).where(eq(dmeDocumentRequirements.hcpcCode, hcpcCode))
    : await db.select().from(dmeDocumentRequirements).limit(500);
  return c.json({ items: rows });
});

app.post('/requirements', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as any;
  if (!body.hcpcCode || !body.documentType) {
    throw new ValidationError('hcpcCode and documentType required');
  }
  if (!(DME_DOCUMENT_TYPES as readonly string[]).includes(body.documentType)) {
    throw new ValidationError(`documentType must be one of ${DME_DOCUMENT_TYPES.join(', ')}`);
  }
  const id = crypto.randomUUID();
  try {
    await db.insert(dmeDocumentRequirements).values({
      id,
      hcpcCode: body.hcpcCode,
      documentType: body.documentType,
      isRequired: body.isRequired === false ? 0 : 1,
      payorKindFilter: body.payorKindFilter ?? null,
      expiresDays: body.expiresDays ?? null,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      throw new ConflictError('Requirement already exists for this HCPC/type/payor');
    }
    throw err;
  }
  return c.json({ id }, 201);
});

app.put('/requirements/:id', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ['expiresDays', 'notes', 'payorKindFilter']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.isRequired !== undefined) patch.isRequired = body.isRequired ? 1 : 0;
  await db.update(dmeDocumentRequirements).set(patch).where(eq(dmeDocumentRequirements.id, id));
  return c.json({ id, updated: true });
});

app.delete('/requirements/:id', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  await db.delete(dmeDocumentRequirements).where(eq(dmeDocumentRequirements.id, id));
  return c.json({ id, deleted: true });
});

// ─── POST /extension/:orderId ─────────────────────────────────────────────
// Upsert the DME sidecar for an order. Used by the wizard finalize step.
app.post('/extension/:orderId', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }
  const body = (await c.req.json()) as any;
  const now = new Date().toISOString();
  // Try insert then update on conflict
  try {
    await db.insert(dmeOrderExtensions).values({
      orderId,
      lengthOfNeedMonths: body.lengthOfNeedMonths ?? null,
      careSetting: body.careSetting ?? null,
      patientHeightIn: body.patientHeightIn ?? null,
      patientWeightLb: body.patientWeightLb ?? null,
      mobilityStatus: body.mobilityStatus ?? null,
      rentalType: body.rentalType ?? null,
      estimatedStartDate: body.estimatedStartDate ?? null,
      faceToFaceDate: body.faceToFaceDate ?? null,
      cmsPaRequired: body.cmsPaRequired ? 1 : 0,
      clinicalIndication: body.clinicalIndication ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const k of [
      'lengthOfNeedMonths',
      'careSetting',
      'patientHeightIn',
      'patientWeightLb',
      'mobilityStatus',
      'rentalType',
      'estimatedStartDate',
      'faceToFaceDate',
      'clinicalIndication',
    ]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (body.cmsPaRequired !== undefined) patch.cmsPaRequired = body.cmsPaRequired ? 1 : 0;
    await db.update(dmeOrderExtensions).set(patch).where(eq(dmeOrderExtensions.orderId, orderId));
  }

  // Auto-spawn rental periods when rentalType is a rental.
  // monthlyRateUsd defaults to 0 — admin will set later via /api/dme-rental-periods.
  // Idempotent: existing SCHEDULED periods are wiped + recreated.
  let rentalSpawn = { created: 0 };
  if (body.rentalType && body.rentalType !== 'PURCHASE' && body.rentalType !== 'NOT_APPLICABLE') {
    try {
      rentalSpawn = await initializeRentalPeriods(c.env, orderId, body.monthlyRateUsd ?? 0);
    } catch (err) {
      console.error('[dme-extension] rental init failed', err);
    }
  }
  return c.json({ orderId, ok: true, rentalPeriodsCreated: rentalSpawn.created });
});

// ─── GET /extension/:orderId ───────────────────────────────────────────────
app.get('/extension/:orderId', async (c) => {
  const { orderId } = c.req.param();
  const db = getDb(c.env.DB);
  const [row] = await db
    .select()
    .from(dmeOrderExtensions)
    .where(eq(dmeOrderExtensions.orderId, orderId))
    .limit(1);
  return c.json(row ?? null);
});

// ─── POST /extension/:orderId/dwo-sign ─────────────────────────────────────
// Persist a physician's DWO e-signature. Body: { dataUrl, signedByName, signedByNpi }.
// Stores the PNG in R2 and stamps the extension with signed_at + blob key.
app.post('/extension/:orderId/dwo-sign', async (c) => {
  const { orderId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as { dataUrl?: string; signedByName?: string; signedByNpi?: string };
  if (!body.dataUrl?.startsWith('data:image/png;base64,')) {
    throw new ValidationError('dataUrl must be data:image/png;base64,…');
  }
  if (!body.signedByName?.trim()) throw new ValidationError('signedByName required');

  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized');
  }

  // Decode + store
  const b64 = body.dataUrl.replace(/^data:image\/png;base64,/, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blobKey = `dwo-signatures/${orderId}/${Date.now()}.png`;
  await c.env.R2.put(blobKey, bytes, { httpMetadata: { contentType: 'image/png' } });

  const now = new Date().toISOString();
  // Upsert extension row
  try {
    await db.insert(dmeOrderExtensions).values({
      orderId,
      dwoSignatureBlobKey: blobKey,
      dwoSignedAt: now,
      dwoSignedByName: body.signedByName.trim(),
      dwoSignedByNpi: body.signedByNpi?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    await db
      .update(dmeOrderExtensions)
      .set({
        dwoSignatureBlobKey: blobKey,
        dwoSignedAt: now,
        dwoSignedByName: body.signedByName.trim(),
        dwoSignedByNpi: body.signedByNpi?.trim() ?? null,
        updatedAt: now,
      })
      .where(eq(dmeOrderExtensions.orderId, orderId));
  }
  return c.json({ orderId, signedAt: now, blobKey });
});

export default app;

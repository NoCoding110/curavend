/**
 * /api/dmepos-compliance — DMEPOS supplier accreditation + bonding + cert tracking.
 *
 *   GET  /                          — list vendors + their compliance summary
 *   GET  /vendor/:vendorId          — get vendor compliance + cert docs
 *   PUT  /vendor/:vendorId          — upsert compliance summary (NSC, PTAN, NPI, accred body, expiries)
 *   GET  /vendor/:vendorId/docs     — list cert docs for a vendor
 *   POST /vendor/:vendorId/docs     — add a cert doc
 *   PUT  /docs/:docId               — update a cert doc
 *   DELETE /docs/:docId             — remove a cert doc
 *   GET  /expiring                  — list compliance docs expiring within N days (?days=30)
 */
import { Hono } from 'hono';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendors,
  vendorDmeposCompliance,
  vendorComplianceDocs,
  DMEPOS_CERT_TYPES,
} from '@curavend/db';
import { ValidationError, NotFoundError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const all = await db.select().from(vendors).limit(500);
  const compliance = await db.select().from(vendorDmeposCompliance);
  const map = new Map(compliance.map((c) => [c.vendorId, c]));
  const items = all.map((v) => ({
    id: v.id,
    name: v.name,
    compliance: map.get(v.id) ?? null,
  }));
  return c.json({ items });
});

// ─── GET /vendor/:vendorId ────────────────────────────────────────────────
app.get('/vendor/:vendorId', async (c) => {
  const db = getDb(c.env.DB);
  const { vendorId } = c.req.param();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!v) throw new NotFoundError('Vendor not found');
  const [comp] = await db
    .select()
    .from(vendorDmeposCompliance)
    .where(eq(vendorDmeposCompliance.vendorId, vendorId))
    .limit(1);
  const docs = await db
    .select()
    .from(vendorComplianceDocs)
    .where(and(eq(vendorComplianceDocs.vendorId, vendorId), eq(vendorComplianceDocs.isActive, 1)))
    .orderBy(asc(vendorComplianceDocs.expirationDate));
  return c.json({ vendor: { id: v.id, name: v.name }, compliance: comp ?? null, docs });
});

// ─── PUT /vendor/:vendorId ────────────────────────────────────────────────
app.put('/vendor/:vendorId', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { vendorId } = c.req.param();
  const body = (await c.req.json()) as any;
  const now = new Date().toISOString();
  try {
    await db.insert(vendorDmeposCompliance).values({
      vendorId,
      nscNumber: body.nscNumber ?? null,
      ptan: body.ptan ?? null,
      npi: body.npi ?? null,
      accredited: body.accredited ? 1 : 0,
      accreditationBody: body.accreditationBody ?? null,
      accreditationExpiresAt: body.accreditationExpiresAt ?? null,
      suretyBondExpiresAt: body.suretyBondExpiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const k of [
      'nscNumber',
      'ptan',
      'npi',
      'accreditationBody',
      'accreditationExpiresAt',
      'suretyBondExpiresAt',
    ]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (body.accredited !== undefined) patch.accredited = body.accredited ? 1 : 0;
    await db.update(vendorDmeposCompliance).set(patch).where(eq(vendorDmeposCompliance.vendorId, vendorId));
  }
  return c.json({ vendorId, ok: true });
});

// ─── POST /vendor/:vendorId/docs ─────────────────────────────────────────
app.post('/vendor/:vendorId/docs', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { vendorId } = c.req.param();
  const body = (await c.req.json()) as any;
  if (!body.certType || !(DMEPOS_CERT_TYPES as readonly string[]).includes(body.certType)) {
    throw new ValidationError(`certType required, one of ${DMEPOS_CERT_TYPES.join(', ')}`);
  }
  const id = crypto.randomUUID();
  await db.insert(vendorComplianceDocs).values({
    id,
    vendorId,
    certType: body.certType,
    certNumber: body.certNumber ?? null,
    issuingAuthority: body.issuingAuthority ?? null,
    issueDate: body.issueDate ?? null,
    expirationDate: body.expirationDate ?? null,
    blobKey: body.blobKey ?? null,
    fileName: body.fileName ?? null,
    notes: body.notes ?? null,
    isActive: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

// ─── PUT /docs/:docId ─────────────────────────────────────────────────────
app.put('/docs/:docId', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { docId } = c.req.param();
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of [
    'certNumber',
    'issuingAuthority',
    'issueDate',
    'expirationDate',
    'blobKey',
    'fileName',
    'notes',
  ]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
  await db.update(vendorComplianceDocs).set(patch).where(eq(vendorComplianceDocs.id, docId));
  return c.json({ id: docId, updated: true });
});

// ─── DELETE /docs/:docId ──────────────────────────────────────────────────
app.delete('/docs/:docId', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { docId } = c.req.param();
  await db
    .update(vendorComplianceDocs)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(vendorComplianceDocs.id, docId));
  return c.json({ id: docId, deactivated: true });
});

// ─── GET /expiring ────────────────────────────────────────────────────────
app.get('/expiring', async (c) => {
  const db = getDb(c.env.DB);
  const days = Number(c.req.query('days') ?? '30');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const docs = await db
    .select()
    .from(vendorComplianceDocs)
    .where(
      and(
        eq(vendorComplianceDocs.isActive, 1),
        lte(vendorComplianceDocs.expirationDate, cutoffStr),
      ),
    )
    .orderBy(asc(vendorComplianceDocs.expirationDate));
  return c.json({ days, items: docs });
});

export default app;

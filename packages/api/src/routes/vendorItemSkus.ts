/**
 * /api/vendor-item-skus — Phase C HCPC ↔ vendor SKU catalog.
 *
 * Permissions:
 *   - VENDOR / SUPER_VENDOR / ADMIN: full CRUD on own vendor's catalog.
 *     SUPER_VENDOR sees all child vendors. ADMIN unscoped.
 *   - HOSPITAL: READ only, scoped to vendors they have a hospital_vendors
 *     link with. Other vendors → 403.
 */

import { Hono } from 'hono';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorItemSkus,
  vendors,
  hospitalVendors,
} from '@curavend/db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Helper: scope checking on writes (vendor must match)
function assertVendorWriteScope(user: any, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
    // super-vendor authority confirmed downstream when looking up the vendor row
    return;
  }
  throw new ForbiddenError('Access denied');
}

/**
 * GET /vendor-item-skus
 *   Vendor users  → auto-scoped to own vendorId.
 *   Hospital users → must pass ?vendorId=X and have a hospital_vendors link.
 *   Admins        → unscoped; optional ?vendorId=X.
 *   Optional ?hcpcCode= filter; returns only is_active=1 unless ?activeOnly=0.
 */
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const queryVendorId = c.req.query('vendorId');
  const hcpcCode = c.req.query('hcpcCode');
  const activeOnlyParam = c.req.query('activeOnly');
  const activeOnly = activeOnlyParam !== '0' && activeOnlyParam !== 'false';

  const conditions: any[] = [];

  if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(vendorItemSkus.vendorId, user.vendorId));
  } else if (user.userType === 'HOSPITAL') {
    if (!user.hospitalId) throw new ForbiddenError('Access denied');
    if (!queryVendorId) {
      // Hospital users get the union across all linked vendors when no
      // vendorId is supplied — useful for "show all SKUs available to me".
      const linked = await db
        .select({ vendorId: hospitalVendors.vendorId })
        .from(hospitalVendors)
        .where(eq(hospitalVendors.hospitalId, user.hospitalId));
      const linkedIds = Array.from(new Set(linked.map((r) => r.vendorId)));
      if (linkedIds.length === 0) return c.json({ items: [] });
      conditions.push(inArray(vendorItemSkus.vendorId, linkedIds));
    } else {
      // Confirm the linkage
      const link = await db
        .select({ id: hospitalVendors.id })
        .from(hospitalVendors)
        .where(
          and(
            eq(hospitalVendors.hospitalId, user.hospitalId),
            eq(hospitalVendors.vendorId, queryVendorId),
          ),
        )
        .limit(1);
      if (!link.length) {
        throw new ForbiddenError('Vendor is not linked to your hospital');
      }
      conditions.push(eq(vendorItemSkus.vendorId, queryVendorId));
    }
    // Hospitals never see inactive SKUs
    conditions.push(eq(vendorItemSkus.isActive, 1));
  } else if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
    // Restrict to child vendors of this super-vendor
    const childIds = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.superVendorId, user.superVendorId));
    const ids = childIds.map((r) => r.id);
    if (ids.length === 0) return c.json({ items: [] });
    if (queryVendorId && !ids.includes(queryVendorId)) {
      throw new ForbiddenError('Vendor not under your super-vendor scope');
    }
    conditions.push(
      inArray(vendorItemSkus.vendorId, queryVendorId ? [queryVendorId] : ids),
    );
  } else {
    // ADMIN
    if (queryVendorId) conditions.push(eq(vendorItemSkus.vendorId, queryVendorId));
    if (activeOnly) conditions.push(eq(vendorItemSkus.isActive, 1));
  }

  if (hcpcCode) {
    conditions.push(eq(vendorItemSkus.hcpcCode, hcpcCode));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(vendorItemSkus)
    .where(whereClause)
    .orderBy(vendorItemSkus.hcpcCode);

  return c.json({ items: rows });
});

// GET /vendor-item-skus/:id
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows = await db
    .select()
    .from(vendorItemSkus)
    .where(eq(vendorItemSkus.id, id))
    .limit(1);
  if (!rows.length) throw new NotFoundError('SKU not found');
  const sku = rows[0];

  if (user.userType === 'VENDOR' && sku.vendorId !== user.vendorId) {
    throw new ForbiddenError('Access denied');
  }
  if (user.userType === 'HOSPITAL') {
    if (!user.hospitalId) throw new ForbiddenError('Access denied');
    const link = await db
      .select({ id: hospitalVendors.id })
      .from(hospitalVendors)
      .where(
        and(
          eq(hospitalVendors.hospitalId, user.hospitalId),
          eq(hospitalVendors.vendorId, sku.vendorId),
        ),
      )
      .limit(1);
    if (!link.length) throw new ForbiddenError('Access denied');
  }

  return c.json(sku);
});

// POST /vendor-item-skus
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  const vendorId: string =
    user.userType === 'VENDOR' && user.vendorId ? user.vendorId : body.vendorId;
  if (!vendorId) throw new ValidationError('vendorId is required');
  assertVendorWriteScope(user, vendorId);

  if (!body.hcpcCode || !String(body.hcpcCode).trim()) {
    throw new ValidationError('hcpcCode is required');
  }
  if (!body.vendorSku || !String(body.vendorSku).trim()) {
    throw new ValidationError('vendorSku is required');
  }

  const unitsPerPack = Math.max(1, Number(body.unitsPerPack ?? 1));
  const packsPerCase = Math.max(1, Number(body.packsPerCase ?? 1));

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // If super-vendor, verify the vendor is a child
  if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
    const v = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, vendorId),
          eq(vendors.superVendorId, user.superVendorId),
        ),
      )
      .limit(1);
    if (!v.length) throw new ForbiddenError('Vendor not under your scope');
  }

  try {
    await db.insert(vendorItemSkus).values({
      id,
      vendorId,
      hcpcCode: String(body.hcpcCode).trim().toUpperCase(),
      vendorSku: String(body.vendorSku).trim(),
      description: body.description ?? null,
      manufacturerName: body.manufacturerName ?? null,
      manufacturerItemNumber: body.manufacturerItemNumber ?? null,
      unitsPerPack,
      packsPerCase,
      unitOfMeasurement: body.unitOfMeasurement ?? null,
      listPriceCents:
        body.listPriceCents != null
          ? Math.max(0, Math.round(Number(body.listPriceCents)))
          : null,
      isActive: body.isActive === false ? 0 : 1,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) {
      throw new ValidationError(
        `SKU "${body.vendorSku}" already exists for this vendor`,
      );
    }
    throw err;
  }

  const created = await db
    .select()
    .from(vendorItemSkus)
    .where(eq(vendorItemSkus.id, id))
    .limit(1);
  return c.json(created[0], 201);
});

// PUT /vendor-item-skus/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(vendorItemSkus)
    .where(eq(vendorItemSkus.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('SKU not found');
  assertVendorWriteScope(user, existing[0].vendorId);

  const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.hcpcCode !== undefined)
    patch.hcpcCode = String(body.hcpcCode).trim().toUpperCase();
  if (body.vendorSku !== undefined) patch.vendorSku = String(body.vendorSku).trim();
  if (body.description !== undefined) patch.description = body.description;
  if (body.manufacturerName !== undefined)
    patch.manufacturerName = body.manufacturerName;
  if (body.manufacturerItemNumber !== undefined)
    patch.manufacturerItemNumber = body.manufacturerItemNumber;
  if (body.unitsPerPack !== undefined)
    patch.unitsPerPack = Math.max(1, Number(body.unitsPerPack));
  if (body.packsPerCase !== undefined)
    patch.packsPerCase = Math.max(1, Number(body.packsPerCase));
  if (body.unitOfMeasurement !== undefined)
    patch.unitOfMeasurement = body.unitOfMeasurement;
  if (body.listPriceCents !== undefined)
    patch.listPriceCents =
      body.listPriceCents == null
        ? null
        : Math.max(0, Math.round(Number(body.listPriceCents)));
  if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
  if (body.notes !== undefined) patch.notes = body.notes;

  await db.update(vendorItemSkus).set(patch).where(eq(vendorItemSkus.id, id));
  const updated = await db
    .select()
    .from(vendorItemSkus)
    .where(eq(vendorItemSkus.id, id))
    .limit(1);
  return c.json(updated[0]);
});

// DELETE /vendor-item-skus/:id — soft-delete via is_active=0 (default) or hard-delete via ?hard=1
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const hard = c.req.query('hard') === '1';

  const existing = await db
    .select()
    .from(vendorItemSkus)
    .where(eq(vendorItemSkus.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('SKU not found');
  assertVendorWriteScope(user, existing[0].vendorId);

  if (hard) {
    await db.delete(vendorItemSkus).where(eq(vendorItemSkus.id, id));
  } else {
    await db
      .update(vendorItemSkus)
      .set({ isActive: 0, updatedAt: new Date().toISOString() })
      .where(eq(vendorItemSkus.id, id));
  }
  return c.json({ ok: true, hard });
});

export default app;

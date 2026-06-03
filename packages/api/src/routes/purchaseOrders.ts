/**
 * Purchase Orders — CRUD + transmission + CSV export.
 *
 * TENANT SCOPING (post procurement gap closure):
 *   - Admin (ACCOUNT_MANAGER / _USER): unrestricted.
 *   - Hospital persona: limited to POs where hospitalId matches.
 *   - Vendor persona: limited to POs where vendorId matches.
 *   - Super-vendor persona: limited to POs where superVendorId matches.
 *   - Any other persona: 403.
 *
 * Every per-PO endpoint (`/:id`, `/transmit`, `/ack`, `/transmission-log`,
 * PUT, DELETE, CSV) calls `assertPoTenant()` to verify the caller owns the
 * row before mutating or returning it.
 */
import { Hono } from 'hono';
import { eq, desc, and, or, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { purchaseOrders, purchaseOrderItems, poTransmissionLog, vendors } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { transmitPo, ackPo } from '../services/poTransmissionService';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

/** Resolve sub-vendor IDs for a super-vendor user. */
async function resolveSVSubVendorIds(db: any, u: AuthUser): Promise<string[]> {
  if (!u.superVendorId) return [];
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.superVendorId, u.superVendorId));
  return rows.map((r: any) => r.id);
}

/**
 * Returns the tenant-scope conditions for list queries, or null for admin.
 * Throws when the persona has no valid scope (hospital/vendor/super-vendor).
 * @param svSubIds  Pre-resolved sub-vendor IDs for SUPER_VENDOR users.
 */
function tenantListConds(u: AuthUser, svSubIds?: string[]): any[] | null {
  if (isAdmin(u)) return null;
  const conds: any[] = [];
  if (u.vendorId) conds.push(eq(purchaseOrders.vendorId, u.vendorId));
  if (u.superVendorId) {
    // Fan-out: any PO whose vendorId belongs to one of our sub-vendors
    if (svSubIds && svSubIds.length > 0) {
      conds.push(inArray(purchaseOrders.vendorId, svSubIds));
    }
    // Also match POs explicitly stamped with this super_vendor_id
    conds.push(eq(purchaseOrders.superVendorId, u.superVendorId));
  }
  if (u.hospitalId) conds.push(eq(purchaseOrders.hospitalId, u.hospitalId));
  if (conds.length === 0) {
    throw new ForbiddenError('Purchase orders are restricted to hospital / vendor personas');
  }
  // OR the conditions — a super-vendor user may match via vendorId OR superVendorId.
  return [conds.length === 1 ? conds[0] : or(...conds)!];
}

/**
 * Asserts the caller owns a specific PO. Returns the PO row for reuse.
 */
async function assertPoTenant(d1: D1Database, u: AuthUser, poId: string) {
  const db = getDb(d1);
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) throw new NotFoundError('Purchase order not found');
  if (isAdmin(u)) return po;
  if (u.vendorId && po.vendorId === u.vendorId) return po;
  if (u.superVendorId && po.superVendorId === u.superVendorId) return po;
  if (u.hospitalId && po.hospitalId === u.hospitalId) return po;
  throw new ForbiddenError('Purchase order belongs to a different tenant');
}

app.get('/', requirePermission('purchase-orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { limit = '50', offset = '0' } = c.req.query();
  const svSubIds = await resolveSVSubVendorIds(db, user);
  const conds = tenantListConds(user, svSubIds);

  let query: any = db.select().from(purchaseOrders);
  if (conds) query = query.where(and(...conds));
  const items = await query
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items, total: items.length });
});

app.get('/:id', requirePermission('purchase-orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const po = await assertPoTenant(c.env.DB, user, id);
  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, id));
  return c.json({ ...po, items });
});

// ─── POST /:id/transmit ───────────────────────────────────────────────────
// Sends the PO to its vendor by the configured (or overridden) method.
// Optional body: { method?: 'EDI'|'API'|'PUNCHOUT'|'EMAIL'|'PORTAL' }.
//
// Vendors cannot transmit POs (they only ACK incoming ones). Hospital users
// transmit POs for their own hospital. Admin can transmit any.
app.post('/:id/transmit', requirePermission('purchase-orders', 'WRITE'), async (c) => {
  const user = c.get('user');
  if (user.vendorId) {
    throw new ForbiddenError('Vendors cannot transmit their own incoming POs');
  }
  const { id } = c.req.param();
  await assertPoTenant(c.env.DB, user, id);
  const body = (await c.req.json().catch(() => ({}))) as { method?: string };
  const result = await transmitPo(c.env, id, { method: body.method, byUserId: user.id });
  return c.json({ id, ...result });
});

// ─── POST /:id/ack ────────────────────────────────────────────────────────
// Flips SENT → ACKED. Restricted to the vendor that received the PO (their
// 997 / webhook / portal action), plus admin.
app.post('/:id/ack', requirePermission('purchase-orders', 'WRITE'), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const po = await assertPoTenant(c.env.DB, user, id);
  // Extra check: only the receiving vendor or admin can ACK. Hospital users
  // see the state but shouldn't be flipping it.
  if (!isAdmin(user) && user.vendorId !== po.vendorId) {
    throw new ForbiddenError('Only the receiving vendor (or admin) can ACK a PO');
  }
  await ackPo(c.env.DB, id);
  return c.json({ id, transmissionState: 'ACKED' });
});

// ─── GET /:id/transmission-log ────────────────────────────────────────────
app.get('/:id/transmission-log', requirePermission('purchase-orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertPoTenant(c.env.DB, user, id);
  const rows = await db
    .select()
    .from(poTransmissionLog)
    .where(eq(poTransmissionLog.purchaseOrderId, id))
    .orderBy(desc(poTransmissionLog.startedAt))
    .limit(100);
  return c.json({ items: rows });
});

app.post('/', requirePermission('purchase-orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();
  if (!body.vendorId) throw new ValidationError('vendorId required');
  // Hospital persona implicitly creates POs for their own hospital. Admin
  // can pass body.hospitalId. Vendor persona shouldn't be creating POs at
  // all (they receive them).
  if (user.vendorId) throw new ForbiddenError('Vendors cannot create POs');
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? null) : user.hospitalId;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const number = `PO-${Date.now().toString(36).toUpperCase()}`;

  await db.insert(purchaseOrders).values({
    id,
    number,
    status: body.status ?? 'ORDER_COMPLETED',
    vendorId: body.vendorId,
    superVendorId: body.superVendorId ?? null,
    fileKey: body.fileKey ?? null,
    fileName: body.fileName ?? null,
    date: body.date ?? now,
    hospitalId,
    createdByUserId: user.id,
    transmissionState: 'NOT_SENT',
    transmissionAttempts: 0,
    createdAt: now,
    updatedAt: now,
  } as any);

  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      await db.insert(purchaseOrderItems).values({
        id: crypto.randomUUID(),
        purchaseOrderId: id,
        description: item.description ?? null,
        manufacturerNumber: item.manufacturerNumber ?? null,
        productDescription: item.productDescription ?? null,
        quantity: item.quantity ?? 1,
        createdAt: now,
      });
    }
  }

  return c.json({ id, number }, 201);
});

app.put('/:id', requirePermission('purchase-orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertPoTenant(c.env.DB, user, id);
  const body = await c.req.json();
  // Filter out fields that shouldn't be patched via this route — protect
  // the state machine on transmission columns.
  const blocked = new Set([
    'id', 'createdAt', 'transmissionState', 'transmittedAt', 'vendorAckAt',
    'transmissionAttempts', 'transmissionError', 'hospitalId', 'vendorId',
  ]);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (!blocked.has(k)) patch[k] = v;
  }
  await db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, id));
  return c.json({ success: true });
});

app.delete('/:id', requirePermission('purchase-orders', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertPoTenant(c.env.DB, user, id);
  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  return c.json({ success: true });
});

// Export CSV
app.get('/:id/export.csv', requirePermission('purchase-orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const po = await assertPoTenant(c.env.DB, user, id);
  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, id));

  const rows: string[] = ['PO Number,Description,Manufacturer #,Product Description,Quantity,Unit Price,Line Total'];
  for (const item of items) {
    rows.push(
      [
        po.number,
        csvEscape(item.description),
        csvEscape(item.manufacturerNumber),
        csvEscape(item.productDescription),
        item.quantity ?? 1,
        item.unitPriceUsd ?? '',
        item.lineTotalUsd ?? '',
      ].join(','),
    );
  }
  const csv = rows.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${po.number}.csv"`,
    },
  });
});

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default app;

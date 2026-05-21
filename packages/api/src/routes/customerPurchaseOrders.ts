/**
 * Customer Purchase Orders — buyer-side PO management.
 *
 * A hospital raises an internal PO with a fixed authorized spend.
 * Multiple Curavend orders can be billed against the same PO until
 * the authorized amount is exhausted or the PO expires.
 */
import { Hono } from 'hono';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { customerPurchaseOrders, orders } from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertHospitalScope(user: AuthUser, hospitalId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'HOSPITAL' && user.hospitalId === hospitalId) return;
  throw new ForbiddenError('You do not have access to this hospital\'s POs');
}

// GET /customer-purchase-orders — list (hospital-scoped)
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { status, limit = '100', offset = '0' } = c.req.query();

  const conditions: any[] = [];
  if (user.userType !== 'ADMIN') {
    if (user.userType !== 'HOSPITAL' || !user.hospitalId) {
      return c.json({ items: [], total: 0 });
    }
    conditions.push(eq(customerPurchaseOrders.hospitalId, user.hospitalId));
  }
  if (status) conditions.push(eq(customerPurchaseOrders.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(customerPurchaseOrders)
      .where(whereClause)
      .orderBy(desc(customerPurchaseOrders.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(customerPurchaseOrders)
      .where(whereClause),
  ]);
  return c.json({ items: results, total: countResult[0]?.count ?? 0 });
});

// GET /customer-purchase-orders/:id — single PO + linked orders
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const result = await db
    .select()
    .from(customerPurchaseOrders)
    .where(eq(customerPurchaseOrders.id, id))
    .limit(1);
  if (!result.length) throw new NotFoundError('Customer PO not found');
  assertHospitalScope(user, result[0].hospitalId);

  const linkedOrders = await db
    .select({
      id: orders.id,
      identifier: orders.identifier,
      status: orders.status,
      orderSubStatus: orders.orderSubStatus,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerPurchaseOrderId, id))
    .orderBy(desc(orders.createdAt));

  return c.json({ ...result[0], linkedOrders });
});

// POST /customer-purchase-orders — create
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  let hospitalId: string = body.hospitalId;
  if (user.userType !== 'ADMIN') {
    if (user.userType !== 'HOSPITAL' || !user.hospitalId) {
      throw new ForbiddenError('Only hospital users or admins can create customer POs');
    }
    hospitalId = user.hospitalId;
  }
  if (!hospitalId) throw new ValidationError('hospitalId is required');
  if (!body.poNumber) throw new ValidationError('poNumber is required');
  if (!body.poDate) throw new ValidationError('poDate is required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.insert(customerPurchaseOrders).values({
      id,
      hospitalId,
      poNumber: String(body.poNumber).trim(),
      poDate: body.poDate,
      authorizedAmount: body.authorizedAmount != null ? Number(body.authorizedAmount) : null,
      spentAmount: 0,
      expiresAt: body.expiresAt || null,
      notes: body.notes || null,
      status: 'OPEN',
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      throw new ValidationError('A PO with this number already exists for this hospital');
    }
    throw err;
  }

  const created = await db
    .select()
    .from(customerPurchaseOrders)
    .where(eq(customerPurchaseOrders.id, id))
    .limit(1);
  return c.json(created[0], 201);
});

// PUT /customer-purchase-orders/:id — update mutable fields
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(customerPurchaseOrders)
    .where(eq(customerPurchaseOrders.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('Customer PO not found');
  assertHospitalScope(user, existing[0].hospitalId);

  const update: any = { updatedAt: new Date().toISOString() };
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.authorizedAmount !== undefined) update.authorizedAmount = Number(body.authorizedAmount);
  if (body.expiresAt !== undefined) update.expiresAt = body.expiresAt;
  if (body.poDate !== undefined) update.poDate = body.poDate;

  await db.update(customerPurchaseOrders).set(update).where(eq(customerPurchaseOrders.id, id));
  const result = await db
    .select()
    .from(customerPurchaseOrders)
    .where(eq(customerPurchaseOrders.id, id))
    .limit(1);
  return c.json(result[0]);
});

// POST /customer-purchase-orders/:id/close — transition to EXHAUSTED or CANCELLED
app.post('/:id/close', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const status = body.status === 'CANCELLED' ? 'CANCELLED' : 'EXHAUSTED';

  const existing = await db
    .select()
    .from(customerPurchaseOrders)
    .where(eq(customerPurchaseOrders.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('Customer PO not found');
  assertHospitalScope(user, existing[0].hospitalId);

  await db
    .update(customerPurchaseOrders)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(customerPurchaseOrders.id, id));
  return c.json({ success: true, status });
});

// DELETE /customer-purchase-orders/:id — only if no linked orders + status is OPEN/CANCELLED
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await db
    .select()
    .from(customerPurchaseOrders)
    .where(eq(customerPurchaseOrders.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('Customer PO not found');
  assertHospitalScope(user, existing[0].hospitalId);

  const linked = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.customerPurchaseOrderId, id));
  if ((linked[0]?.count ?? 0) > 0) {
    throw new ValidationError('Cannot delete PO with linked orders; close it instead');
  }

  await db.delete(customerPurchaseOrders).where(eq(customerPurchaseOrders.id, id));
  return c.json({ success: true });
});

export default app;

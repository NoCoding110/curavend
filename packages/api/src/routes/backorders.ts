/**
 * /api/backorders — backorder lines auto-created when a goods receipt
 * underdelivers an order. Tracks expected fulfillment + partial fills.
 *
 *   GET    /                   — list open backorders (filterable)
 *   GET    /order/:orderId     — backorders for an order
 *   PUT    /:id                — update expected date / vendor ref / notes
 *   POST   /:id/fulfill        — record a fill: partial or full
 *   POST   /:id/cancel
 *
 * TENANT SCOPING (CRITICAL — backorders carry quantities & vendor refs):
 *   - Admin (ACCOUNT_MANAGER / _USER): unrestricted.
 *   - Hospital persona: filtered to orders where hospitalId matches JWT.
 *   - Vendor persona: filtered to orders where vendorId matches JWT.
 *   - All write endpoints (PUT, fulfill, cancel) verify the row's parent
 *     order belongs to the persona's tenant before mutating.
 */
import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orderBackorders, orders, formularyItems, formularySubstitutes } from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

/**
 * Resolves the tenant filter to apply to a backorder query.
 * Returns null for admins (no filter). Throws ForbiddenError for personas
 * with no hospital/vendor scope on their JWT.
 */
function tenantFilter(u: AuthUser): { hospitalId?: string; vendorId?: string } | null {
  if (isAdmin(u)) return null;
  if (u.hospitalId) return { hospitalId: u.hospitalId };
  if (u.vendorId) return { vendorId: u.vendorId };
  throw new ForbiddenError('Backorders are restricted to hospital and vendor personas');
}

/**
 * Asserts a backorder row's parent order belongs to the caller's tenant.
 * Used before mutating writes (update / fulfill / cancel).
 */
async function assertOwnsBackorder(
  db: ReturnType<typeof getDb>,
  user: AuthUser,
  backorderId: string,
) {
  const [row] = await db
    .select({
      id: orderBackorders.id,
      orderId: orderBackorders.orderId,
      hospitalId: orders.hospitalId,
      vendorId: orders.vendorId,
    })
    .from(orderBackorders)
    .innerJoin(orders, eq(orders.id, orderBackorders.orderId))
    .where(eq(orderBackorders.id, backorderId))
    .limit(1);
  if (!row) throw new NotFoundError('Backorder not found');
  if (isAdmin(user)) return row;
  if (user.hospitalId && row.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Backorder belongs to a different tenant');
  }
  if (user.vendorId && row.vendorId !== user.vendorId) {
    throw new ForbiddenError('Backorder belongs to a different tenant');
  }
  if (!user.hospitalId && !user.vendorId) {
    throw new ForbiddenError('Backorders are restricted to hospital and vendor personas');
  }
  return row;
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const filter = tenantFilter(user);
  const { status, orderId } = c.req.query();
  const conds: any[] = [];
  if (status) conds.push(eq(orderBackorders.status, status));
  if (orderId) conds.push(eq(orderBackorders.orderId, orderId));
  // Default: show only OPEN if no filter
  if (!status) conds.push(eq(orderBackorders.status, 'OPEN'));

  if (!filter) {
    // Admin path — no join needed.
    const rows = await db
      .select()
      .from(orderBackorders)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(orderBackorders.expectedFulfillmentDate))
      .limit(500);
    return c.json({ items: rows });
  }

  // Tenant-scoped path — JOIN orders to filter by hospital/vendor.
  if (filter.hospitalId) conds.push(eq(orders.hospitalId, filter.hospitalId));
  if (filter.vendorId) conds.push(eq(orders.vendorId, filter.vendorId));
  const rows = await db
    .select({
      id: orderBackorders.id,
      orderId: orderBackorders.orderId,
      originalOrderItemId: orderBackorders.originalOrderItemId,
      hcpcCode: orderBackorders.hcpcCode,
      itemCode: orderBackorders.itemCode,
      description: orderBackorders.description,
      quantityOrdered: orderBackorders.quantityOrdered,
      quantityReceived: orderBackorders.quantityReceived,
      quantityRemaining: orderBackorders.quantityRemaining,
      status: orderBackorders.status,
      expectedFulfillmentDate: orderBackorders.expectedFulfillmentDate,
      vendorReference: orderBackorders.vendorReference,
      notes: orderBackorders.notes,
      createdAt: orderBackorders.createdAt,
      updatedAt: orderBackorders.updatedAt,
    })
    .from(orderBackorders)
    .innerJoin(orders, eq(orders.id, orderBackorders.orderId))
    .where(and(...conds))
    .orderBy(asc(orderBackorders.expectedFulfillmentDate))
    .limit(500);
  return c.json({ items: rows });
});

app.get('/order/:orderId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId } = c.req.param();

  // Verify the order itself is in tenant before exposing its backorders.
  const [parent] = await db
    .select({ hospitalId: orders.hospitalId, vendorId: orders.vendorId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!parent) throw new NotFoundError('Order not found');
  if (!isAdmin(user)) {
    if (user.hospitalId && parent.hospitalId !== user.hospitalId) {
      throw new ForbiddenError('Order belongs to a different tenant');
    }
    if (user.vendorId && parent.vendorId !== user.vendorId) {
      throw new ForbiddenError('Order belongs to a different tenant');
    }
    if (!user.hospitalId && !user.vendorId) {
      throw new ForbiddenError('Backorders are restricted to hospital and vendor personas');
    }
  }

  const rows = await db
    .select()
    .from(orderBackorders)
    .where(eq(orderBackorders.orderId, orderId))
    .orderBy(asc(orderBackorders.createdAt));
  return c.json({ items: rows });
});

app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertOwnsBackorder(db, user, id);
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ['expectedFulfillmentDate', 'vendorReference', 'notes']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  await db.update(orderBackorders).set(patch).where(eq(orderBackorders.id, id));
  return c.json({ id, updated: true });
});

app.post('/:id/fulfill', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertOwnsBackorder(db, user, id);
  const body = (await c.req.json()) as { quantity: number; notes?: string };
  if (typeof body.quantity !== 'number' || body.quantity <= 0) {
    throw new ValidationError('quantity (positive integer) required');
  }
  const [row] = await db.select().from(orderBackorders).where(eq(orderBackorders.id, id)).limit(1);
  if (!row) throw new NotFoundError('Backorder not found');
  if (row.status === 'FULFILLED' || row.status === 'CANCELLED') {
    throw new ConflictError(`Backorder is ${row.status}`);
  }
  const newReceived = row.quantityReceived + body.quantity;
  if (newReceived > row.quantityOrdered) {
    throw new ConflictError(`Would exceed quantityOrdered (${row.quantityOrdered})`);
  }
  const newRemaining = row.quantityOrdered - newReceived;
  const newStatus = newRemaining === 0 ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
  await db
    .update(orderBackorders)
    .set({
      quantityReceived: newReceived,
      quantityRemaining: newRemaining,
      status: newStatus,
      notes: body.notes ?? row.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orderBackorders.id, id));
  return c.json({ id, status: newStatus, quantityRemaining: newRemaining });
});

// ─── GET /:id/suggested-substitutes ───────────────────────────────────────
// Look up formulary substitutes for a backordered HCPC, ranked by priority.
// Caller may use these as alternative line items on a replacement order.
app.get('/:id/suggested-substitutes', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertOwnsBackorder(db, user, id);
  const [bo] = await db.select().from(orderBackorders).where(eq(orderBackorders.id, id)).limit(1);
  if (!bo) throw new NotFoundError('Backorder not found');
  if (!bo.hcpcCode) return c.json({ items: [] });

  // Find the formulary item for the hospital + this HCPC, then its substitutes.
  const [parentOrder] = await db
    .select({ hospitalId: orders.hospitalId })
    .from(orders).where(eq(orders.id, bo.orderId)).limit(1);
  if (!parentOrder) return c.json({ items: [] });

  const items = await db
    .select()
    .from(formularyItems)
    .where(and(
      eq(formularyItems.hospitalId, parentOrder.hospitalId),
      eq(formularyItems.hcpcCode, bo.hcpcCode),
      eq(formularyItems.status, 'ACTIVE'),
    ));
  if (items.length === 0) return c.json({ items: [] });

  const subs = await db
    .select()
    .from(formularySubstitutes)
    .where(eq(formularySubstitutes.formularyItemId, items[0].id))
    .orderBy(formularySubstitutes.priority);
  return c.json({ items: subs });
});

// ─── GET /triage ──────────────────────────────────────────────────────────
// Aggregated triage view: open backorders + age buckets + earliest ETA.
app.get('/triage', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const filter = tenantFilter(user);
  const conds: any[] = [eq(orderBackorders.status, 'OPEN')];
  let rowsQuery: any = db
    .select({
      id: orderBackorders.id,
      orderId: orderBackorders.orderId,
      hcpcCode: orderBackorders.hcpcCode,
      itemCode: orderBackorders.itemCode,
      description: orderBackorders.description,
      quantityRemaining: orderBackorders.quantityRemaining,
      expectedFulfillmentDate: orderBackorders.expectedFulfillmentDate,
      vendorReference: orderBackorders.vendorReference,
      createdAt: orderBackorders.createdAt,
      orderVendorId: orders.vendorId,
      orderHospitalId: orders.hospitalId,
    })
    .from(orderBackorders)
    .innerJoin(orders, eq(orders.id, orderBackorders.orderId));
  if (filter?.hospitalId) conds.push(eq(orders.hospitalId, filter.hospitalId));
  if (filter?.vendorId) conds.push(eq(orders.vendorId, filter.vendorId));
  rowsQuery = rowsQuery.where(and(...conds)).orderBy(asc(orderBackorders.createdAt)).limit(500);
  const rows = await rowsQuery;

  // Bucket by age.
  const now = Date.now();
  const ageOf = (ts: string) => Math.floor((now - new Date(ts).getTime()) / (24 * 60 * 60 * 1000));
  const bucketed = rows.map((r: any) => {
    const age = ageOf(r.createdAt);
    return {
      ...r,
      ageDays: age,
      bucket: age <= 3 ? 'FRESH' : age <= 7 ? 'WEEK' : age <= 21 ? 'AGING' : 'STALE',
    };
  });
  const counts: Record<string, number> = { FRESH: 0, WEEK: 0, AGING: 0, STALE: 0 };
  for (const r of bucketed) counts[r.bucket]++;
  return c.json({ items: bucketed, counts, total: rows.length });
});

app.post('/:id/cancel', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await assertOwnsBackorder(db, user, id);
  await db
    .update(orderBackorders)
    .set({ status: 'CANCELLED', updatedAt: new Date().toISOString() })
    .where(eq(orderBackorders.id, id));
  return c.json({ id, status: 'CANCELLED' });
});

export default app;

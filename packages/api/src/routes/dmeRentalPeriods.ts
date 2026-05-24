/**
 * /api/dme-rental-periods — admin / hospital view of rental period schedule.
 *
 *   GET /order/:orderId            — list periods for an order
 *   PUT /:id                       — update monthly rate or notes
 *   POST /order/:orderId/initialize — manual re-init of periods
 */
import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { dmeRentalPeriods, orders } from '@curavend/db';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { initializeRentalPeriods } from '../cron/dmeRentalBilling';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/order/:orderId', async (c) => {
  const db = getDb(c.env.DB);
  const { orderId } = c.req.param();
  const user = c.get('user');
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) throw new NotFoundError('Order not found');
  if (!isAdmin(user) && user.hospitalId && (ord as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this order');
  }
  const rows = await db
    .select()
    .from(dmeRentalPeriods)
    .where(eq(dmeRentalPeriods.orderId, orderId))
    .orderBy(asc(dmeRentalPeriods.periodNumber));
  return c.json({ items: rows });
});

app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.monthlyRateUsd !== undefined) patch.monthlyRateUsd = body.monthlyRateUsd;
  if (body.notes !== undefined) patch.notes = body.notes;
  await db.update(dmeRentalPeriods).set(patch).where(eq(dmeRentalPeriods.id, id));
  return c.json({ id, updated: true });
});

app.post('/order/:orderId/initialize', async (c) => {
  const { orderId } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { monthlyRateUsd?: number };
  const r = await initializeRentalPeriods(c.env, orderId, body.monthlyRateUsd ?? 0);
  if (r.created === 0) {
    throw new ValidationError('No rental periods created — order may not have rentalType set or it is PURCHASE');
  }
  return c.json(r);
});

export default app;

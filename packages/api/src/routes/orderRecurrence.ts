/**
 * Order Recurrence — schedule management for recurring (requisition) orders.
 *
 * A plan is anchored to a template order (`parentOrderId`). The daily cron
 * (cron/recurringOrderSpawner.ts) walks plans whose `nextOccurrenceDate` is
 * within `leadTimeDays` of today and spawns child orders.
 */
import { Hono } from 'hono';
import { eq, and, desc, sql, lte } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orderRecurrencePlans,
  orders,
  RECURRENCE_FREQUENCY_UNITS,
  RECURRENCE_STATUSES,
} from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import {
  computeInitialOccurrenceDate,
  computeNextOccurrenceDate,
  computeUpcomingOccurrences,
  type RecurrencePlanLike,
} from '../lib/recurrence';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertPlanAccess(user: AuthUser, plan: { hospitalId: string; vendorId: string | null }): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'HOSPITAL' && user.hospitalId === plan.hospitalId) return;
  if (user.userType === 'VENDOR' && plan.vendorId && user.vendorId === plan.vendorId) return;
  throw new ForbiddenError('You do not have access to this recurrence plan');
}

// ─── GET /recurrence — list plans for caller's tenant ────────────────────
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { status, limit = '50', offset = '0' } = c.req.query();

  const conditions: any[] = [];
  if (user.userType !== 'ADMIN') {
    if (user.userType === 'HOSPITAL' && user.hospitalId) {
      conditions.push(eq(orderRecurrencePlans.hospitalId, user.hospitalId));
    } else if (user.userType === 'VENDOR' && user.vendorId) {
      conditions.push(eq(orderRecurrencePlans.vendorId, user.vendorId));
    } else {
      return c.json({ items: [], total: 0 });
    }
  }
  if (status) conditions.push(eq(orderRecurrencePlans.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, count] = await Promise.all([
    db
      .select()
      .from(orderRecurrencePlans)
      .where(where)
      .orderBy(desc(orderRecurrencePlans.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` }).from(orderRecurrencePlans).where(where),
  ]);
  return c.json({ items, total: count[0]?.count ?? 0 });
});

// ─── POST /recurrence/by-order/:orderId — convert order into recurring template ─
app.post('/by-order/:orderId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId } = c.req.param();
  const body = await c.req.json();

  const orderRow = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!orderRow.length) throw new NotFoundError('Order not found');
  const order = orderRow[0];

  // Caller must have write access to this hospital
  if (user.userType !== 'ADMIN') {
    if (user.userType !== 'HOSPITAL' || user.hospitalId !== order.hospitalId) {
      throw new ForbiddenError('Only the hospital can schedule this order');
    }
  }

  if (!RECURRENCE_FREQUENCY_UNITS.includes(body.frequencyUnit)) {
    throw new ValidationError(
      `frequencyUnit must be one of ${RECURRENCE_FREQUENCY_UNITS.join(', ')}`,
    );
  }
  if (!body.frequencyValue || Number(body.frequencyValue) < 1) {
    throw new ValidationError('frequencyValue must be >= 1');
  }
  if (!body.startDate) {
    throw new ValidationError('startDate is required');
  }

  // Reject duplicate plan on the same template
  const existing = await db
    .select({ id: orderRecurrencePlans.id })
    .from(orderRecurrencePlans)
    .where(
      and(
        eq(orderRecurrencePlans.parentOrderId, orderId),
        eq(orderRecurrencePlans.status, 'ACTIVE'),
      ),
    )
    .limit(1);
  if (existing.length) {
    throw new ValidationError('This order already has an active recurrence plan');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const planLike: RecurrencePlanLike = {
    frequencyUnit: body.frequencyUnit,
    frequencyValue: Number(body.frequencyValue),
    anchorDay: body.anchorDay != null ? Number(body.anchorDay) : null,
    startDate: body.startDate,
    endDate: body.endDate ?? null,
    totalOccurrences: body.totalOccurrences != null ? Number(body.totalOccurrences) : null,
    skipDates: body.skipDates ? JSON.stringify(body.skipDates) : null,
    occurrencesSpawned: 0,
  };
  const nextDate = computeInitialOccurrenceDate(planLike);

  await db.insert(orderRecurrencePlans).values({
    id,
    parentOrderId: orderId,
    hospitalId: order.hospitalId,
    vendorId: order.vendorId,
    frequencyUnit: body.frequencyUnit,
    frequencyValue: Number(body.frequencyValue),
    anchorDay: body.anchorDay != null ? Number(body.anchorDay) : null,
    customCronExpression: body.customCronExpression ?? null,
    startDate: body.startDate,
    endDate: body.endDate ?? null,
    totalOccurrences: body.totalOccurrences != null ? Number(body.totalOccurrences) : null,
    skipDates: planLike.skipDates,
    leadTimeDays: body.leadTimeDays != null ? Number(body.leadTimeDays) : 3,
    requireReauthEvery: body.requireReauthEvery != null ? Number(body.requireReauthEvery) : null,
    status: 'ACTIVE',
    nextOccurrenceDate: nextDate,
    occurrencesSpawned: 0,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db
    .select()
    .from(orderRecurrencePlans)
    .where(eq(orderRecurrencePlans.id, id))
    .limit(1);
  return c.json(created[0], 201);
});

// ─── GET /recurrence/by-order/:orderId — read latest plan for this order ─
app.get('/by-order/:orderId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId } = c.req.param();
  const rows = await db
    .select()
    .from(orderRecurrencePlans)
    .where(eq(orderRecurrencePlans.parentOrderId, orderId))
    .orderBy(desc(orderRecurrencePlans.createdAt))
    .limit(1);
  if (!rows.length) throw new NotFoundError('No recurrence plan for this order');
  assertPlanAccess(user, rows[0]);
  return c.json(rows[0]);
});

// ─── PUT /recurrence/:planId — update cadence + bounds ───────────────────
app.put('/:planId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { planId } = c.req.param();
  const body = await c.req.json();

  const rows = await db
    .select()
    .from(orderRecurrencePlans)
    .where(eq(orderRecurrencePlans.id, planId))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Recurrence plan not found');
  assertPlanAccess(user, rows[0]);

  const update: any = { updatedAt: new Date().toISOString() };
  if (body.frequencyUnit !== undefined) {
    if (!RECURRENCE_FREQUENCY_UNITS.includes(body.frequencyUnit)) {
      throw new ValidationError(`frequencyUnit invalid`);
    }
    update.frequencyUnit = body.frequencyUnit;
  }
  if (body.frequencyValue !== undefined) update.frequencyValue = Number(body.frequencyValue);
  if (body.anchorDay !== undefined) update.anchorDay = body.anchorDay != null ? Number(body.anchorDay) : null;
  if (body.endDate !== undefined) update.endDate = body.endDate;
  if (body.totalOccurrences !== undefined) update.totalOccurrences = body.totalOccurrences != null ? Number(body.totalOccurrences) : null;
  if (body.skipDates !== undefined) update.skipDates = body.skipDates ? JSON.stringify(body.skipDates) : null;
  if (body.leadTimeDays !== undefined) update.leadTimeDays = Number(body.leadTimeDays);
  if (body.requireReauthEvery !== undefined) update.requireReauthEvery = body.requireReauthEvery != null ? Number(body.requireReauthEvery) : null;

  await db.update(orderRecurrencePlans).set(update).where(eq(orderRecurrencePlans.id, planId));
  const updated = await db.select().from(orderRecurrencePlans).where(eq(orderRecurrencePlans.id, planId)).limit(1);
  return c.json(updated[0]);
});

// ─── POST /recurrence/:planId/pause ───────────────────────────────────────
app.post('/:planId/pause', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { planId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  const rows = await db.select().from(orderRecurrencePlans).where(eq(orderRecurrencePlans.id, planId)).limit(1);
  if (!rows.length) throw new NotFoundError('Recurrence plan not found');
  assertPlanAccess(user, rows[0]);
  if (rows[0].status !== 'ACTIVE') {
    throw new ValidationError(`Cannot pause plan in status ${rows[0].status}`);
  }

  const now = new Date().toISOString();
  await db
    .update(orderRecurrencePlans)
    .set({
      status: 'PAUSED',
      pausedAt: now,
      pausedBy: user.id,
      pausedReason: body.reason ?? null,
      pauseUntil: body.pauseUntil ?? null,
      updatedAt: now,
    })
    .where(eq(orderRecurrencePlans.id, planId));
  return c.json({ success: true, status: 'PAUSED' });
});

// ─── POST /recurrence/:planId/resume ──────────────────────────────────────
app.post('/:planId/resume', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { planId } = c.req.param();

  const rows = await db.select().from(orderRecurrencePlans).where(eq(orderRecurrencePlans.id, planId)).limit(1);
  if (!rows.length) throw new NotFoundError('Recurrence plan not found');
  assertPlanAccess(user, rows[0]);
  if (rows[0].status !== 'PAUSED') {
    throw new ValidationError(`Cannot resume plan in status ${rows[0].status}`);
  }

  const now = new Date().toISOString();
  await db
    .update(orderRecurrencePlans)
    .set({
      status: 'ACTIVE',
      pausedAt: null,
      pausedBy: null,
      pausedReason: null,
      pauseUntil: null,
      updatedAt: now,
    })
    .where(eq(orderRecurrencePlans.id, planId));
  return c.json({ success: true, status: 'ACTIVE' });
});

// ─── POST /recurrence/:planId/cancel ──────────────────────────────────────
app.post('/:planId/cancel', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { planId } = c.req.param();

  const rows = await db.select().from(orderRecurrencePlans).where(eq(orderRecurrencePlans.id, planId)).limit(1);
  if (!rows.length) throw new NotFoundError('Recurrence plan not found');
  assertPlanAccess(user, rows[0]);
  if (rows[0].status === 'CANCELLED' || rows[0].status === 'COMPLETED') {
    throw new ValidationError(`Plan is already ${rows[0].status}`);
  }

  const now = new Date().toISOString();
  await db
    .update(orderRecurrencePlans)
    .set({
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledBy: user.id,
      updatedAt: now,
    })
    .where(eq(orderRecurrencePlans.id, planId));
  return c.json({ success: true, status: 'CANCELLED' });
});

// ─── POST /recurrence/:planId/skip-next ───────────────────────────────────
app.post('/:planId/skip-next', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { planId } = c.req.param();

  const rows = await db.select().from(orderRecurrencePlans).where(eq(orderRecurrencePlans.id, planId)).limit(1);
  if (!rows.length) throw new NotFoundError('Recurrence plan not found');
  assertPlanAccess(user, rows[0]);
  if (rows[0].status !== 'ACTIVE') {
    throw new ValidationError(`Cannot skip on plan in status ${rows[0].status}`);
  }
  if (!rows[0].nextOccurrenceDate) {
    throw new ValidationError('Plan has no upcoming occurrence');
  }

  const planLike: RecurrencePlanLike = {
    frequencyUnit: rows[0].frequencyUnit,
    frequencyValue: rows[0].frequencyValue,
    anchorDay: rows[0].anchorDay,
    startDate: rows[0].startDate,
    endDate: rows[0].endDate,
    totalOccurrences: rows[0].totalOccurrences,
    skipDates: rows[0].skipDates,
    occurrencesSpawned: rows[0].occurrencesSpawned,
  };
  const newNext = computeNextOccurrenceDate(planLike, rows[0].nextOccurrenceDate);
  const now = new Date().toISOString();
  await db
    .update(orderRecurrencePlans)
    .set({
      nextOccurrenceDate: newNext,
      status: newNext ? 'ACTIVE' : 'COMPLETED',
      updatedAt: now,
    })
    .where(eq(orderRecurrencePlans.id, planId));
  return c.json({ success: true, nextOccurrenceDate: newNext });
});

// ─── GET /recurrence/:planId/occurrences ──────────────────────────────────
app.get('/:planId/occurrences', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { planId } = c.req.param();

  const rows = await db.select().from(orderRecurrencePlans).where(eq(orderRecurrencePlans.id, planId)).limit(1);
  if (!rows.length) throw new NotFoundError('Recurrence plan not found');
  assertPlanAccess(user, rows[0]);

  // Spawned children
  const children = await db
    .select({
      id: orders.id,
      identifier: orders.identifier,
      status: orders.status,
      orderSubStatus: orders.orderSubStatus,
      recurrenceIndex: orders.recurrenceIndex,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.recurrencePlanId, planId))
    .orderBy(orders.recurrenceIndex);

  // Projected next 3
  const planLike: RecurrencePlanLike = {
    frequencyUnit: rows[0].frequencyUnit,
    frequencyValue: rows[0].frequencyValue,
    anchorDay: rows[0].anchorDay,
    startDate: rows[0].startDate,
    endDate: rows[0].endDate,
    totalOccurrences: rows[0].totalOccurrences,
    skipDates: rows[0].skipDates,
    occurrencesSpawned: rows[0].occurrencesSpawned,
  };
  const upcoming: string[] = [];
  if (rows[0].status === 'ACTIVE' && rows[0].nextOccurrenceDate) {
    upcoming.push(rows[0].nextOccurrenceDate);
    upcoming.push(...computeUpcomingOccurrences(planLike, rows[0].nextOccurrenceDate, 2));
  }

  return c.json({ plan: rows[0], spawned: children, upcoming });
});

export default app;

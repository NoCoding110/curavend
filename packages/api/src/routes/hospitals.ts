import { Hono } from 'hono';
import { eq, like, desc, sql, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { hospitals } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { stripImmutableFields } from '../lib/sanitizeBody';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ── Admin-only guard ───────────────────────────────────────────────────────
function requireAdmin(user: any): void {
  if (user.userType !== 'ADMIN') throw new ForbiddenError('Admin access required');
}

// GET /hospitals - List hospitals
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const { search, providerId, limit = '50', offset = '0' } = c.req.query();

  let conditions: any[] = [];

  // Scope to provider if user is a provider
  if (user.providerId) {
    conditions.push(eq(hospitals.providerId, user.providerId));
  }
  if (providerId) {
    conditions.push(eq(hospitals.providerId, providerId));
  }
  if (search) {
    conditions.push(like(hospitals.name, `%${search}%`));
  }

  let query = db.select().from(hospitals);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await (query as any)
    .orderBy(desc(hospitals.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: results });
});

// GET /hospitals/:id - Get hospital by ID
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const result = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, id))
    .limit(1);

  if (!result.length) {
    throw new NotFoundError('Hospital not found');
  }

  // Hospital users can only view their own facility
  if (user.userType === 'HOSPITAL' && result[0].id !== user.hospitalId) {
    throw new ForbiddenError('Access denied');
  }
  // Provider users can only view hospitals in their network
  if (user.providerId && result[0].providerId !== user.providerId) {
    throw new ForbiddenError('Access denied');
  }

  return c.json(result[0]);
});

// POST /hospitals - Create hospital (ADMIN only)
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);
  const body = await c.req.json();

  if (!body.name) {
    throw new ValidationError('Hospital name is required');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(hospitals).values({
    id,
    ...stripImmutableFields(body),
    modifiedOrders: 0,
    inProcessOrders: 0,
    cancelledOrders: 0,
    completedOrders: 0,
    unreadOrderCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const result = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// PUT /hospitals/:id - Update hospital (ADMIN or own hospital)
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Hospital not found');
  }

  if (user.userType !== 'ADMIN' && id !== user.hospitalId) {
    throw new ForbiddenError('Access denied');
  }

  await db
    .update(hospitals)
    .set({ ...stripImmutableFields(body), updatedAt: new Date().toISOString() })
    .where(eq(hospitals.id, id));

  const result = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, id))
    .limit(1);

  return c.json(result[0]);
});

// DELETE /hospitals/:id (ADMIN only)
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);
  const { id } = c.req.param();
  const existing = await db.select().from(hospitals).where(eq(hospitals.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Hospital not found');
  await db.delete(hospitals).where(eq(hospitals.id, id));
  return c.json({ success: true });
});

export default app;

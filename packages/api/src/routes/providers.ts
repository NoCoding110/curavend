import { Hono } from 'hono';
import { eq, like, desc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { providers } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { stripImmutableFields } from '../lib/sanitizeBody';
import { hashPassword } from '../services/authService';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function requireAdmin(user: any): void {
  if (user.userType !== 'ADMIN') throw new ForbiddenError('Admin access required');
}

// GET /providers - List providers
// Only ADMIN sees all; provider users see only their own; others are forbidden
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const { search, limit = '50', offset = '0' } = c.req.query();

  // Only ADMIN and PROVIDER users can list providers
  if (user.userType !== 'ADMIN' && user.userType !== 'PROVIDER') {
    throw new ForbiddenError('Access denied');
  }

  let query = db.select().from(providers);

  // Provider-scoped users see only their own provider
  if (user.providerId) {
    query = query.where(eq(providers.id, user.providerId)) as any;
  } else if (search) {
    query = query.where(like(providers.name, `%${search}%`)) as any;
  }

  const results = await (query as any)
    .orderBy(desc(providers.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(providers);

  return c.json({
    items: results,
    total: countResult[0]?.count || 0,
  });
});

// GET /providers/:id - Get provider by ID (ADMIN or own provider)
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  if (user.userType !== 'ADMIN' && user.providerId !== id) {
    throw new ForbiddenError('Access denied');
  }

  const result = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  if (!result.length) {
    throw new NotFoundError('Provider not found');
  }

  return c.json(result[0]);
});

// POST /providers/onboard — create provider network + admin user (ADMIN only)
app.post('/onboard', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);

  const body = await c.req.json();
  if (!body.name) throw new ValidationError('Provider name is required');
  if (!body.adminUser?.email) throw new ValidationError('Admin user email is required');

  const providerId = crypto.randomUUID();
  const now = new Date().toISOString();

  // NOTE: `npi` / `phone` / `billingEmail` aren't in the providers schema;
  // they'd need a migration before being persistable. `address` maps to
  // `physicalStreetAddress` and friends.
  await db.insert(providers).values({
    id: providerId,
    name: body.name,
    ein: body.ein ?? null,
    physicalStreetAddress: body.address ?? body.physicalStreetAddress ?? null,
    physicalCity: body.city ?? null,
    physicalState: body.state ?? null,
    physicalZip: body.zip ?? null,
    primaryAccountEmail: body.adminUser?.email ?? body.primaryAccountEmail ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Link hospitals if provided
  if (Array.isArray(body.hospitalIds) && body.hospitalIds.length > 0) {
    for (const hospitalId of body.hospitalIds) {
      await db.run(sql`UPDATE hospitals SET provider_id = ${providerId}, updated_at = ${now} WHERE id = ${hospitalId}`);
    }
  }

  const tempPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
  const passwordHash = await hashPassword(tempPassword);

  const adminId = crypto.randomUUID();
  const adminEmail = body.adminUser.email.toLowerCase().trim();

  await db.run(sql`
    INSERT INTO users (id, name, email, password, role, user_type, approval_status, user_status, must_change_password, provider_id, failed_login_attempts, created_at, updated_at)
    VALUES (
      ${adminId}, ${`${body.adminUser.firstName ?? ''} ${body.adminUser.lastName ?? ''}`.trim()},
      ${adminEmail}, ${passwordHash}, 'ADMIN', 'ADMIN', 'APPROVED', 'ACTIVE', 1, ${providerId}, 0, ${now}, ${now}
    )
  `);

  return c.json({ success: true, providerId, adminUserId: adminId }, 201);
});

// POST /providers - Create provider (ADMIN only)
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);
  const body = await c.req.json();

  if (!body.name) {
    throw new ValidationError('Provider name is required');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(providers).values({
    id,
    ...stripImmutableFields(body),
    createdAt: now,
    updatedAt: now,
  });

  const result = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// PUT /providers/:id - Update provider (ADMIN or own provider)
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  if (user.userType !== 'ADMIN' && user.providerId !== id) {
    throw new ForbiddenError('Access denied');
  }

  const existing = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Provider not found');
  }

  await db
    .update(providers)
    .set({
      ...stripImmutableFields(body),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(providers.id, id));

  const result = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  return c.json(result[0]);
});

// DELETE /providers/:id (ADMIN only)
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);
  const { id } = c.req.param();
  const existing = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Provider not found');
  await db.delete(providers).where(eq(providers.id, id));
  return c.json({ success: true });
});

export default app;

/**
 * Integration log + retry endpoints.
 *
 *   GET    /integrations/log?status=&entityType=&entityId=&connector=
 *   GET    /integrations/log/:id
 *   POST   /integrations/log/:id/retry
 *   POST   /integrations/log/:id/abort
 *
 * Admin-only: this is operational tooling, not tenant-facing.
 */
import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { integrationLog } from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { abortIntegrationCall } from '../lib/integrationLog';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertAdmin(user: AuthUser): void {
  if (user.userType !== 'ADMIN') {
    throw new ForbiddenError('Admin only');
  }
}

app.get('/log', async (c) => {
  const user = c.get('user');
  assertAdmin(user);
  const db = getDb(c.env.DB);
  const { status, entityType, entityId, connector, limit = '100', offset = '0' } = c.req.query();

  const conditions: any[] = [];
  if (status) conditions.push(eq(integrationLog.status, status));
  if (entityType) conditions.push(eq(integrationLog.entityType, entityType));
  if (entityId) conditions.push(eq(integrationLog.entityId, entityId));
  if (connector) conditions.push(eq(integrationLog.connectorType, connector));
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, count] = await Promise.all([
    db
      .select()
      .from(integrationLog)
      .where(where)
      .orderBy(desc(integrationLog.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` }).from(integrationLog).where(where),
  ]);
  return c.json({ items, total: count[0]?.count ?? 0 });
});

app.get('/log/:id', async (c) => {
  const user = c.get('user');
  assertAdmin(user);
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db.select().from(integrationLog).where(eq(integrationLog.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Log entry not found');
  return c.json(rows[0]);
});

app.post('/log/:id/retry', async (c) => {
  const user = c.get('user');
  assertAdmin(user);
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db.select().from(integrationLog).where(eq(integrationLog.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Log entry not found');
  const row = rows[0];
  if (row.status === 'SUCCESS') {
    throw new ValidationError('Call already succeeded');
  }
  // Mark as RETRYING with nextRetryAt = now so the cron picks it up on next sweep
  await db
    .update(integrationLog)
    .set({
      status: 'RETRYING',
      nextRetryAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrationLog.id, id));
  return c.json({ success: true, status: 'RETRYING' });
});

app.post('/log/:id/abort', async (c) => {
  const user = c.get('user');
  assertAdmin(user);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  await abortIntegrationCall(c.env.DB, id, body.reason);
  return c.json({ success: true, status: 'TERMINAL_FAILURE' });
});

export default app;

/**
 * /api/compliance-alerts — admin compliance dashboard data.
 *
 *   GET  /                     list open alerts (filter by severity, type, hospital)
 *   POST /:id/acknowledge      mark as seen (does NOT resolve)
 *   POST /sweep                manually trigger the sweep (admin-only)
 */
import { Hono } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { complianceAlerts } from '@curavend/db';
import { NotFoundError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { sweepComplianceAlerts } from '../services/complianceAlertService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/', requirePermission('compliance-alerts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { severity, subjectType, includeResolved } = c.req.query();
  const conds: any[] = [];
  if (includeResolved !== '1') conds.push(isNull(complianceAlerts.resolvedAt));
  if (severity) conds.push(eq(complianceAlerts.severity, severity));
  if (subjectType) conds.push(eq(complianceAlerts.subjectType, subjectType));
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('hospital scope required');
    conds.push(eq(complianceAlerts.hospitalId, user.hospitalId));
  }
  const rows = await db
    .select()
    .from(complianceAlerts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(complianceAlerts.severity), desc(complianceAlerts.createdAt))
    .limit(1000);
  return c.json({ items: rows });
});

app.post('/:id/acknowledge', requirePermission('compliance-alerts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [row] = await db.select().from(complianceAlerts).where(eq(complianceAlerts.id, id)).limit(1);
  if (!row) throw new NotFoundError('Alert not found');
  if (!isAdmin(user) && row.hospitalId && row.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Alert belongs to a different tenant');
  }
  const now = new Date().toISOString();
  await db
    .update(complianceAlerts)
    .set({ acknowledgedAt: now, acknowledgedByUserId: user.id, updatedAt: now })
    .where(eq(complianceAlerts.id, id));
  return c.json({ id, acknowledgedAt: now });
});

app.post('/sweep', async (c) => {
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Admin-only');
  const r = await sweepComplianceAlerts(c.env.DB);
  return c.json(r);
});

export default app;

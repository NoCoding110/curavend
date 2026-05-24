/**
 * /api/reporting/gl — General-ledger reporting + export.
 *
 *   GET  /entries?hospitalId=&fiscalYear=&fiscalPeriod=&sourceType=&unexported=1
 *   GET  /export.csv?...      — same filters, returns CSV ready for ERP import
 *   POST /mark-exported       — body: { ids: [...] }  stamps exportedAt
 *
 * Hospital users see only their hospital; admins see all.
 */
import { Hono } from 'hono';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { glEntries } from '@curavend/db';
import { ValidationError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

function buildConds(user: AuthUser, q: Record<string, string>) {
  const conds: any[] = [];
  const hospitalId = isAdmin(user) ? q.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ForbiddenError('hospitalId required');
  conds.push(eq(glEntries.hospitalId, hospitalId));
  if (q.fiscalYear) conds.push(eq(glEntries.fiscalYear, Number(q.fiscalYear)));
  if (q.fiscalPeriod) conds.push(eq(glEntries.fiscalPeriod, q.fiscalPeriod));
  if (q.sourceType) conds.push(eq(glEntries.sourceType, q.sourceType));
  if (q.unexported === '1') conds.push(isNull(glEntries.exportedAt));
  return conds;
}

app.get('/entries', requirePermission('gl-ledger', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const conds = buildConds(user, c.req.query());
  const rows = await db
    .select()
    .from(glEntries)
    .where(and(...conds))
    .orderBy(desc(glEntries.postedAt))
    .limit(2000);
  return c.json({ items: rows });
});

app.get('/export.csv', requirePermission('gl-ledger', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const conds = buildConds(user, c.req.query());
  const rows = await db
    .select()
    .from(glEntries)
    .where(and(...conds))
    .orderBy(desc(glEntries.postedAt))
    .limit(5000);
  const headers = [
    'transactionId', 'postedAt', 'fiscalYear', 'fiscalPeriod', 'accountCode',
    'costCenter', 'departmentId', 'debitUsd', 'creditUsd', 'sourceType',
    'sourceId', 'memo',
  ];
  const csvRows = [headers.join(',')];
  for (const r of rows) {
    csvRows.push(
      [
        r.transactionId,
        r.postedAt,
        r.fiscalYear,
        r.fiscalPeriod,
        r.accountCode,
        r.costCenter ?? '',
        r.departmentId ?? '',
        r.debitUsd.toFixed(2),
        r.creditUsd.toFixed(2),
        r.sourceType,
        r.sourceId,
        (r.memo ?? '').replace(/,/g, ' ').replace(/\n/g, ' '),
      ].join(','),
    );
  }
  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="gl-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

app.post('/mark-exported', requirePermission('gl-ledger', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Admin-only');
  const body = (await c.req.json()) as { ids?: string[] };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw new ValidationError('ids[] required');
  }
  const now = new Date().toISOString();
  let updated = 0;
  for (const id of body.ids) {
    await db.update(glEntries).set({ exportedAt: now }).where(eq(glEntries.id, id));
    updated++;
  }
  return c.json({ updated });
});

export default app;

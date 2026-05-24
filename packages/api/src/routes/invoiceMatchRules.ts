/**
 * /api/invoice-match-rules — CRUD + dry-run preview for match auto-resolution.
 *
 *   GET    /                list (hospital-scoped)
 *   POST   /                create
 *   PUT    /:id             update (tolerances, isActive)
 *   DELETE /:id             remove
 *   POST   /preview         body: { vendorId, poTotalUsd, invoiceTotalUsd } → AutoResolveResult
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { invoiceMatchRules } from '@curavend/db';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { evaluateMatchRules } from '../services/invoiceMatchService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/', requirePermission('budgets', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const conds: any[] = [];
  const hospitalId = isAdmin(user) ? c.req.query('hospitalId') : user.hospitalId;
  if (!hospitalId) throw new ForbiddenError('hospitalId required');
  conds.push(eq(invoiceMatchRules.hospitalId, hospitalId));
  const rows = await db
    .select()
    .from(invoiceMatchRules)
    .where(and(...conds))
    .orderBy(desc(invoiceMatchRules.updatedAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/', requirePermission('budgets', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? user.hospitalId) : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  if (body.tolerancePct == null || body.toleranceMaxUsd == null) {
    throw new ValidationError('tolerancePct and toleranceMaxUsd required');
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(invoiceMatchRules).values({
    id, hospitalId,
    vendorId: body.vendorId ?? null,
    tolerancePct: Number(body.tolerancePct),
    toleranceMaxUsd: Number(body.toleranceMaxUsd),
    isActive: body.isActive === false ? 0 : 1,
    notes: body.notes ?? null,
    createdByUserId: user.id,
    createdAt: now, updatedAt: now,
  });
  return c.json({ id }, 201);
});

app.put('/:id', requirePermission('budgets', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [existing] = await db.select().from(invoiceMatchRules).where(eq(invoiceMatchRules.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Rule not found');
  if (!isAdmin(user) && existing.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Rule belongs to a different tenant');
  }
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.tolerancePct != null) patch.tolerancePct = Number(body.tolerancePct);
  if (body.toleranceMaxUsd != null) patch.toleranceMaxUsd = Number(body.toleranceMaxUsd);
  if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.vendorId !== undefined) patch.vendorId = body.vendorId;
  await db.update(invoiceMatchRules).set(patch).where(eq(invoiceMatchRules.id, id));
  return c.json({ id, updated: true });
});

app.delete('/:id', requirePermission('budgets', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [existing] = await db.select().from(invoiceMatchRules).where(eq(invoiceMatchRules.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Rule not found');
  if (!isAdmin(user) && existing.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Rule belongs to a different tenant');
  }
  await db.delete(invoiceMatchRules).where(eq(invoiceMatchRules.id, id));
  return c.json({ id, deleted: true });
});

app.post('/preview', requirePermission('budgets', 'READ'), async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? user.hospitalId) : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  if (!body.vendorId || body.poTotalUsd == null || body.invoiceTotalUsd == null) {
    throw new ValidationError('vendorId, poTotalUsd, invoiceTotalUsd required');
  }
  const result = await evaluateMatchRules(c.env.DB, {
    hospitalId,
    vendorId: body.vendorId,
    poTotalUsd: Number(body.poTotalUsd),
    invoiceTotalUsd: Number(body.invoiceTotalUsd),
  });
  return c.json(result);
});

export default app;

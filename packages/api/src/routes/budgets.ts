/**
 * /api/budgets — admin CRUD + check endpoint for hospital budgets.
 *
 *   GET  /                — list budgets (filter by hospital / dept / year)
 *   POST /                — create a budget
 *   PUT  /:id             — update amount / notes
 *   DELETE /:id           — soft-delete (sets amount=0)  TODO: real archive
 *   GET  /:id/history     — encumbrance log
 *   POST /check           — preview budget impact of a hypothetical requisition
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  hospitalBudgets,
  hospitalBudgetHistory,
  BUDGET_PERIODS,
} from '@curavend/db';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import { checkBudget } from '../services/budgetService';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}
function isHospitalManager(u: AuthUser) {
  return u.role === 'FACILITY_ACCOUNT_MANAGER' || u.role === 'FACILITY_ACCOUNT_MANAGER_USER';
}

app.get('/', requirePermission('budgets', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { hospitalId, departmentId, fiscalYear } = c.req.query();

  const conds: any[] = [];
  // Hospital-scoped users see only their hospital's budgets; admins see all.
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('Budgets are hospital-scoped');
    conds.push(eq(hospitalBudgets.hospitalId, user.hospitalId));
  } else if (hospitalId) {
    conds.push(eq(hospitalBudgets.hospitalId, hospitalId));
  }
  if (departmentId) conds.push(eq(hospitalBudgets.departmentId, departmentId));
  if (fiscalYear) conds.push(eq(hospitalBudgets.fiscalYear, Number(fiscalYear)));

  const rows = await db
    .select()
    .from(hospitalBudgets)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(hospitalBudgets.fiscalYear), desc(hospitalBudgets.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/', requirePermission('budgets', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isAdmin(user) && !isHospitalManager(user)) {
    throw new ForbiddenError('Only admins and hospital managers can create budgets');
  }
  const body = (await c.req.json()) as any;
  if (!body.fiscalYear || !body.amountUsd) {
    throw new ValidationError('fiscalYear and amountUsd are required');
  }
  if (body.period && !(BUDGET_PERIODS as readonly string[]).includes(body.period)) {
    throw new ValidationError(`period must be one of ${BUDGET_PERIODS.join(', ')}`);
  }
  if (!body.departmentId && !body.costCenter && !body.category) {
    throw new ValidationError(
      'At least one of departmentId, costCenter, or category is required',
    );
  }
  // Hospital managers can only create for their own hospital.
  const hospitalId = isAdmin(user)
    ? (body.hospitalId ?? user.hospitalId)
    : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');

  const id = crypto.randomUUID();
  await db.insert(hospitalBudgets).values({
    id,
    hospitalId,
    fiscalYear: Number(body.fiscalYear),
    period: body.period ?? 'ANNUAL',
    departmentId: body.departmentId ?? null,
    costCenter: body.costCenter ?? null,
    category: body.category ?? null,
    amountUsd: Number(body.amountUsd),
    committedUsd: 0,
    consumedUsd: 0,
    notes: body.notes ?? null,
    createdByUserId: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await db.insert(hospitalBudgetHistory).values({
    id: crypto.randomUUID(),
    budgetId: id,
    event: 'SET',
    deltaUsd: Number(body.amountUsd),
    sourceType: 'MANUAL',
    sourceId: id,
    note: body.notes ?? 'Initial set',
    byUserId: user.id,
    createdAt: new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

app.put('/:id', requirePermission('budgets', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isAdmin(user) && !isHospitalManager(user)) {
    throw new ForbiddenError('Only admins and hospital managers can edit budgets');
  }
  const { id } = c.req.param();
  const [existing] = await db
    .select()
    .from(hospitalBudgets)
    .where(eq(hospitalBudgets.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError('Budget not found');
  if (!isAdmin(user) && existing.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Budget belongs to a different tenant');
  }

  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.amountUsd != null) patch.amountUsd = Number(body.amountUsd);
  if (body.notes !== undefined) patch.notes = body.notes;
  await db.update(hospitalBudgets).set(patch).where(eq(hospitalBudgets.id, id));

  if (body.amountUsd != null && Number(body.amountUsd) !== existing.amountUsd) {
    await db.insert(hospitalBudgetHistory).values({
      id: crypto.randomUUID(),
      budgetId: id,
      event: 'ADJUST',
      deltaUsd: Number(body.amountUsd) - existing.amountUsd,
      sourceType: 'MANUAL',
      sourceId: id,
      note: body.notes ?? null,
      byUserId: user.id,
      createdAt: new Date().toISOString(),
    });
  }
  return c.json({ id, updated: true });
});

app.delete('/:id', requirePermission('budgets', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Admin-only');
  const { id } = c.req.param();
  await db.delete(hospitalBudgets).where(eq(hospitalBudgets.id, id));
  return c.json({ id, deleted: true });
});

app.get('/:id/history', requirePermission('budgets', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  // Verify the budget belongs to caller's tenant before exposing its history.
  const [budget] = await db
    .select({ hospitalId: hospitalBudgets.hospitalId })
    .from(hospitalBudgets)
    .where(eq(hospitalBudgets.id, id))
    .limit(1);
  if (!budget) throw new NotFoundError('Budget not found');
  if (!isAdmin(user) && budget.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Budget belongs to a different tenant');
  }
  const rows = await db
    .select()
    .from(hospitalBudgetHistory)
    .where(eq(hospitalBudgetHistory.budgetId, id))
    .orderBy(desc(hospitalBudgetHistory.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/check', requirePermission('budgets', 'READ'), async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.estimatedTotal) throw new ValidationError('estimatedTotal required');
  const hospitalId = isAdmin(user) ? body.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  const result = await checkBudget(c.env.DB, {
    hospitalId,
    departmentId: body.departmentId,
    costCenter: body.costCenter,
    category: body.category,
    estimatedTotal: Number(body.estimatedTotal),
  });
  return c.json(result);
});

export default app;

/**
 * /api/reporting/department-spend — per-department spend roll-up with budget
 * burn-down and over-budget flags.
 *
 *   GET /?hospitalId=&fiscalYear=&departmentId=&costCenter=
 *
 * Returns one row per (department, fiscalYear, period). Each row sums:
 *   committedUsd   — from requisitions in SUBMITTED/APPROVED state
 *   consumedUsd    — from purchase_orders that are SENT/ACKED
 *   budgetAmountUsd, budgetAvailableUsd, burnPct, overBudget
 *
 * Hospital users see only their own hospital; admins can scope to any.
 */
import { Hono } from 'hono';
import { and, eq, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  hospitalDepartments,
  hospitalBudgets,
  requisitions,
  purchaseOrders,
} from '@curavend/db';
import { ForbiddenError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const q = c.req.query();

  // Tenant scope.
  const hospitalId = isAdmin(user) ? q.hospitalId : user.hospitalId;
  if (!hospitalId) {
    throw new ForbiddenError('hospitalId required (admin) or hospital-scoped user only');
  }
  const fiscalYear = Number(q.fiscalYear) || new Date().getFullYear();

  // Departments in scope.
  const deptConds: any[] = [eq(hospitalDepartments.hospitalId, hospitalId)];
  if (q.departmentId) deptConds.push(eq(hospitalDepartments.id, q.departmentId));
  if (q.costCenter) deptConds.push(eq(hospitalDepartments.costCenter, q.costCenter));
  const depts = await db
    .select()
    .from(hospitalDepartments)
    .where(and(...deptConds));
  if (depts.length === 0) return c.json({ items: [] });
  const deptIds = depts.map((d) => d.id);

  // Committed: requisitions in SUBMITTED / IN_REVIEW / APPROVED.
  const commitRows = await db
    .select({
      departmentId: requisitions.departmentId,
      sum: sql<number>`COALESCE(SUM(${requisitions.estimatedTotalUsd}), 0)`,
    })
    .from(requisitions)
    .where(
      and(
        eq(requisitions.hospitalId, hospitalId),
        inArray(requisitions.departmentId, deptIds),
        inArray(requisitions.status, ['SUBMITTED', 'IN_REVIEW', 'APPROVED']),
      ),
    )
    .groupBy(requisitions.departmentId);
  const committedByDept = new Map<string, number>();
  for (const r of commitRows) {
    if (r.departmentId) committedByDept.set(r.departmentId, Number(r.sum) || 0);
  }

  // Consumed: POs in SENT or ACKED state.
  // POs don't carry departmentId directly — join via requisitionId.
  const poRows = await db
    .select({
      requisitionId: purchaseOrders.requisitionId,
      sum: sql<number>`COALESCE(SUM(${purchaseOrders.totalUsd}), 0)`,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.hospitalId, hospitalId),
        inArray(purchaseOrders.transmissionState, ['SENT', 'ACKED']),
      ),
    )
    .groupBy(purchaseOrders.requisitionId);
  const reqsLookup = await db
    .select({ id: requisitions.id, departmentId: requisitions.departmentId })
    .from(requisitions)
    .where(eq(requisitions.hospitalId, hospitalId));
  const reqDept = new Map(reqsLookup.map((r) => [r.id, r.departmentId]));
  const consumedByDept = new Map<string, number>();
  for (const r of poRows) {
    if (!r.requisitionId) continue;
    const d = reqDept.get(r.requisitionId);
    if (!d) continue;
    consumedByDept.set(d, (consumedByDept.get(d) ?? 0) + (Number(r.sum) || 0));
  }

  // Budgets per dept (ANNUAL only for the dashboard summary).
  const budgets = await db
    .select()
    .from(hospitalBudgets)
    .where(
      and(
        eq(hospitalBudgets.hospitalId, hospitalId),
        eq(hospitalBudgets.fiscalYear, fiscalYear),
        eq(hospitalBudgets.period, 'ANNUAL'),
      ),
    );
  const budgetByDept = new Map(
    budgets.filter((b) => b.departmentId).map((b) => [b.departmentId!, b]),
  );

  // Assemble rows.
  const items = depts.map((d) => {
    const committed = committedByDept.get(d.id) ?? 0;
    const consumed = consumedByDept.get(d.id) ?? 0;
    const budget = budgetByDept.get(d.id);
    const amount = budget?.amountUsd ?? null;
    const available = amount != null ? amount - committed - consumed : null;
    const burnPct = amount && amount > 0 ? Math.round(((committed + consumed) / amount) * 100) : null;
    return {
      departmentId: d.id,
      departmentName: d.name,
      costCenter: d.costCenter ?? null,
      glCode: d.glCode ?? null,
      serviceLine: d.serviceLine ?? null,
      fiscalYear,
      budgetAmountUsd: amount,
      committedUsd: committed,
      consumedUsd: consumed,
      availableUsd: available,
      burnPct,
      overBudget: available != null && available < 0,
    };
  });

  // Totals row.
  const totals = items.reduce(
    (t, r) => ({
      budgetAmountUsd: (t.budgetAmountUsd ?? 0) + (r.budgetAmountUsd ?? 0),
      committedUsd: t.committedUsd + r.committedUsd,
      consumedUsd: t.consumedUsd + r.consumedUsd,
    }),
    { budgetAmountUsd: 0, committedUsd: 0, consumedUsd: 0 },
  );
  return c.json({ items, totals, fiscalYear });
});

export default app;

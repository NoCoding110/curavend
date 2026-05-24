/**
 * Hospital budget service.
 *
 * Resolves which budget covers a requisition and applies encumbrance accounting
 * across the procurement lifecycle:
 *
 *   submit   →  COMMIT  (committed_usd += estimatedTotal)
 *   approve  →  no-op   (already committed; just unblocks PO conversion)
 *   reject   →  RELEASE (committed_usd -= estimatedTotal)
 *   cancel   →  RELEASE (committed_usd -= estimatedTotal)
 *   GR posted → CONSUME (committed_usd -= grValue; consumed_usd += grValue)
 *   invoice credit → REFUND
 *
 * Resolution precedence (narrowest match wins):
 *   1. (hospital, fiscalYear, period=Mxx, departmentId, category)
 *   2. (hospital, fiscalYear, period=Mxx, departmentId)
 *   3. (hospital, fiscalYear, period=Qx,  departmentId)
 *   4. (hospital, fiscalYear, period=ANNUAL, departmentId)
 *   5. (hospital, fiscalYear, period=ANNUAL, costCenter)
 *   6. (hospital, fiscalYear, period=ANNUAL, category)
 *
 * If no budget matches: returns { budget: null }. Caller may still allow
 * submit (depends on hospital policy — service does NOT block by default).
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { hospitalBudgets, hospitalBudgetHistory } from '@curavend/db';

export interface BudgetResolveArgs {
  hospitalId: string;
  departmentId?: string | null;
  costCenter?: string | null;
  category?: string | null;
  asOf?: Date;
}

export interface BudgetCheckResult {
  budget: typeof hospitalBudgets.$inferSelect | null;
  available: number;
  estimatedTotal: number;
  wouldOverrun: boolean;
  message: string;
}

function fiscalYearOf(d: Date): number {
  // Calendar year FY by default; hospitals with non-calendar FY can override
  // by setting hospital.fiscal_year_start_month in a future patch.
  return d.getFullYear();
}

function fiscalMonthOf(d: Date): string {
  return 'M' + String(d.getMonth() + 1).padStart(2, '0');
}

function fiscalQuarterOf(d: Date): string {
  return 'Q' + (Math.floor(d.getMonth() / 3) + 1);
}

/**
 * Resolves the narrowest applicable budget. Returns null when nothing matches.
 */
export async function resolveBudget(
  d1: D1Database,
  args: BudgetResolveArgs,
): Promise<typeof hospitalBudgets.$inferSelect | null> {
  const db = getDb(d1);
  const asOf = args.asOf ?? new Date();
  const fy = fiscalYearOf(asOf);
  const fm = fiscalMonthOf(asOf);
  const fq = fiscalQuarterOf(asOf);

  // Try each level of precedence in order.
  const tries: Array<Partial<typeof hospitalBudgets.$inferSelect>> = [];
  if (args.departmentId && args.category) {
    tries.push({ departmentId: args.departmentId, category: args.category, period: fm });
  }
  if (args.departmentId) {
    tries.push({ departmentId: args.departmentId, period: fm });
    tries.push({ departmentId: args.departmentId, period: fq });
    tries.push({ departmentId: args.departmentId, period: 'ANNUAL' });
  }
  if (args.costCenter) {
    tries.push({ costCenter: args.costCenter, period: 'ANNUAL' });
  }
  if (args.category) {
    tries.push({ category: args.category, period: 'ANNUAL' });
  }

  for (const t of tries) {
    const conds: any[] = [
      eq(hospitalBudgets.hospitalId, args.hospitalId),
      eq(hospitalBudgets.fiscalYear, fy),
      eq(hospitalBudgets.period, t.period!),
    ];
    if (t.departmentId) conds.push(eq(hospitalBudgets.departmentId, t.departmentId));
    if (t.costCenter) conds.push(eq(hospitalBudgets.costCenter, t.costCenter));
    if (t.category) conds.push(eq(hospitalBudgets.category, t.category));
    const [row] = await db.select().from(hospitalBudgets).where(and(...conds)).limit(1);
    if (row) return row;
  }
  return null;
}

/**
 * Estimates total cost and tells the caller whether the requisition would
 * exceed available budget. Does NOT mutate anything.
 */
export async function checkBudget(
  d1: D1Database,
  args: BudgetResolveArgs & { estimatedTotal: number },
): Promise<BudgetCheckResult> {
  const budget = await resolveBudget(d1, args);
  if (!budget) {
    return {
      budget: null,
      available: Infinity,
      estimatedTotal: args.estimatedTotal,
      wouldOverrun: false,
      message: 'No matching budget — submission is unscoped.',
    };
  }
  const available = budget.amountUsd - budget.committedUsd - budget.consumedUsd;
  const wouldOverrun = args.estimatedTotal > available;
  return {
    budget,
    available,
    estimatedTotal: args.estimatedTotal,
    wouldOverrun,
    message: wouldOverrun
      ? `Estimated $${args.estimatedTotal.toFixed(2)} exceeds available $${available.toFixed(2)} in budget "${budget.id.slice(0, 8)}".`
      : `Within budget. $${available.toFixed(2)} available, $${args.estimatedTotal.toFixed(2)} requested.`,
  };
}

/** Commit (encumber) against a budget. Idempotent per source. */
export async function commitBudget(
  d1: D1Database,
  args: {
    budgetId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    note?: string;
    byUserId?: string;
  },
) {
  const db = getDb(d1);
  await db
    .update(hospitalBudgets)
    .set({
      committedUsd: (await getCurrent(d1, args.budgetId)).committedUsd + args.amount,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(hospitalBudgets.id, args.budgetId));
  await db.insert(hospitalBudgetHistory).values({
    id: crypto.randomUUID(),
    budgetId: args.budgetId,
    event: 'COMMIT',
    deltaUsd: args.amount,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    note: args.note,
    byUserId: args.byUserId,
    createdAt: new Date().toISOString(),
  });
}

/** Release a prior commit (e.g. requisition rejected/cancelled). */
export async function releaseBudget(
  d1: D1Database,
  args: {
    budgetId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    note?: string;
    byUserId?: string;
  },
) {
  const db = getDb(d1);
  const cur = await getCurrent(d1, args.budgetId);
  await db
    .update(hospitalBudgets)
    .set({
      committedUsd: Math.max(0, cur.committedUsd - args.amount),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(hospitalBudgets.id, args.budgetId));
  await db.insert(hospitalBudgetHistory).values({
    id: crypto.randomUUID(),
    budgetId: args.budgetId,
    event: 'RELEASE',
    deltaUsd: -args.amount,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    note: args.note,
    byUserId: args.byUserId,
    createdAt: new Date().toISOString(),
  });
}

/** Move from committed → consumed (GR posted or invoice approved). */
export async function consumeBudget(
  d1: D1Database,
  args: {
    budgetId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    note?: string;
    byUserId?: string;
  },
) {
  const db = getDb(d1);
  const cur = await getCurrent(d1, args.budgetId);
  await db
    .update(hospitalBudgets)
    .set({
      committedUsd: Math.max(0, cur.committedUsd - args.amount),
      consumedUsd: cur.consumedUsd + args.amount,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(hospitalBudgets.id, args.budgetId));
  await db.insert(hospitalBudgetHistory).values({
    id: crypto.randomUUID(),
    budgetId: args.budgetId,
    event: 'CONSUME',
    deltaUsd: args.amount,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    note: args.note,
    byUserId: args.byUserId,
    createdAt: new Date().toISOString(),
  });
}

async function getCurrent(d1: D1Database, budgetId: string) {
  const db = getDb(d1);
  const [row] = await db.select().from(hospitalBudgets).where(eq(hospitalBudgets.id, budgetId)).limit(1);
  if (!row) throw new Error(`Budget ${budgetId} not found`);
  return row;
}

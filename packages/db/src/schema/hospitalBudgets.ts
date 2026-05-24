import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Hospital budgets — period × department/cost-center × amount with counters.
 *
 * One row per (hospitalId, fiscalYear, period, departmentId OR costCenter,
 * optional category). The two key counters:
 *
 *   committed_usd — grows when a requisition is SUBMITTED (encumbrance);
 *                   shrinks on REJECT/CANCEL.
 *   consumed_usd  — grows when goods are RECEIVED (or invoice APPROVED —
 *                   pick at service layer); shrinks on credit/refund.
 *
 * Available = amount - committed - consumed.
 *
 * Period values: 'ANNUAL' | 'Q1'..'Q4' | 'M01'..'M12'. Service picks the
 * narrowest matching budget at requisition-submit time.
 */
export const BUDGET_PERIODS = [
  'ANNUAL',
  'Q1', 'Q2', 'Q3', 'Q4',
  'M01', 'M02', 'M03', 'M04', 'M05', 'M06',
  'M07', 'M08', 'M09', 'M10', 'M11', 'M12',
] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const hospitalBudgets = sqliteTable(
  'hospital_budgets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    fiscalYear: integer('fiscal_year').notNull(),
    period: text('period').notNull().default('ANNUAL'),
    departmentId: text('department_id'),
    costCenter: text('cost_center'),
    category: text('category'),
    amountUsd: real('amount_usd').notNull(),
    committedUsd: real('committed_usd').notNull().default(0),
    consumedUsd: real('consumed_usd').notNull().default(0),
    notes: text('notes'),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('hospital_budgets_hospital_year_idx').on(t.hospitalId, t.fiscalYear),
    index('hospital_budgets_department_idx').on(t.departmentId),
    index('hospital_budgets_cost_center_idx').on(t.costCenter),
  ],
);

export const BUDGET_EVENTS = [
  'SET', 'COMMIT', 'RELEASE', 'CONSUME', 'REFUND', 'ADJUST',
] as const;
export type BudgetEvent = (typeof BUDGET_EVENTS)[number];

export const hospitalBudgetHistory = sqliteTable(
  'hospital_budget_history',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    budgetId: text('budget_id').notNull(),
    event: text('event').notNull(),
    deltaUsd: real('delta_usd').notNull(),
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    note: text('note'),
    byUserId: text('by_user_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('hospital_budget_history_budget_idx').on(t.budgetId),
    index('hospital_budget_history_source_idx').on(t.sourceType, t.sourceId),
  ],
);

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Cached hospital-side demand forecast runs. The forecast service walks
 * 12 months of order_items and emits a per-HCPC projection; we cache
 * the result so dashboard refreshes don't re-walk the order table.
 *
 * Keyed by hospital + run timestamp. Latest run per hospital wins.
 */
export const hospitalForecastRuns = sqliteTable(
  'hospital_forecast_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    runAt: text('run_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    horizonMonths: integer('horizon_months').notNull().default(3),
    lookbackMonths: integer('lookback_months').notNull().default(12),
    resultsJson: text('results_json').notNull(),
    createdByUserId: text('created_by_user_id'),
  },
  (t) => [
    index('hospital_forecast_runs_hospital_idx').on(t.hospitalId),
    index('hospital_forecast_runs_run_at_idx').on(t.runAt),
  ],
);

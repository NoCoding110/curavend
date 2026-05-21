import { sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// State-specific Medicaid / state DME fee schedule rates
// Separate from the embedded JSON on medicare_fee_schedule_items to allow
// indexed queries and admin bulk upload per-state.
export const stateRateScheduleItems = sqliteTable(
  "state_rate_schedule_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    stateCode: text("state_code").notNull(),  // 2-letter state abbrev, e.g. "CA"
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    rate: real("rate").notNull(),             // dollar amount
    rateType: text("rate_type"),              // e.g. "MEDICAID", "WORKERS_COMP", "STATE_RATE"
    effectiveDate: text("effective_date"),
    expiryDate: text("expiry_date"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("state_rate_state_hcpc_idx").on(table.stateCode, table.hcpcCode),
    index("state_rate_hcpc_idx").on(table.hcpcCode),
  ]
);

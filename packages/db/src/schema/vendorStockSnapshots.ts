import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * vendor_stock_snapshots — Phase D: latest known stock per
 * (vendor, location, vendor_sku) tuple. Upserted by the polling worker
 * and the webhook receiver. The unique index gates the upsert path.
 */
export const vendorStockSnapshots = sqliteTable(
  "vendor_stock_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    vendorLocationId: text("vendor_location_id").notNull(),
    vendorSku: text("vendor_sku").notNull(),
    hcpcCode: text("hcpc_code"),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    availableQuantity: integer("available_quantity"),
    source: text("source").notNull(), // 'HTTP_POLL' | 'WEBHOOK' | 'MANUAL' | 'EDI_846'
    observedAt: text("observed_at").notNull(),
    ingestedAt: text("ingested_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("vendor_stock_snapshots_unique").on(
      table.vendorId,
      table.vendorLocationId,
      table.vendorSku,
    ),
    index("vendor_stock_snapshots_hcpc_idx").on(table.hcpcCode),
    index("vendor_stock_snapshots_freshness_idx").on(table.ingestedAt),
    index("vendor_stock_snapshots_vendor_idx").on(table.vendorId),
  ],
);

/**
 * vendor_stock_feed_log — audit trail of poll attempts.
 */
export const vendorStockFeedLog = sqliteTable(
  "vendor_stock_feed_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectorId: text("connector_id").notNull(),
    status: text("status").notNull(), // 'OK' | 'PARTIAL' | 'FAILED'
    rowsWritten: integer("rows_written"),
    errorSummary: text("error_summary"),
    durationMs: integer("duration_ms"),
    ranAt: text("ran_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vendor_stock_feed_log_connector_idx").on(table.connectorId),
    index("vendor_stock_feed_log_ran_at_idx").on(table.ranAt),
  ],
);

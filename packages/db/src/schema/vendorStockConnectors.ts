import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

/**
 * vendor_stock_connectors — Phase D: per-vendor stock data source config.
 * connector_type: HTTP_POLL | WEBHOOK | EDI_846 | MANUAL
 */
export const vendorStockConnectors = sqliteTable(
  "vendor_stock_connectors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    connectorType: text("connector_type").notNull(),
    endpointUrl: text("endpoint_url"),
    authSecretRef: text("auth_secret_ref"),
    pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(15),
    isActive: integer("is_active").notNull().default(1),
    lastPolledAt: text("last_polled_at"),
    lastSuccessAt: text("last_success_at"),
    lastError: text("last_error"),
    config: text("config"), // JSON
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vendor_stock_connectors_vendor_idx").on(table.vendorId),
    index("vendor_stock_connectors_active_idx").on(table.isActive),
  ],
);

export const vendorStockConnectorsRelations = relations(
  vendorStockConnectors,
  ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorStockConnectors.vendorId],
      references: [vendors.id],
    }),
  }),
);

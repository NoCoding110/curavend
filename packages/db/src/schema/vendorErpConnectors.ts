import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

/**
 * vendor_erp_connectors — Phase E: outbound order push to a vendor's ERP.
 *
 * Mirrors the inbound vendor_stock_connectors shape (just push instead of
 * pull). Each row defines how to deliver a finalized order to one vendor's
 * external system (Fishbowl, NetSuite, SAP, QuickBooks, Acumatica, …).
 *
 * connector_type:
 *   HTTP_POST    — generic authenticated POST to endpoint_url
 *   WEBHOOK_POST — same plus HMAC-SHA256 signature in X-Curavend-Signature
 *   EDI_850      — STUBBED (TODO: future iteration)
 *   MANUAL       — no-op trigger; vendor admin downloads CSV from the UI
 *
 * config (JSON): { fieldMap, headers? } — controls the order → ERP transform.
 */
export const vendorErpConnectors = sqliteTable(
  "vendor_erp_connectors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    connectorType: text("connector_type").notNull(),
    endpointUrl: text("endpoint_url"),
    authSecretRef: text("auth_secret_ref"),
    triggerEvent: text("trigger_event").notNull().default("VENDOR_CONFIRMED_RECEIPT"),
    config: text("config"), // JSON: { fieldMap: {..}, headers: {..} }
    isActive: integer("is_active").notNull().default(1),
    lastPushedAt: text("last_pushed_at"),
    lastSuccessAt: text("last_success_at"),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vendor_erp_connectors_vendor_idx").on(table.vendorId),
    index("vendor_erp_connectors_active_idx").on(table.isActive),
  ],
);

export const vendorErpConnectorsRelations = relations(
  vendorErpConnectors,
  ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorErpConnectors.vendorId],
      references: [vendors.id],
    }),
  }),
);

/**
 * vendor_erp_push_log — audit/debugging trail per push attempt.
 *
 * Retains last 30 days; older rows pruned by a future cron.
 * request_body and response_body truncated to 4 KB to keep rows compact.
 */
export const vendorErpPushLog = sqliteTable(
  "vendor_erp_push_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectorId: text("connector_id").notNull(),
    orderId: text("order_id").notNull(),
    status: text("status").notNull(), // 'OK' | 'FAILED' | 'RETRYING'
    attempt: integer("attempt").notNull().default(1),
    httpStatus: integer("http_status"),
    durationMs: integer("duration_ms"),
    errorSummary: text("error_summary"),
    requestBody: text("request_body"),
    responseBody: text("response_body"),
    pushedAt: text("pushed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vendor_erp_push_log_order_idx").on(table.orderId),
    index("vendor_erp_push_log_connector_idx").on(table.connectorId),
    index("vendor_erp_push_log_pushed_idx").on(table.pushedAt),
  ],
);

export type VendorErpConnector = typeof vendorErpConnectors.$inferSelect;
export type NewVendorErpConnector = typeof vendorErpConnectors.$inferInsert;
export type VendorErpPushLog = typeof vendorErpPushLog.$inferSelect;
export type NewVendorErpPushLog = typeof vendorErpPushLog.$inferInsert;

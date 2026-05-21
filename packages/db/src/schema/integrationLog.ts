import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Outbound HTTP integration audit + retry tracking. Every call to a third-party
// (Stripe, Resend, future Fishbowl/NetSuite, Avalara, carrier webhooks…) is
// wrapped via `integrationLog.wrap()` and produces a row here.
export const integrationLog = sqliteTable(
  "integration_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectorType: text("connector_type").notNull(), // STRIPE | RESEND | FISHBOWL | NETSUITE | EPIC | TAXJAR | AVALARA | CARRIER | OTHER
    connectorId: text("connector_id"), // FK to vendor_erp_connectors when applicable
    entityType: text("entity_type").notNull(), // ORDER | INVOICE | TAX_CALC | EMAIL | …
    entityId: text("entity_id").notNull(),
    direction: text("direction").notNull(), // OUTBOUND | INBOUND

    httpMethod: text("http_method"),
    url: text("url"),
    requestPayload: text("request_payload"), // JSON, capped client-side
    responseStatus: integer("response_status"),
    responseBody: text("response_body"), // capped

    status: text("status").notNull(), // PENDING | SUCCESS | RETRYING | DEAD_LETTER | TERMINAL_FAILURE
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: text("next_retry_at"),
    lastErrorMessage: text("last_error_message"),

    idempotencyKey: text("idempotency_key"),
    triggeredByUserId: text("triggered_by_user_id"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("integration_log_idempotency_uk").on(table.idempotencyKey),
    index("integration_log_status_retry_idx").on(table.status, table.nextRetryAt),
    index("integration_log_entity_idx").on(table.entityType, table.entityId),
    index("integration_log_connector_idx").on(table.connectorId),
  ]
);

export const INTEGRATION_STATUSES = [
  "PENDING",
  "SUCCESS",
  "RETRYING",
  "DEAD_LETTER",
  "TERMINAL_FAILURE",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_CONNECTOR_TYPES = [
  "STRIPE",
  "RESEND",
  "FISHBOWL",
  "NETSUITE",
  "EPIC",
  "TAXJAR",
  "AVALARA",
  "CARRIER",
  "OTHER",
] as const;
export type IntegrationConnectorType = (typeof INTEGRATION_CONNECTOR_TYPES)[number];

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Audit log of every inbound callback from a third-party fulfillment vendor.
 * Even unsigned / bad-signature attempts get logged for forensics.
 */
export const EXTERNAL_FULFILLMENT_CALLBACK_TYPES = [
  "STATUS_UPDATE",
  "QC_FAILURE",
] as const;
export type ExternalFulfillmentCallbackType =
  (typeof EXTERNAL_FULFILLMENT_CALLBACK_TYPES)[number];

export const externalFulfillmentCallbacks = sqliteTable(
  "external_fulfillment_callbacks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorName: text("vendor_name").notNull(),
    callbackType: text("callback_type").notNull(),
    orderReference: text("order_reference"),
    relatedLabOrderId: text("related_lab_order_id"),
    payloadHash: text("payload_hash").notNull(),
    rawPayload: text("raw_payload"),
    signatureValid: integer("signature_valid").notNull().default(0),
    applied: integer("applied").notNull().default(0),
    applyError: text("apply_error"),
    ipAddress: text("ip_address"),
    receivedAt: text("received_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ext_fulfillment_order_ref_idx").on(table.orderReference),
    index("ext_fulfillment_lab_order_idx").on(table.relatedLabOrderId),
    index("ext_fulfillment_hash_idx").on(table.payloadHash),
  ],
);

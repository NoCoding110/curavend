import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";

// Shipment record for an order. 1:N — an order may ship in multiple parcels
// (partial shipments, drop-ships from multiple warehouses). Each shipment
// carries its own carrier + tracking + delivery metadata.
export const orderShipments = sqliteTable(
  "order_shipments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull(),
    shipmentSequence: integer("shipment_sequence").notNull().default(1),

    carrierCode: text("carrier_code"), // USPS | UPS | FEDEX | DHL | ONTRAC | OTHER | NONE
    carrierServiceLevel: text("carrier_service_level"), // GROUND | OVERNIGHT | TWO_DAY …
    trackingNumber: text("tracking_number"),

    shipmentDate: text("shipment_date"),
    expectedDeliveryDate: text("expected_delivery_date"),
    actualDeliveryDate: text("actual_delivery_date"),

    signatureRequired: integer("signature_required").default(0),
    insuredValueCents: integer("insured_value_cents"),
    hazmatFlag: integer("hazmat_flag").default(0),
    weightGrams: integer("weight_grams"),
    dimensionsCm: text("dimensions_cm"), // JSON

    shipFromAddress: text("ship_from_address"), // JSON
    shipToAddress: text("ship_to_address"), // JSON

    // Latest known carrier event (populated by carrier webhooks — future)
    latestStatus: text("latest_status"), // IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | EXCEPTION | RETURNED
    latestStatusAt: text("latest_status_at"),
    latestStatusLocation: text("latest_status_location"),

    podAttachment: text("pod_attachment"), // proof-of-delivery file URL
    podSignedBy: text("pod_signed_by"),
    podSignedAt: text("pod_signed_at"),

    // Cold-chain monitoring (Procurement v2 gap K).
    coldChainRequired: integer("cold_chain_required").notNull().default(0),
    coldChainSpecMinC: real("cold_chain_spec_min_c"),
    coldChainSpecMaxC: real("cold_chain_spec_max_c"),
    etaAt: text("eta_at"),
    lastTempC: real("last_temp_c"),
    lastTempAt: text("last_temp_at"),
    hadExcursion: integer("had_excursion").notNull().default(0),

    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_shipments_order_idx").on(table.orderId),
    index("order_shipments_tracking_idx").on(table.trackingNumber),
    index("order_shipments_carrier_idx").on(table.carrierCode),
    index("order_shipments_eta_idx").on(table.etaAt),
  ]
);

export const orderShipmentsRelations = relations(orderShipments, ({ one }) => ({
  order: one(orders, {
    fields: [orderShipments.orderId],
    references: [orders.id],
  }),
}));

export const CARRIER_CODES = ["USPS", "UPS", "FEDEX", "DHL", "ONTRAC", "OTHER", "NONE"] as const;
export type CarrierCode = (typeof CARRIER_CODES)[number];

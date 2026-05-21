import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { hospitals } from "./hospitals";
import { vendors } from "./vendors";
import { providers } from "./providers";
import { superVendors } from "./superVendors";
import { orders } from "./orders";
import { invoiceItems } from "./invoiceItems";

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: text("date"),
    dueDate: text("due_date"),
    total: real("total"),
    attachment: text("attachment"),
    number: text("number").notNull(),
    status: text("status").notNull().default("ORDER_COMPLETED"), // ORDER_COMPLETED | SPEND_CONFIRMED | INVOICE_GENERATED | INVOICE_SENT | INVOICE_PAID
    hospitalId: text("hospital_id").notNull(),
    vendorId: text("vendor_id").notNull(),
    providerId: text("provider_id"),
    superVendorId: text("super_vendor_id"),
    orderId: text("order_id"),
    reasonForNoInvoice: text("reason_for_no_invoice"),
    paymentPayeeName: text("payment_payee_name"),
    paymentAmountDue: text("payment_amount_due"),
    paymentAmountPaid: text("payment_amount_paid"),
    paymentDate: text("payment_date"),
    paymentReference: text("payment_reference"),

    // ── Tax-aware totals (cents) ─────────────────────────────────
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxTotalCents: integer("tax_total_cents").notNull().default(0),
    discountTotalCents: integer("discount_total_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    grandTotalCents: integer("grand_total_cents").notNull().default(0),

    // ── Currency ─────────────────────────────────────────────────
    currencyCode: text("currency_code").notNull().default("USD"),
    fxRate: real("fx_rate"),

    // ── Tax engine audit ─────────────────────────────────────────
    taxEngineCalculatedAt: text("tax_engine_calculated_at"),
    taxEngineProvider: text("tax_engine_provider"), // INTERNAL | AVALARA | TAXJAR | VERTEX
    taxEngineCalculationId: text("tax_engine_calculation_id"),

    // ── Stripe linkage ───────────────────────────────────────────
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("invoices_hospital_id_idx").on(table.hospitalId),
    index("invoices_vendor_id_idx").on(table.vendorId),
    index("invoices_provider_id_idx").on(table.providerId),
    index("invoices_super_vendor_id_idx").on(table.superVendorId),
    index("invoices_order_id_idx").on(table.orderId),
    index("invoices_vendor_date_created_idx").on(
      table.vendorId,
      table.date,
      table.createdAt
    ),
    index("invoices_hospital_date_created_idx").on(
      table.hospitalId,
      table.date,
      table.createdAt
    ),
  ]
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  hospital: one(hospitals, {
    fields: [invoices.hospitalId],
    references: [hospitals.id],
  }),
  vendor: one(vendors, {
    fields: [invoices.vendorId],
    references: [vendors.id],
  }),
  provider: one(providers, {
    fields: [invoices.providerId],
    references: [providers.id],
  }),
  superVendor: one(superVendors, {
    fields: [invoices.superVendorId],
    references: [superVendors.id],
  }),
  order: one(orders, {
    fields: [invoices.orderId],
    references: [orders.id],
  }),
  items: many(invoiceItems),
}));

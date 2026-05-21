import { sqliteTable, text, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { hospitals } from "./hospitals";
import { users } from "./users";

// Buyer-side purchase orders. Hospitals raise a PO with a fixed authorized
// spend; multiple Curavend orders can be billed against the same PO until
// `spentAmount` reaches `authorizedAmount` or `expiresAt` passes.
export const customerPurchaseOrders = sqliteTable(
  "customer_purchase_orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text("hospital_id").notNull(),
    poNumber: text("po_number").notNull(),
    poDate: text("po_date").notNull(),
    authorizedAmount: real("authorized_amount"),
    spentAmount: real("spent_amount").notNull().default(0),
    expiresAt: text("expires_at"),
    notes: text("notes"),
    status: text("status").notNull().default("OPEN"), // OPEN | EXHAUSTED | EXPIRED | CANCELLED
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("customer_po_hospital_po_uk").on(table.hospitalId, table.poNumber),
    index("customer_po_hospital_idx").on(table.hospitalId),
    index("customer_po_status_idx").on(table.status),
  ]
);

export const customerPurchaseOrdersRelations = relations(customerPurchaseOrders, ({ one }) => ({
  hospital: one(hospitals, {
    fields: [customerPurchaseOrders.hospitalId],
    references: [hospitals.id],
  }),
  createdBy: one(users, {
    fields: [customerPurchaseOrders.createdByUserId],
    references: [users.id],
  }),
}));

export const CUSTOMER_PO_STATUSES = ["OPEN", "EXHAUSTED", "EXPIRED", "CANCELLED"] as const;
export type CustomerPoStatus = (typeof CUSTOMER_PO_STATUSES)[number];

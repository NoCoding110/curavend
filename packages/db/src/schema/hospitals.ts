import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { providers } from "./providers";
import { users } from "./users";

export const hospitals = sqliteTable(
  "hospitals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").unique(),
    userId: integer("user_id"),
    name: text("name"),
    contact: text("contact"),
    contactPerson: text("contact_person"),
    contactPersonTitle: text("contact_person_title"),
    streetAddress: text("street_address"),
    state: text("state"),
    city: text("city"),
    zip: text("zip"),
    providerId: text("provider_id"),
    subscriptionPlanId: text("subscription_plan_id"),
    fhirBaseURL: text("fhir_base_url"),
    scope: text("scope"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenType: text("token_type"),
    expiresIn: integer("expires_in"),
    lastRefreshedAt: text("last_refreshed_at"),
    modifiedOrders: integer("modified_orders").default(0),
    inProcessOrders: integer("in_process_orders").default(0),
    cancelledOrders: integer("cancelled_orders").default(0),
    completedOrders: integer("completed_orders").default(0),
    unreadOrderCount: integer("unread_order_count").default(0),
    notificationSettings: text("notification_settings"), // JSON

    // ── Procurement (Phase B) ─────────────────────────────────
    orderNumberPrefix: text("order_number_prefix"), // e.g. 'BGH' — falls back to 'ORD' if unset

    // ── Tax (Phase E) ─────────────────────────────────────────
    defaultTaxJurisdictionCode: text("default_tax_jurisdiction_code"),
    taxExempt: integer("tax_exempt").default(0),
    taxExemptCertificateUrl: text("tax_exempt_certificate_url"),

    // ── Currency (Phase F) ────────────────────────────────────
    preferredCurrencyCode: text("preferred_currency_code").notNull().default("USD"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("hospitals_email_idx").on(table.email),
    index("hospitals_provider_id_idx").on(table.providerId),
  ]
);

export const hospitalsRelations = relations(hospitals, ({ one, many }) => ({
  provider: one(providers, {
    fields: [hospitals.providerId],
    references: [providers.id],
  }),
  users: many(users),
}));

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { superVendors } from "./superVendors";
import { users } from "./users";

export const vendors = sqliteTable(
  "vendors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").unique(),
    vendorUserId: integer("vendor_user_id"),
    ein: text("ein"),
    name: text("name"),
    contact: text("contact"),
    contactPerson: text("contact_person"),
    contactPersonMiddleName: text("contact_person_middle_name"),
    contactPersonLastName: text("contact_person_last_name"),
    contactPersonTitle: text("contact_person_title"),
    streetAddress: text("street_address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    website: text("website"),
    taxId: text("tax_id"),
    billingEmail: text("billing_email"),
    billingName: text("billing_name"),
    billingContact: text("billing_contact"),
    billingStreetAddress: text("billing_street_address"),
    billingCity: text("billing_city"),
    billingState: text("billing_state"),
    billingZip: text("billing_zip"),
    mailingStreetAddress: text("mailing_street_address"),
    mailingCity: text("mailing_city"),
    mailingState: text("mailing_state"),
    mailingZip: text("mailing_zip"),
    logo: text("logo"),
    accreditingBody: text("accrediting_body"),
    accreditationExpiryDate: text("accreditation_expiry_date"),
    stateLevelLicense: text("state_level_license"),
    stateLevelLicenseNumber: text("state_level_license_number"),
    stateLevelLicenseExpiryDate: text("state_level_license_expiry_date"),
    liabilityInsuranceProvider: text("liability_insurance_provider"),
    liabilityInsurancePolicyNumber: text("liability_insurance_policy_number"),
    liabilityInsuranceExpiryDate: text("liability_insurance_expiry_date"),
    blanketPurchaseOrderNumber: text("blanket_purchase_order_number"),
    erpAccountNumber: text("erp_account_number"),
    superVendorId: text("super_vendor_id"),
    subscriptionPlanId: text("subscription_plan_id"),
    track: text("track"), // JSON array
    modifiedOrders: integer("modified_orders").default(0),
    inProcessOrders: integer("in_process_orders").default(0),
    cancelledOrders: integer("cancelled_orders").default(0),
    completedOrders: integer("completed_orders").default(0),
    unreadOrderCount: integer("unread_order_count").default(0),
    notificationSettings: text("notification_settings"), // JSON

    // PO transmission preference (gap 4). Default EMAIL; admin can set to
    // EDI / API / PUNCHOUT / PORTAL. `poTransmissionEndpoint` is the target
    // (email addr, partner ID, API URL); credentials are JSON-encoded.
    preferredPoTransmissionMethod: text("preferred_po_transmission_method").default("EMAIL"),
    poTransmissionEndpoint: text("po_transmission_endpoint"),
    poTransmissionCredentials: text("po_transmission_credentials"),

    // ── Shipping defaults (Phase D) ───────────────────────────
    defaultShipFromAddress: text("default_ship_from_address"), // JSON: {line1, line2, city, state, zip, country}
    defaultCarrierCode: text("default_carrier_code"),
    trackingUrlTemplate: text("tracking_url_template"), // {tracking} placeholder

    // ── DMEPOS supplier compliance lives in `vendor_dmepos_compliance`
    //    sidecar table (per-vendor 1:1) plus `vendor_compliance_docs` for files ──

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vendors_email_idx").on(table.email),
    index("vendors_super_vendor_id_idx").on(table.superVendorId),
  ]
);

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  superVendor: one(superVendors, {
    fields: [vendors.superVendorId],
    references: [superVendors.id],
  }),
  users: many(users),
}));

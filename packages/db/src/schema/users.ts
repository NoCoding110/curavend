import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { providers } from "./providers";
import { hospitals } from "./hospitals";
import { vendors } from "./vendors";
import { superVendors } from "./superVendors";

export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    title: text("title"),
    contact: text("contact"),
    streetAddress: text("street_address"),
    state: text("state"),
    city: text("city"),
    zip: text("zip"),
    userType: text("user_type").notNull(), // ADMIN | HOSPITAL | VENDOR | PROVIDER | SUPER_VENDOR | LAB
    role: text("role").notNull(), // ACCOUNT_MANAGER | FACILITY_ACCOUNT_MANAGER | FACILITY_USER | VENDOR_ACCOUNT_MANAGER | VENDOR_USER | PROVIDER_EXECUTIVE_ADMIN | PROVIDER_USER | ACCOUNT_MANAGER_USER | SUPER_VENDOR | LAB_ADMIN | LAB_USER
    userStatus: text("user_status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE
    accountManagerId: text("account_manager_id"),
    step: text("step").notNull().default("ACCOUNT_CREATED"), // ACCOUNT_CREATED | WELCOME_EMAIL
    oigStatus: text("oig_status"), // CLEARED | EXCLUDED
    approvalStatus: text("approval_status").default("PENDING"), // APPROVED | PENDING | REJECTED
    hasAgreedToPHIAccess: integer("has_agreed_to_phi_access").default(0),
    mustChangePassword: integer("must_change_password").default(1),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: integer("mfa_enabled").default(0),
    emailOtpMfaEnabled: integer("email_otp_mfa_enabled").default(0),
    providerId: text("provider_id"),
    hospitalId: text("hospital_id"),
    vendorId: text("vendor_id"),
    superVendorId: text("super_vendor_id"),
    labGroupId: text("lab_group_id"),
    subscriptionPlanId: text("subscription_plan_id"),
    currentLoggedInAt: text("current_logged_in_at"),
    lastLoggedInAt: text("last_logged_in_at"),
    timedOut: integer("timed_out").default(0),
    lastFunctionAccessed: text("last_function_accessed"),
    failedLoginAttempts: integer("failed_login_attempts").default(0),
    lockedUntil: text("locked_until"),
    npiNumber: text("npi_number"),
    specialty: text("specialty"),
    licenseNumber: text("license_number"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_account_manager_id_idx").on(table.accountManagerId),
    index("users_provider_id_idx").on(table.providerId),
    index("users_hospital_id_idx").on(table.hospitalId),
    index("users_vendor_id_idx").on(table.vendorId),
    index("users_super_vendor_id_idx").on(table.superVendorId),
  ]
);

export const usersRelations = relations(users, ({ one }) => ({
  accountManager: one(users, {
    fields: [users.accountManagerId],
    references: [users.id],
    relationName: "accountManager",
  }),
  provider: one(providers, {
    fields: [users.providerId],
    references: [providers.id],
  }),
  hospital: one(hospitals, {
    fields: [users.hospitalId],
    references: [hospitals.id],
  }),
  vendor: one(vendors, {
    fields: [users.vendorId],
    references: [vendors.id],
  }),
  superVendor: one(superVendors, {
    fields: [users.superVendorId],
    references: [superVendors.id],
  }),
}));

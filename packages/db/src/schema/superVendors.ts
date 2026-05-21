import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";
import { users } from "./users";

export const superVendors = sqliteTable("super_vendors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  ein: text("ein"),
  physicalStreetAddress: text("physical_street_address"),
  physicalCity: text("physical_city"),
  physicalState: text("physical_state"),
  physicalZip: text("physical_zip"),
  mailingStreetAddress: text("mailing_street_address"),
  mailingCity: text("mailing_city"),
  mailingState: text("mailing_state"),
  mailingZip: text("mailing_zip"),
  billingStreetAddress: text("billing_street_address"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingZip: text("billing_zip"),
  primaryAccountName: text("primary_account_name"),
  primaryAccountEmail: text("primary_account_email"),
  primaryAccountContact: text("primary_account_contact"),
  primaryAccountTitle: text("primary_account_title"),
  accountsPayable: text("accounts_payable"),
  supplyChain: text("supply_chain"),
  otherContact: text("other_contact"),
  otherContacts: text("other_contacts"), // JSON
  subscriptionPlanId: text("subscription_plan_id"),
  billingCycle: text("billing_cycle"),
  notificationSettings: text("notification_settings"), // JSON
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const superVendorsRelations = relations(superVendors, ({ many }) => ({
  vendors: many(vendors),
  users: many(users),
}));

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";

// Plans
export const plans = sqliteTable("plans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  price: text("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  stripePriceId: text("stripe_price_id"),
  description: text("description"), // JSON array
  addOn: integer("add_on").default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const plansRelations = relations(plans, ({ many }) => ({
  planFeatures: many(planFeatures),
  subscriptions: many(subscriptions),
}));

// Features
export const features = sqliteTable("features", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  restrictedToRoles: text("restricted_to_roles"), // JSON array
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const featuresRelations = relations(features, ({ many }) => ({
  planFeatures: many(planFeatures),
}));

// Plan Features (join table)
export const planFeatures = sqliteTable(
  "plan_features",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text("plan_id").notNull(),
    featureId: text("feature_id").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("plan_features_plan_id_idx").on(table.planId),
    index("plan_features_feature_id_idx").on(table.featureId),
    index("plan_features_plan_feature_idx").on(table.planId, table.featureId),
  ]
);

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(plans, {
    fields: [planFeatures.planId],
    references: [plans.id],
  }),
  feature: one(features, {
    fields: [planFeatures.featureId],
    references: [features.id],
  }),
}));

// Subscriptions
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    planId: text("plan_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    priceId: text("price_id"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE | CANCELED | PAST_DUE
    addOns: text("add_ons"), // JSON array of plan IDs
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_plan_id_idx").on(table.planId),
  ]
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

// Payment History
export const paymentHistory = sqliteTable(
  "payment_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    stripePaymentId: text("stripe_payment_id"),
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull(), // SUCCEEDED | FAILED | PENDING
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("payment_history_user_id_idx").on(table.userId)]
);

export const paymentHistoryRelations = relations(
  paymentHistory,
  ({ one }) => ({
    user: one(users, {
      fields: [paymentHistory.userId],
      references: [users.id],
    }),
  })
);

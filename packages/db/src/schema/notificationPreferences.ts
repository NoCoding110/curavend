import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Per-tenant + per-event notification routing config. A single (scope, event)
// can fan out to multiple recipients via multiple rows.
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scopeType: text("scope_type").notNull(), // HOSPITAL | VENDOR | PROVIDER | USER
    scopeId: text("scope_id").notNull(),
    eventType: text("event_type").notNull(), // ORDER_CONFIRMATION | ORDER_SHIPPED | ORDER_DELIVERED | INVOICE_PAID | …
    channel: text("channel").notNull(), // EMAIL | SMS | IN_APP | WEBHOOK
    recipientType: text("recipient_type").notNull(), // PATIENT | CONTACT | ORDERER | CLINICIAN | PROCUREMENT_TEAM | CUSTOM
    customEmail: text("custom_email"),
    customPhone: text("custom_phone"),
    customWebhookUrl: text("custom_webhook_url"),
    // When recipientType='GROUP', this points at a user_groups row whose members receive the notification.
    recipientGroupId: text("recipient_group_id"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("notif_pref_scope_event_channel_recipient_uk").on(
      table.scopeType,
      table.scopeId,
      table.eventType,
      table.channel,
      table.recipientType
    ),
    index("notif_pref_scope_event_active_idx").on(
      table.scopeType,
      table.scopeId,
      table.eventType,
      table.isActive
    ),
  ]
);

export const NOTIFICATION_EVENT_TYPES = [
  "ORDER_CONFIRMATION",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
  "INVOICE_SENT",
  "INVOICE_PAID",
  "INVOICE_OVERDUE",
  "CONTRACT_SUBMITTED",
  "CONTRACT_APPROVED",
  "CONTRACT_REJECTED",
  "RECURRING_ORDER_UPCOMING",
  "RECURRING_ORDER_PAUSED",
  // SLA breach events (cron-driven, fan out to procurement team / lab admins)
  "ORDER_AWAITING_APPROVAL_SLA",
  "ORDER_FULFILLMENT_STALLED_SLA",
  "ORDER_NO_SHIPMENT_SLA",
  "LAB_ORDER_WORKFLOW_FAILED",
  "LAB_ORDER_APPROVAL_OVERDUE",
  "LAB_ORDER_QC_FAILED",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "IN_APP", "WEBHOOK"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_RECIPIENT_TYPES = [
  "PATIENT",
  "CONTACT",
  "ORDERER",
  "CLINICIAN",
  "PROCUREMENT_TEAM",
  "CUSTOM",
  "GROUP", // routes to all members of `recipient_group_id` (user_groups row)
] as const;
export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number];

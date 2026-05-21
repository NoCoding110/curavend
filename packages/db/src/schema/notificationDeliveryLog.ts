import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Audit log for every outbound notification delivery attempt. Powers
// Resend bounce/complaint webhook handling and per-recipient delivery
// status tracking.
export const notificationDeliveryLog = sqliteTable(
  "notification_delivery_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notificationId: text("notification_id"), // FK to notifications when in-app pair exists
    eventType: text("event_type").notNull(),
    channel: text("channel").notNull(), // EMAIL | SMS | IN_APP | WEBHOOK
    recipientType: text("recipient_type"),
    recipientAddress: text("recipient_address").notNull(),
    recipientUserId: text("recipient_user_id"),
    externalMessageId: text("external_message_id"),

    deliveryStatus: text("delivery_status").notNull(), // SENT | DELIVERED | BOUNCED | COMPLAINED | FAILED | UNSUBSCRIBED | OPENED | CLICKED
    statusReason: text("status_reason"),

    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),

    sentAt: text("sent_at"),
    deliveredAt: text("delivered_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("notif_delivery_recipient_status_idx").on(table.recipientAddress, table.deliveryStatus),
    index("notif_delivery_related_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
    index("notif_delivery_external_msg_idx").on(table.externalMessageId),
  ]
);

export const DELIVERY_STATUSES = [
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
  "UNSUBSCRIBED",
  "OPENED",
  "CLICKED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

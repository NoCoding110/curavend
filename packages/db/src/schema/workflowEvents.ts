import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * External events raised against a workflow instance (e.g. human-approval
 * signals). Step handlers can return `{ waitForEvent: <name> }` and the
 * workflow pauses in WAITING_FOR_EVENT status until a matching row arrives
 * via `POST /api/workflows/:id/events`, at which point it's consumed
 * (consumed_at timestamp set) and the workflow resumes.
 */
export const workflowEvents = sqliteTable(
  "workflow_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    eventName: text("event_name").notNull(),
    payload: text("payload"), // JSON
    raisedByUserId: text("raised_by_user_id"),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("workflow_events_instance_idx").on(table.workflowInstanceId),
    index("workflow_events_name_unconsumed_idx").on(
      table.workflowInstanceId,
      table.eventName,
      table.consumedAt,
    ),
  ],
);

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const workflowActivityLog = sqliteTable(
  "workflow_activity_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    activityName: text("activity_name").notNull(),
    status: text("status").notNull(), // STARTED | COMPLETED | FAILED
    input: text("input"), // JSON
    output: text("output"), // JSON
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("workflow_activity_log_instance_idx").on(table.workflowInstanceId),
    index("workflow_activity_log_activity_idx").on(table.activityName),
    index("workflow_activity_log_status_idx").on(table.status),
  ]
);

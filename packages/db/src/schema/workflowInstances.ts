import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const WORKFLOW_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TERMINATED",
  "WAITING_FOR_EVENT",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const workflowInstances = sqliteTable(
  "workflow_instances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workflowType: text("workflow_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    status: text("status").notNull().default("PENDING"),
    currentStep: text("current_step"),
    stepIndex: integer("step_index").notNull().default(0),
    totalSteps: integer("total_steps"),
    context: text("context"), // JSON
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    // Control plane (orchestrator parity)
    customStatus: text("custom_status"), // JSON, user-defined progress
    terminatedBy: text("terminated_by"), // user id
    terminatedAt: text("terminated_at"),
    terminateReason: text("terminate_reason"),
    waitingForEvent: text("waiting_for_event"), // event name
    eventWaitExpiresAt: text("event_wait_expires_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("workflow_instances_type_idx").on(table.workflowType),
    index("workflow_instances_entity_idx").on(table.entityType, table.entityId),
    index("workflow_instances_status_idx").on(table.status),
    index("workflow_instances_created_at_idx").on(table.createdAt),
  ]
);

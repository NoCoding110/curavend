import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Approval routing rules — declarative engine for routing requisitions
 * (and any other approval-bearing object) to the right approvers.
 *
 * Each rule is a `(triggerType, conditions) -> approvers` mapping evaluated
 * in priority order. The first matching rule wins; if no rule matches, the
 * requisition falls back to the hospital's default approver chain (typically
 * the requester's direct manager or a config-level fallback userId).
 *
 * Conditions JSON shape (evaluated against the object being routed):
 *   {
 *     "amountGteUsd": 5000,
 *     "amountLtUsd": 50000,
 *     "facilityId": "...",
 *     "departmentId": "...",
 *     "priority": ["HIGH", "URGENT"],
 *     "containsOffFormulary": true,
 *     "containsRestricted": true,
 *     "containsPriorAuth": true,
 *     "categoryAny": ["DME", "Wound Care"]
 *   }
 * All fields are AND'd. Missing fields are skipped.
 *
 * Approvers JSON shape:
 *   {
 *     "type": "USER",     // or "GROUP" or "ROLE"
 *     "id": "user-uuid",  // userId, groupId, or role string
 *     "requireAll": false // for GROUP: any group member can approve vs all members
 *   }
 */
export const APPROVAL_RULE_TRIGGERS = ['REQUISITION', 'ORDER', 'INVOICE', 'CONTRACT'] as const;
export type ApprovalRuleTrigger = (typeof APPROVAL_RULE_TRIGGERS)[number];

export const approvalRules = sqliteTable(
  'approval_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    triggerType: text('trigger_type').notNull(),
    priority: integer('priority').notNull().default(100), // lower = evaluated first
    isActive: integer('is_active').notNull().default(1),
    conditionsJson: text('conditions_json').notNull(), // serialized conditions object
    approverJson: text('approver_json').notNull(),     // serialized approver descriptor
    // If true, this rule terminates evaluation. If false, the engine keeps looking for more rules
    // (useful for chained sign-offs: e.g. department head + medical director).
    isTerminal: integer('is_terminal').notNull().default(1),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('approval_rules_hospital_idx').on(t.hospitalId),
    index('approval_rules_trigger_idx').on(t.triggerType),
    index('approval_rules_priority_idx').on(t.priority),
  ],
);

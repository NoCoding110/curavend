/**
 * Approval rule engine.
 *
 * Evaluates `approval_rules` rows against an object (a requisition, today;
 * orders / invoices / contracts tomorrow) and returns the matching approver
 * descriptor — userId, groupId, or role.
 *
 * Rules are stored as `(triggerType, priority, conditionsJson, approverJson)`.
 * For a given object, the engine pulls all active rules of the matching trigger,
 * sorts by priority asc, and walks them. The first rule whose conditions all
 * match wins (unless `isTerminal=0`, in which case evaluation continues to
 * append more approvers for multi-step sign-off).
 *
 * Conditions JSON shape:
 *   {
 *     "amountGteUsd"?: number,
 *     "amountLtUsd"?: number,
 *     "facilityId"?: string,
 *     "departmentId"?: string,
 *     "priority"?: string[],
 *     "containsOffFormulary"?: boolean,
 *     "containsRestricted"?: boolean,
 *     "containsPriorAuth"?: boolean,
 *     "categoryAny"?: string[],
 *   }
 *
 * Approver descriptor:
 *   { type: 'USER' | 'GROUP' | 'ROLE', id: string, requireAll?: boolean }
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { approvalRules, type ApprovalRuleTrigger } from '@curavend/db';
import type { D1Database } from '@cloudflare/workers-types';

export interface ApprovalConditions {
  amountGteUsd?: number;
  amountLtUsd?: number;
  facilityId?: string;
  departmentId?: string;
  priority?: string[];
  containsOffFormulary?: boolean;
  containsRestricted?: boolean;
  containsPriorAuth?: boolean;
  categoryAny?: string[];
}

export interface ApproverDescriptor {
  type: 'USER' | 'GROUP' | 'ROLE';
  id: string;
  requireAll?: boolean;
}

export interface RoutableObject {
  hospitalId: string;
  facilityId?: string | null;
  departmentId?: string | null;
  amountUsd?: number | null;
  priority?: string | null;
  containsOffFormulary?: boolean;
  containsRestricted?: boolean;
  containsPriorAuth?: boolean;
  categories?: string[];
}

function evaluate(cond: ApprovalConditions, obj: RoutableObject): boolean {
  if (cond.amountGteUsd != null && (obj.amountUsd ?? 0) < cond.amountGteUsd) return false;
  if (cond.amountLtUsd != null && (obj.amountUsd ?? 0) >= cond.amountLtUsd) return false;
  if (cond.facilityId && obj.facilityId !== cond.facilityId) return false;
  if (cond.departmentId && obj.departmentId !== cond.departmentId) return false;
  if (cond.priority && cond.priority.length > 0 && !cond.priority.includes(obj.priority ?? '')) return false;
  if (cond.containsOffFormulary === true && !obj.containsOffFormulary) return false;
  if (cond.containsRestricted === true && !obj.containsRestricted) return false;
  if (cond.containsPriorAuth === true && !obj.containsPriorAuth) return false;
  if (cond.categoryAny && cond.categoryAny.length > 0) {
    if (!obj.categories || !cond.categoryAny.some((c) => obj.categories!.includes(c))) return false;
  }
  return true;
}

/**
 * Resolve approver chain for an object.
 * Returns array (may be empty) of ApproverDescriptors in evaluation order.
 * Caller decides whether to ask all of them (parallel) or in sequence.
 */
export async function resolveApprovers(
  d1: D1Database,
  trigger: ApprovalRuleTrigger,
  obj: RoutableObject,
): Promise<ApproverDescriptor[]> {
  const db = getDb(d1);
  const rules = await db
    .select()
    .from(approvalRules)
    .where(
      and(
        eq(approvalRules.hospitalId, obj.hospitalId),
        eq(approvalRules.triggerType, trigger),
        eq(approvalRules.isActive, 1),
      ),
    )
    .orderBy(approvalRules.priority);

  const approvers: ApproverDescriptor[] = [];
  for (const rule of rules) {
    let cond: ApprovalConditions;
    let approver: ApproverDescriptor;
    try {
      cond = JSON.parse(rule.conditionsJson);
      approver = JSON.parse(rule.approverJson);
    } catch {
      continue;
    }
    if (!evaluate(cond, obj)) continue;
    approvers.push(approver);
    if (rule.isTerminal) break;
  }
  return approvers;
}

/**
 * Convenience: pick a single primary approver (first match) or null.
 * Used by the requisition submit flow to set `approverUserId`.
 */
export async function pickPrimaryApprover(
  d1: D1Database,
  trigger: ApprovalRuleTrigger,
  obj: RoutableObject,
): Promise<ApproverDescriptor | null> {
  const list = await resolveApprovers(d1, trigger, obj);
  return list[0] ?? null;
}

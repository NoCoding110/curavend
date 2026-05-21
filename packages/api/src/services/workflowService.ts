/**
 * workflowService — queue + D1 backed step-by-step workflow orchestrator.
 *
 * Inspired by Azure Durable Functions but implemented as a state machine in
 * `workflow_instances` driven by `workflow.step` queue messages.
 *
 * Public API:
 *   startWorkflow(env, type, entityId, context) → instanceId
 *   runStep(env, instanceId) — called by queue consumer
 *
 * Workflow definitions are objects with a list of named steps. Each step is
 * an async function that returns either a `next` payload (carries forward to
 * next step) or throws (marks workflow FAILED).
 */
import { eq, and, isNull, lt } from 'drizzle-orm';
import { workflowInstances, workflowActivityLog, workflowEvents } from '@curavend/db';
import { getDb } from '../lib/db';
import type { Env } from '../lib/env';
import { labOrderAssetGenWorkflow } from '../workflows/labOrderAssetGen';

/**
 * Sentinel return value from a step handler: pause the workflow until
 * an external event with the given name arrives. If `timeoutMinutes` is
 * set and no event arrives in time, the workflow is auto-failed.
 */
export interface WaitForEventDirective {
  waitForEvent: string;
  timeoutMinutes?: number;
}

function isWaitForEvent(o: unknown): o is WaitForEventDirective {
  return !!o && typeof o === 'object' && typeof (o as any).waitForEvent === 'string';
}

export interface WorkflowStep<C = any, O = any> {
  name: string;
  execute: (env: Env, context: C) => Promise<O | WaitForEventDirective>;
}

export interface WorkflowDefinition<C = any> {
  type: string;
  steps: WorkflowStep<C, Partial<C>>[];
}

export const REGISTRY: Record<string, WorkflowDefinition> = {
  LAB_ORDER_ASSET_GEN: labOrderAssetGenWorkflow,
};

export function listWorkflowTypes(): string[] {
  return Object.keys(REGISTRY);
}

export async function startWorkflow(
  env: Env,
  type: string,
  entityType: string,
  entityId: string,
  context: Record<string, unknown> = {},
): Promise<{ instanceId: string }> {
  const def = REGISTRY[type];
  if (!def) throw new Error(`Unknown workflow type: ${type}`);
  const db = getDb(env.DB);
  const instanceId = crypto.randomUUID();
  await db.insert(workflowInstances).values({
    id: instanceId,
    workflowType: type,
    entityType,
    entityId,
    status: 'PENDING',
    currentStep: def.steps[0]?.name ?? null,
    stepIndex: 0,
    totalSteps: def.steps.length,
    context: JSON.stringify(context),
    attempts: 0,
  });
  await env.EVENTS_QUEUE.send({
    type: 'workflow.step',
    payload: { instanceId },
  });
  return { instanceId };
}

export async function runStep(env: Env, instanceId: string): Promise<void> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  const instance = rows[0];
  if (!instance) throw new Error(`Workflow instance ${instanceId} not found`);
  if (
    instance.status === 'COMPLETED' ||
    instance.status === 'FAILED' ||
    instance.status === 'CANCELLED' ||
    instance.status === 'TERMINATED'
  ) {
    return; // idempotent — already done or aborted
  }
  if (instance.status === 'WAITING_FOR_EVENT') {
    // Already waiting; don't re-enter the step. The /events endpoint or
    // the timeout sweep will move the workflow forward.
    return;
  }
  const def = REGISTRY[instance.workflowType];
  if (!def) {
    await markFailed(env, instanceId, `Unknown workflow type: ${instance.workflowType}`);
    return;
  }
  const stepIndex = instance.stepIndex ?? 0;
  const step = def.steps[stepIndex];
  if (!step) {
    // Past the last step — mark complete
    await db
      .update(workflowInstances)
      .set({
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflowInstances.id, instanceId));
    return;
  }

  // Mark RUNNING + activity STARTED
  await db
    .update(workflowInstances)
    .set({
      status: 'RUNNING',
      currentStep: step.name,
      attempts: (instance.attempts ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowInstances.id, instanceId));

  const activityId = crypto.randomUUID();
  const startedAt = Date.now();
  await db.insert(workflowActivityLog).values({
    id: activityId,
    workflowInstanceId: instanceId,
    activityName: step.name,
    status: 'STARTED',
    input: instance.context,
  });

  let context: Record<string, unknown>;
  try {
    context = JSON.parse(instance.context ?? '{}');
  } catch {
    context = {};
  }

  try {
    const result = await step.execute(env, context);
    const completedAt = Date.now();

    // If the step asked to pause for an external event, transition to
    // WAITING_FOR_EVENT and do NOT advance the step index. The step will
    // be re-entered (with the event payload merged into context) when
    // raiseEvent() fires.
    if (isWaitForEvent(result)) {
      const expiresAt = result.timeoutMinutes
        ? new Date(Date.now() + result.timeoutMinutes * 60_000).toISOString()
        : null;
      await db
        .update(workflowActivityLog)
        .set({
          status: 'COMPLETED',
          output: JSON.stringify({ waitForEvent: result.waitForEvent, expiresAt }),
          completedAt: new Date().toISOString(),
          durationMs: completedAt - startedAt,
        })
        .where(eq(workflowActivityLog.id, activityId));
      await db
        .update(workflowInstances)
        .set({
          status: 'WAITING_FOR_EVENT',
          waitingForEvent: result.waitForEvent,
          eventWaitExpiresAt: expiresAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(workflowInstances.id, instanceId));
      // Check if the event was already raised before we got here (race-safe)
      const preExisting = await db
        .select()
        .from(workflowEvents)
        .where(
          and(
            eq(workflowEvents.workflowInstanceId, instanceId),
            eq(workflowEvents.eventName, result.waitForEvent),
            isNull(workflowEvents.consumedAt),
          ),
        )
        .limit(1);
      if (preExisting.length > 0) {
        await resumeFromEvent(env, instanceId, preExisting[0].id);
      }
      return;
    }

    const merged = { ...context, ...((result as Record<string, unknown>) ?? {}) };
    await db
      .update(workflowActivityLog)
      .set({
        status: 'COMPLETED',
        output: JSON.stringify(result ?? {}),
        completedAt: new Date().toISOString(),
        durationMs: completedAt - startedAt,
      })
      .where(eq(workflowActivityLog.id, activityId));
    const nextIndex = stepIndex + 1;
    const isDone = nextIndex >= def.steps.length;
    await db
      .update(workflowInstances)
      .set({
        context: JSON.stringify(merged),
        stepIndex: nextIndex,
        currentStep: isDone ? null : def.steps[nextIndex].name,
        status: isDone ? 'COMPLETED' : 'PENDING',
        completedAt: isDone ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflowInstances.id, instanceId));
    if (!isDone) {
      await env.EVENTS_QUEUE.send({
        type: 'workflow.step',
        payload: { instanceId },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const completedAt = Date.now();
    await db
      .update(workflowActivityLog)
      .set({
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date().toISOString(),
        durationMs: completedAt - startedAt,
      })
      .where(eq(workflowActivityLog.id, activityId));
    await markFailed(env, instanceId, message);
  }
}

async function markFailed(env: Env, instanceId: string, errorMessage: string): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(workflowInstances)
    .set({
      status: 'FAILED',
      errorMessage,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowInstances.id, instanceId));
}

export async function getWorkflowStatus(env: Env, instanceId: string) {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Control plane primitives ──────────────────────────────────────────────

/**
 * Publish a free-form sub-status JSON onto the workflow instance. Useful
 * for fine-grained progress signaling from within a long step
 * (e.g. `{stage:'merge', subStep:3, of:6}`).
 */
export async function setCustomStatus(
  env: Env,
  instanceId: string,
  customStatus: unknown,
): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(workflowInstances)
    .set({
      customStatus: JSON.stringify(customStatus),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowInstances.id, instanceId));
}

/**
 * Mark a workflow as terminated. The in-flight step (if any) finishes
 * naturally; the next runStep() call short-circuits because of the status
 * check at the top.
 */
export async function terminateWorkflow(
  env: Env,
  instanceId: string,
  reason: string,
  userId?: string | null,
): Promise<{ terminated: boolean }> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  const instance = rows[0];
  if (!instance) return { terminated: false };
  if (
    instance.status === 'COMPLETED' ||
    instance.status === 'FAILED' ||
    instance.status === 'TERMINATED'
  ) {
    return { terminated: false };
  }
  await db
    .update(workflowInstances)
    .set({
      status: 'TERMINATED',
      terminatedBy: userId ?? null,
      terminatedAt: new Date().toISOString(),
      terminateReason: reason,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowInstances.id, instanceId));
  return { terminated: true };
}

/**
 * Raise an external event against a workflow. If the workflow is
 * currently WAITING_FOR_EVENT for this event name, immediately resume it
 * with the event payload merged into context.
 */
export async function raiseEvent(
  env: Env,
  instanceId: string,
  eventName: string,
  payload: unknown,
  userId?: string | null,
): Promise<{ accepted: boolean; resumed: boolean; eventId: string }> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  const instance = rows[0];
  if (!instance) return { accepted: false, resumed: false, eventId: '' };
  if (
    instance.status === 'COMPLETED' ||
    instance.status === 'FAILED' ||
    instance.status === 'TERMINATED' ||
    instance.status === 'CANCELLED'
  ) {
    return { accepted: false, resumed: false, eventId: '' };
  }

  const eventId = crypto.randomUUID();
  await db.insert(workflowEvents).values({
    id: eventId,
    workflowInstanceId: instanceId,
    eventName,
    payload: payload === undefined ? null : JSON.stringify(payload),
    raisedByUserId: userId ?? null,
  });

  // If the workflow is waiting for THIS event, resume now
  if (instance.status === 'WAITING_FOR_EVENT' && instance.waitingForEvent === eventName) {
    await resumeFromEvent(env, instanceId, eventId);
    return { accepted: true, resumed: true, eventId };
  }
  return { accepted: true, resumed: false, eventId };
}

/**
 * Consume the event, merge its payload into the workflow context, clear
 * the wait flags, transition to PENDING, and enqueue the next step.
 */
async function resumeFromEvent(env: Env, instanceId: string, eventId: string): Promise<void> {
  const db = getDb(env.DB);
  const evRows = await db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.id, eventId))
    .limit(1);
  const ev = evRows[0];
  if (!ev || ev.consumedAt) return;

  const instanceRows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  const instance = instanceRows[0];
  if (!instance) return;

  let context: Record<string, unknown>;
  try {
    context = JSON.parse(instance.context ?? '{}');
  } catch {
    context = {};
  }
  let eventPayload: unknown = null;
  if (ev.payload) {
    try {
      eventPayload = JSON.parse(ev.payload);
    } catch {
      eventPayload = ev.payload;
    }
  }
  const mergedContext = {
    ...context,
    lastEvent: { name: ev.eventName, payload: eventPayload, raisedAt: ev.createdAt },
  };

  await db
    .update(workflowEvents)
    .set({ consumedAt: new Date().toISOString() })
    .where(eq(workflowEvents.id, eventId));

  // Advance: the waiting step is considered "complete" because it asked
  // to wait. We bump stepIndex by 1.
  const nextIndex = (instance.stepIndex ?? 0) + 1;
  const def = REGISTRY[instance.workflowType];
  const isDone = !def || nextIndex >= def.steps.length;
  await db
    .update(workflowInstances)
    .set({
      context: JSON.stringify(mergedContext),
      stepIndex: nextIndex,
      currentStep: isDone ? null : def.steps[nextIndex].name,
      status: isDone ? 'COMPLETED' : 'PENDING',
      waitingForEvent: null,
      eventWaitExpiresAt: null,
      completedAt: isDone ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowInstances.id, instanceId));

  if (!isDone) {
    await env.EVENTS_QUEUE.send({
      type: 'workflow.step',
      payload: { instanceId },
    });
  }
}

/**
 * Cron-driven sweep: find any workflow that's been WAITING_FOR_EVENT past
 * its declared expiry and mark it FAILED.
 */
export async function sweepExpiredEventWaits(env: Env): Promise<{ expired: number }> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();
  const expired = await db
    .select()
    .from(workflowInstances)
    .where(
      and(
        eq(workflowInstances.status, 'WAITING_FOR_EVENT'),
        lt(workflowInstances.eventWaitExpiresAt, now),
      ),
    );
  for (const row of expired) {
    await db
      .update(workflowInstances)
      .set({
        status: 'FAILED',
        errorMessage: `Event timeout: ${row.waitingForEvent ?? '(unknown)'}`,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflowInstances.id, row.id));
  }
  return { expired: expired.length };
}

/**
 * Purge a workflow + all its activity log rows + all its events.
 * Returns the deletion counts.
 */
export async function purgeWorkflow(
  env: Env,
  instanceId: string,
): Promise<{ purged: boolean; activityRows: number; eventRows: number; reason?: string }> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  const instance = rows[0];
  if (!instance) return { purged: false, activityRows: 0, eventRows: 0, reason: 'not found' };
  if (
    instance.status === 'PENDING' ||
    instance.status === 'RUNNING' ||
    instance.status === 'WAITING_FOR_EVENT'
  ) {
    return { purged: false, activityRows: 0, eventRows: 0, reason: 'workflow still active; terminate first' };
  }
  const activityCount = await db
    .delete(workflowActivityLog)
    .where(eq(workflowActivityLog.workflowInstanceId, instanceId));
  const eventCount = await db
    .delete(workflowEvents)
    .where(eq(workflowEvents.workflowInstanceId, instanceId));
  await db.delete(workflowInstances).where(eq(workflowInstances.id, instanceId));
  return {
    purged: true,
    activityRows: (activityCount as any)?.meta?.changes ?? 0,
    eventRows: (eventCount as any)?.meta?.changes ?? 0,
  };
}

/**
 * Rich status response (Durable-Functions-style). Includes activity log
 * and a `managementUrls` object so a client can self-discover terminate,
 * raiseEvent, purge URLs without hard-coding them.
 */
export async function getRichWorkflowStatus(
  env: Env,
  instanceId: string,
  baseUrl: string,
) {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);
  const instance = rows[0];
  if (!instance) return null;
  const activities = await db
    .select()
    .from(workflowActivityLog)
    .where(eq(workflowActivityLog.workflowInstanceId, instanceId));
  let context: unknown = null;
  if (instance.context) {
    try { context = JSON.parse(instance.context); } catch { /* keep null */ }
  }
  let customStatus: unknown = null;
  if (instance.customStatus) {
    try { customStatus = JSON.parse(instance.customStatus); } catch { /* keep null */ }
  }
  return {
    instanceId: instance.id,
    workflowType: instance.workflowType,
    entityType: instance.entityType,
    entityId: instance.entityId,
    status: instance.status,
    currentStep: instance.currentStep,
    stepIndex: instance.stepIndex,
    totalSteps: instance.totalSteps,
    customStatus,
    context,
    errorMessage: instance.errorMessage,
    attempts: instance.attempts,
    waitingForEvent: instance.waitingForEvent,
    eventWaitExpiresAt: instance.eventWaitExpiresAt,
    terminatedBy: instance.terminatedBy,
    terminatedAt: instance.terminatedAt,
    terminateReason: instance.terminateReason,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    completedAt: instance.completedAt,
    activityLog: activities.map((a) => ({
      activityName: a.activityName,
      status: a.status,
      durationMs: a.durationMs,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      errorMessage: a.errorMessage,
    })),
    managementUrls: {
      statusQueryGetUri: `${baseUrl}/api/workflows/${instance.id}/status`,
      terminatePostUri: `${baseUrl}/api/workflows/${instance.id}/terminate`,
      sendEventPostUri: `${baseUrl}/api/workflows/${instance.id}/events`,
      purgeHistoryDeleteUri: `${baseUrl}/api/workflows/${instance.id}`,
    },
  };
}

/**
 * /api/workflows/* — generic workflow control plane. Mirrors Azure
 * Durable Functions' HTTP starter + management URLs surface:
 *
 *   POST   /workflows/:type/start        — kick off a workflow by type
 *   GET    /workflows                    — list / search instances
 *   GET    /workflows/:id                — short status (legacy shape)
 *   GET    /workflows/:id/status         — rich status (activityLog + mgmt URLs)
 *   POST   /workflows/:id/terminate      — abort an in-flight workflow
 *   POST   /workflows/:id/events         — raise an external event
 *   DELETE /workflows/:id                — purge completed history
 *
 * All endpoints are admin-only via `rbac('ACCOUNT_MANAGER')`. Workflow
 * step handlers themselves run inside the queue consumer; nothing here
 * executes step code directly.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { workflowInstances } from '@curavend/db';
import { getDb } from '../lib/db';
import { rbac } from '../middleware/rbac';
import { ValidationError, NotFoundError, AppError } from '../lib/errors';
import {
  REGISTRY,
  listWorkflowTypes,
  startWorkflow,
  terminateWorkflow,
  raiseEvent,
  purgeWorkflow,
  getRichWorkflowStatus,
} from '../services/workflowService';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function baseUrlOf(c: any): string {
  const u = new URL(c.req.url);
  return `${u.protocol}//${u.host}`;
}

function buildManagementUrls(c: any, instanceId: string) {
  const base = baseUrlOf(c);
  return {
    statusQueryGetUri: `${base}/api/workflows/${instanceId}/status`,
    terminatePostUri: `${base}/api/workflows/${instanceId}/terminate`,
    sendEventPostUri: `${base}/api/workflows/${instanceId}/events`,
    purgeHistoryDeleteUri: `${base}/api/workflows/${instanceId}`,
  };
}

// ─── GET /workflows — list / search ────────────────────────────────────────

app.get('/', rbac('ACCOUNT_MANAGER'), async (c) => {
  const type = c.req.query('type');
  const status = c.req.query('status');
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  const limit = Math.min(200, Number(c.req.query('limit') ?? 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));

  const db = getDb(c.env.DB);
  const conditions: any[] = [];
  if (type) conditions.push(eq(workflowInstances.workflowType, type));
  if (status) conditions.push(eq(workflowInstances.status, status));
  if (entityType) conditions.push(eq(workflowInstances.entityType, entityType));
  if (entityId) conditions.push(eq(workflowInstances.entityId, entityId));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(workflowInstances)
    .where(where as any)
    .orderBy(desc(workflowInstances.createdAt))
    .limit(limit)
    .offset(offset);
  const totalRes = await db
    .select({ c: count() })
    .from(workflowInstances)
    .where(where as any);
  const total = Number(totalRes[0]?.c ?? 0);

  return c.json({
    data: rows.map((r) => ({
      instanceId: r.id,
      workflowType: r.workflowType,
      entityType: r.entityType,
      entityId: r.entityId,
      status: r.status,
      currentStep: r.currentStep,
      stepIndex: r.stepIndex,
      totalSteps: r.totalSteps,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      completedAt: r.completedAt,
    })),
    total,
    limit,
    offset,
    registeredTypes: listWorkflowTypes(),
  });
});

// ─── POST /workflows/:type/start ────────────────────────────────────────────

const startSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

app.post('/:type/start', rbac('ACCOUNT_MANAGER'), async (c) => {
  const type = c.req.param('type');
  if (!REGISTRY[type]) {
    throw new ValidationError(`Unknown workflow type: ${type}. Known: ${listWorkflowTypes().join(', ')}`);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const { instanceId } = await startWorkflow(
    c.env,
    type,
    parsed.data.entityType,
    parsed.data.entityId,
    parsed.data.context ?? {},
  );
  return c.json(
    {
      instanceId,
      workflowType: type,
      ...buildManagementUrls(c, instanceId),
    },
    201,
  );
});

// ─── GET /workflows/:id ─── short shape ────────────────────────────────────

app.get('/:id', rbac('ACCOUNT_MANAGER'), async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, id))
    .limit(1);
  const instance = rows[0];
  if (!instance) throw new NotFoundError('Workflow instance not found');
  return c.json({ data: instance, ...buildManagementUrls(c, id) });
});

// ─── GET /workflows/:id/status ─── rich shape with activityLog + mgmt URLs ─

app.get('/:id/status', rbac('ACCOUNT_MANAGER'), async (c) => {
  const id = c.req.param('id');
  const status = await getRichWorkflowStatus(c.env, id, baseUrlOf(c));
  if (!status) throw new NotFoundError('Workflow instance not found');
  return c.json(status);
});

// ─── POST /workflows/:id/terminate ─────────────────────────────────────────

const terminateSchema = z.object({
  reason: z.string().min(1),
});

app.post('/:id/terminate', rbac('ACCOUNT_MANAGER'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const body = await c.req.json().catch(() => ({}));
  const parsed = terminateSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const result = await terminateWorkflow(c.env, id, parsed.data.reason, user?.id ?? null);
  if (!result.terminated) {
    throw new AppError(409, 'Workflow is not in a terminable state', 'WORKFLOW_NOT_TERMINABLE');
  }
  return c.json({ ok: true, instanceId: id, status: 'TERMINATED', reason: parsed.data.reason });
});

// ─── POST /workflows/:id/events ────────────────────────────────────────────

const raiseEventSchema = z.object({
  eventName: z.string().min(1),
  payload: z.unknown().optional(),
});

const MAX_PAYLOAD_BYTES = 16 * 1024;

app.post('/:id/events', rbac('ACCOUNT_MANAGER'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const body = await c.req.json().catch(() => ({}));
  const parsed = raiseEventSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  if (parsed.data.payload !== undefined) {
    const size = new TextEncoder().encode(JSON.stringify(parsed.data.payload)).length;
    if (size > MAX_PAYLOAD_BYTES) {
      throw new ValidationError(`payload exceeds max size of ${MAX_PAYLOAD_BYTES} bytes`);
    }
  }
  const result = await raiseEvent(
    c.env,
    id,
    parsed.data.eventName,
    parsed.data.payload,
    user?.id ?? null,
  );
  if (!result.accepted) {
    throw new AppError(409, 'Workflow is not accepting events', 'WORKFLOW_NOT_ACCEPTING_EVENTS');
  }
  return c.json({
    ok: true,
    instanceId: id,
    eventId: result.eventId,
    eventName: parsed.data.eventName,
    resumed: result.resumed,
  });
});

// ─── DELETE /workflows/:id ─── purge ───────────────────────────────────────

app.delete('/:id', rbac('ACCOUNT_MANAGER'), async (c) => {
  const id = c.req.param('id');
  const result = await purgeWorkflow(c.env, id);
  if (!result.purged) {
    throw new AppError(409, result.reason ?? 'Cannot purge workflow', 'WORKFLOW_NOT_PURGEABLE');
  }
  return c.json({
    ok: true,
    instanceId: id,
    activityRowsDeleted: result.activityRows,
    eventRowsDeleted: result.eventRows,
  });
});

export default app;

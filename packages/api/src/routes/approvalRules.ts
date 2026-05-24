/**
 * /api/approval-rules — declarative approval routing rules.
 *
 * Endpoints:
 *   GET    /                  — list rules for current hospital (filter by triggerType)
 *   POST   /                  — create rule
 *   PUT    /:id               — update rule
 *   DELETE /:id               — delete rule
 *   POST   /preview           — dry-run: given a trigger + sample object, show which rule wins
 */
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { approvalRules, APPROVAL_RULE_TRIGGERS } from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { resolveApprovers } from '../services/approvalRuleEngine';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdminRole(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { triggerType } = c.req.query();
  const hospitalId =
    isAdminRole(user) && c.req.query('hospitalId')
      ? c.req.query('hospitalId')!
      : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  const conds: any[] = [eq(approvalRules.hospitalId, hospitalId)];
  if (triggerType) conds.push(eq(approvalRules.triggerType, triggerType));
  const rows = await db
    .select()
    .from(approvalRules)
    .where(and(...conds))
    .orderBy(approvalRules.priority);
  return c.json({ items: rows });
});

// ─── POST / ────────────────────────────────────────────────────────────────
app.post(
  '/',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const user = c.get('user');
    const body = (await c.req.json()) as {
      hospitalId?: string;
      name?: string;
      description?: string;
      triggerType?: string;
      priority?: number;
      isActive?: boolean;
      conditions?: any;
      approver?: any;
      isTerminal?: boolean;
    };

    const hospitalId =
      isAdminRole(user) && body.hospitalId ? body.hospitalId : user.hospitalId;
    if (!hospitalId) throw new ValidationError('hospitalId required');
    if (!body.name?.trim()) throw new ValidationError('name is required');
    if (!body.triggerType || !(APPROVAL_RULE_TRIGGERS as readonly string[]).includes(body.triggerType)) {
      throw new ValidationError(`triggerType must be one of ${APPROVAL_RULE_TRIGGERS.join(', ')}`);
    }
    if (!body.approver || !body.approver.type || !body.approver.id) {
      throw new ValidationError('approver { type, id } required');
    }
    if (!['USER', 'GROUP', 'ROLE'].includes(body.approver.type)) {
      throw new ValidationError('approver.type must be USER, GROUP, or ROLE');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(approvalRules).values({
      id,
      hospitalId,
      name: body.name.trim(),
      description: body.description ?? null,
      triggerType: body.triggerType,
      priority: body.priority ?? 100,
      isActive: body.isActive === false ? 0 : 1,
      conditionsJson: JSON.stringify(body.conditions ?? {}),
      approverJson: JSON.stringify(body.approver),
      isTerminal: body.isTerminal === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ id }, 201);
  },
);

// ─── PUT /:id ──────────────────────────────────────────────────────────────
app.put(
  '/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const user = c.get('user');
    const { id } = c.req.param();
    const body = (await c.req.json()) as any;
    const [row] = await db.select().from(approvalRules).where(eq(approvalRules.id, id)).limit(1);
    if (!row) throw new NotFoundError('Rule not found');
    if (!isAdminRole(user) && user.hospitalId && row.hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized');
    }
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
    if (body.isTerminal !== undefined) patch.isTerminal = body.isTerminal ? 1 : 0;
    if (body.conditions !== undefined) patch.conditionsJson = JSON.stringify(body.conditions);
    if (body.approver !== undefined) patch.approverJson = JSON.stringify(body.approver);
    await db.update(approvalRules).set(patch).where(eq(approvalRules.id, id));
    return c.json({ id, updated: true });
  },
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────
app.delete(
  '/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const user = c.get('user');
    const { id } = c.req.param();
    const [row] = await db.select().from(approvalRules).where(eq(approvalRules.id, id)).limit(1);
    if (!row) throw new NotFoundError('Rule not found');
    if (!isAdminRole(user) && user.hospitalId && row.hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized');
    }
    await db.delete(approvalRules).where(eq(approvalRules.id, id));
    return c.json({ id, deleted: true });
  },
);

// ─── POST /preview ─────────────────────────────────────────────────────────
// Dry-run: pass a triggerType + sample object, get back the resolved approver chain.
app.post('/preview', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as {
    triggerType?: string;
    sample?: any;
  };
  if (!body.triggerType || !body.sample) {
    throw new ValidationError('triggerType and sample required');
  }
  if (!(APPROVAL_RULE_TRIGGERS as readonly string[]).includes(body.triggerType)) {
    throw new ValidationError(`triggerType must be one of ${APPROVAL_RULE_TRIGGERS.join(', ')}`);
  }
  const hospitalId =
    isAdminRole(user) && body.sample.hospitalId ? body.sample.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required in sample');
  const result = await resolveApprovers(c.env.DB, body.triggerType as any, {
    ...body.sample,
    hospitalId,
  });
  return c.json({ approvers: result });
});

export default app;

/**
 * /api/requisitions — enterprise requisition workflow.
 *
 * Lifecycle:
 *   DRAFT → SUBMITTED → IN_REVIEW → APPROVED → CONVERTED
 *                                  → REJECTED
 *                                  → CANCELLED (from any non-terminal)
 *
 * Endpoints:
 *   GET    /                   — list requisitions (filterable)
 *   POST   /                   — create DRAFT (with items)
 *   GET    /:id                — detail + items + history
 *   PUT    /:id                — patch DRAFT (header)
 *   POST   /:id/items          — append item
 *   PUT    /:id/items/:itemId  — update item
 *   DELETE /:id/items/:itemId  — remove item
 *   POST   /:id/submit         — DRAFT → SUBMITTED (runs approval rules)
 *   POST   /:id/approve        — SUBMITTED/IN_REVIEW → APPROVED
 *   POST   /:id/reject         — SUBMITTED/IN_REVIEW → REJECTED (reason required)
 *   POST   /:id/cancel         — any non-terminal → CANCELLED
 *   POST   /:id/convert        — APPROVED → CONVERTED (spawns orders grouped by vendor)
 *   POST   /:id/comment        — append history comment
 */
import { Hono } from 'hono';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  requisitions,
  requisitionItems,
  requisitionHistory,
  formularyItems,
  orders,
  orderItems,
  REQUISITION_STATUSES,
  REQUISITION_PRIORITIES,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { getNextValue, ensureSequenceTable } from '../services/sequenceService';
import { pickPrimaryApprover } from '../services/approvalRuleEngine';
import { NotificationService } from '../services/notificationService';
import { resolveBudget, commitBudget, releaseBudget } from '../services/budgetService';
import { hospitalDepartments, purchaseOrders, purchaseOrderItems } from '@curavend/db';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdminRole(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

async function appendHistory(
  db: any,
  reqId: string,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  userId: string | null,
  comment?: string | null,
) {
  await db.insert(requisitionHistory).values({
    id: crypto.randomUUID(),
    requisitionId: reqId,
    action,
    fromStatus,
    toStatus,
    byUserId: userId,
    comment: comment ?? null,
    createdAt: new Date().toISOString(),
  });
}

async function loadAndAuthorize(
  db: any,
  user: AuthUser,
  id: string,
): Promise<any> {
  const [row] = await db.select().from(requisitions).where(eq(requisitions.id, id)).limit(1);
  if (!row) throw new NotFoundError('Requisition not found');
  if (!isAdminRole(user) && user.hospitalId && row.hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized to access this requisition');
  }
  return row;
}

// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', requirePermission('requisitions', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { status, requesterId, approverId, priority, facilityId, departmentId, q } = c.req.query();

  const conds: any[] = [];
  if (!isAdminRole(user)) {
    if (user.hospitalId) {
      conds.push(eq(requisitions.hospitalId, user.hospitalId));
    } else {
      // Non-admin persona without a hospital tenant must see nothing.
      conds.push(sql`1 = 0`);
    }
  } else if (c.req.query('hospitalId')) {
    conds.push(eq(requisitions.hospitalId, c.req.query('hospitalId')!));
  }
  if (status) conds.push(eq(requisitions.status, status));
  if (requesterId) conds.push(eq(requisitions.requestedByUserId, requesterId));
  if (approverId) conds.push(eq(requisitions.approverUserId, approverId));
  if (priority) conds.push(eq(requisitions.priority, priority));
  if (facilityId) conds.push(eq(requisitions.facilityId, facilityId));
  if (departmentId) conds.push(eq(requisitions.departmentId, departmentId));
  if (q) conds.push(sql`(${requisitions.title} LIKE ${'%' + q + '%'} OR ${requisitions.requisitionNumber} LIKE ${'%' + q + '%'})`);

  const rows = await db
    .select()
    .from(requisitions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(requisitions.createdAt))
    .limit(500);

  return c.json({ items: rows });
});

// ─── POST / ────────────────────────────────────────────────────────────────
app.post('/', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as {
    hospitalId?: string;
    facilityId?: string;
    departmentId?: string;
    title?: string;
    justification?: string;
    priority?: string;
    neededByDate?: string;
    payorId?: string;
    notes?: string;
    templateId?: string;
    // Emergency fast-lane (PV3-B).
    isEmergency?: boolean;
    emergencyReason?: string;
    items?: Array<{
      hcpcCode: string;
      description: string;
      quantity: number;
      estimatedUnitPriceUsd?: number;
      preferredVendorId?: string;
      justification?: string;
      substitutesAllowed?: boolean;
      notes?: string;
    }>;
  };

  const hospitalId =
    isAdminRole(user) && body.hospitalId ? body.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  if (!body.title?.trim()) throw new ValidationError('title is required');
  if (body.priority && !(REQUISITION_PRIORITIES as readonly string[]).includes(body.priority)) {
    throw new ValidationError(`priority must be one of ${REQUISITION_PRIORITIES.join(', ')}`);
  }

  await ensureSequenceTable(db);
  const seq = await getNextValue(db, `requisition_${hospitalId}`);
  const year = new Date().getFullYear();
  const reqNumber = `REQ-${year}-${String(seq).padStart(5, '0')}`;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Pre-compute estimatedTotal and off-formulary flags
  let total = 0;
  const itemsToInsert: any[] = [];
  if (Array.isArray(body.items)) {
    for (const it of body.items) {
      if (!it.hcpcCode?.trim() || !it.description?.trim() || !it.quantity) continue;
      const hcpc = it.hcpcCode.trim().toUpperCase();
      // Look up formulary for this hcpc
      const [fm] = await db
        .select()
        .from(formularyItems)
        .where(
          and(
            eq(formularyItems.hospitalId, hospitalId),
            eq(formularyItems.hcpcCode, hcpc),
            eq(formularyItems.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      const est = it.estimatedUnitPriceUsd ?? 0;
      total += est * it.quantity;
      itemsToInsert.push({
        id: crypto.randomUUID(),
        requisitionId: id,
        formularyItemId: fm?.id ?? null,
        hcpcCode: hcpc,
        description: it.description.trim(),
        quantity: it.quantity,
        estimatedUnitPriceUsd: it.estimatedUnitPriceUsd ?? null,
        preferredVendorId: it.preferredVendorId ?? fm?.preferredVendorId ?? null,
        justification: it.justification ?? null,
        substitutesAllowed: it.substitutesAllowed === false ? 0 : 1,
        approvalStatus: 'PENDING',
        isOffFormulary: fm ? 0 : 1,
        requiresPriorAuth: fm?.requiresPriorAuth ?? 0,
        notes: it.notes ?? null,
        createdAt: now,
      });
    }
  }

  await db.insert(requisitions).values({
    id,
    requisitionNumber: reqNumber,
    hospitalId,
    facilityId: body.facilityId ?? null,
    departmentId: body.departmentId ?? null,
    requestedByUserId: user.id,
    title: body.title.trim(),
    justification: body.justification ?? null,
    status: 'DRAFT',
    priority: body.priority ?? 'NORMAL',
    neededByDate: body.neededByDate ?? null,
    estimatedTotalUsd: total,
    payorId: body.payorId ?? null,
    templateId: body.templateId ?? null,
    notes: body.notes ?? null,
    isEmergency: body.isEmergency ? 1 : 0,
    emergencyReason: body.isEmergency ? (body.emergencyReason ?? null) : null,
    createdAt: now,
    updatedAt: now,
  } as any);

  if (itemsToInsert.length) {
    await db.insert(requisitionItems).values(itemsToInsert);
  }

  await appendHistory(db, id, 'CREATED', null, 'DRAFT', user.id, null);

  return c.json({ id, requisitionNumber: reqNumber }, 201);
});

// ─── GET /:id ──────────────────────────────────────────────────────────────
app.get('/:id', requirePermission('requisitions', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  const items = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.requisitionId, id));
  const history = await db
    .select()
    .from(requisitionHistory)
    .where(eq(requisitionHistory.requisitionId, id))
    .orderBy(desc(requisitionHistory.createdAt));
  return c.json({
    ...row,
    convertedOrderIds: row.convertedOrderIds ? JSON.parse(row.convertedOrderIds) : [],
    items,
    history,
  });
});

// ─── PUT /:id ──────────────────────────────────────────────────────────────
app.put('/:id', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'DRAFT') {
    throw new ConflictError('Only DRAFT requisitions can be edited');
  }
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of [
    'title',
    'justification',
    'priority',
    'neededByDate',
    'facilityId',
    'departmentId',
    'payorId',
    'notes',
  ]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  await db.update(requisitions).set(patch).where(eq(requisitions.id, id));
  return c.json({ id, updated: true });
});

// ─── POST /:id/items ───────────────────────────────────────────────────────
app.post('/:id/items', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT requisitions can be edited');
  const body = (await c.req.json()) as any;
  if (!body.hcpcCode || !body.description || !body.quantity) {
    throw new ValidationError('hcpcCode, description, quantity are required');
  }
  const hcpc = String(body.hcpcCode).trim().toUpperCase();
  const [fm] = await db
    .select()
    .from(formularyItems)
    .where(
      and(
        eq(formularyItems.hospitalId, row.hospitalId),
        eq(formularyItems.hcpcCode, hcpc),
        eq(formularyItems.status, 'ACTIVE'),
      ),
    )
    .limit(1);

  const itemId = crypto.randomUUID();
  await db.insert(requisitionItems).values({
    id: itemId,
    requisitionId: id,
    formularyItemId: fm?.id ?? null,
    hcpcCode: hcpc,
    description: body.description,
    quantity: body.quantity,
    estimatedUnitPriceUsd: body.estimatedUnitPriceUsd ?? null,
    preferredVendorId: body.preferredVendorId ?? fm?.preferredVendorId ?? null,
    justification: body.justification ?? null,
    substitutesAllowed: body.substitutesAllowed === false ? 0 : 1,
    approvalStatus: 'PENDING',
    isOffFormulary: fm ? 0 : 1,
    requiresPriorAuth: fm?.requiresPriorAuth ?? 0,
    notes: body.notes ?? null,
    createdAt: new Date().toISOString(),
  });
  await recomputeTotal(db, id);
  return c.json({ id: itemId }, 201);
});

// ─── PUT /:id/items/:itemId ───────────────────────────────────────────────
app.put('/:id/items/:itemId', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT requisitions can be edited');
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = {};
  for (const k of [
    'description',
    'quantity',
    'estimatedUnitPriceUsd',
    'preferredVendorId',
    'justification',
    'notes',
  ]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.substitutesAllowed !== undefined) {
    patch.substitutesAllowed = body.substitutesAllowed ? 1 : 0;
  }
  await db
    .update(requisitionItems)
    .set(patch)
    .where(and(eq(requisitionItems.id, itemId), eq(requisitionItems.requisitionId, id)));
  await recomputeTotal(db, id);
  return c.json({ id: itemId, updated: true });
});

// ─── DELETE /:id/items/:itemId ────────────────────────────────────────────
app.delete('/:id/items/:itemId', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT requisitions can be edited');
  await db
    .delete(requisitionItems)
    .where(and(eq(requisitionItems.id, itemId), eq(requisitionItems.requisitionId, id)));
  await recomputeTotal(db, id);
  return c.json({ id: itemId, deleted: true });
});

async function recomputeTotal(db: any, reqId: string) {
  const rows = await db
    .select({
      qty: requisitionItems.quantity,
      price: requisitionItems.estimatedUnitPriceUsd,
    })
    .from(requisitionItems)
    .where(eq(requisitionItems.requisitionId, reqId));
  const total = rows.reduce((sum: number, r: any) => sum + (r.qty ?? 0) * (r.price ?? 0), 0);
  await db
    .update(requisitions)
    .set({ estimatedTotalUsd: total, updatedAt: new Date().toISOString() })
    .where(eq(requisitions.id, reqId));
}

// ─── POST /:id/submit ─────────────────────────────────────────────────────
app.post('/:id/submit', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be submitted');

  const items = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.requisitionId, id));
  if (items.length === 0) throw new ValidationError('Cannot submit empty requisition');

  // Flags for the approval rules engine
  const containsOffFormulary = items.some((i: any) => i.isOffFormulary === 1);
  const containsRestricted = false; // could expand to check formulary restricted flag
  const containsPriorAuth = items.some((i: any) => i.requiresPriorAuth === 1);

  // Off-formulary items must carry justification
  for (const it of items) {
    if (it.isOffFormulary === 1 && !it.justification) {
      throw new ValidationError(`Off-formulary item ${it.hcpcCode} requires justification`);
    }
  }

  // Resolve approver via rule engine
  const approver = await pickPrimaryApprover(c.env.DB, 'REQUISITION', {
    hospitalId: row.hospitalId,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    amountUsd: row.estimatedTotalUsd,
    priority: row.priority,
    containsOffFormulary,
    containsRestricted,
    containsPriorAuth,
  });

  const approverUserId = approver?.type === 'USER' ? approver.id : null;
  const now = new Date().toISOString();

  // Budget encumbrance (gap 2). Resolves the narrowest matching budget,
  // records `budgetId` on the requisition, and bumps committed_usd. If no
  // budget matches, we still allow submit (hospital policy decides whether
  // to block). When `?strictBudget=1` is passed, overruns return 409 instead.
  const strict = c.req.query('strictBudget') === '1';
  let budgetCommit: { budgetId: string; budgetCostCenter: string | null } | null = null;
  if (row.estimatedTotalUsd && row.estimatedTotalUsd > 0) {
    let costCenter: string | null = null;
    if (row.departmentId) {
      const [dept] = await db
        .select()
        .from(hospitalDepartments)
        .where(eq(hospitalDepartments.id, row.departmentId))
        .limit(1);
      costCenter = dept?.costCenter ?? null;
    }
    const budget = await resolveBudget(c.env.DB, {
      hospitalId: row.hospitalId,
      departmentId: row.departmentId,
      costCenter,
    });
    if (budget) {
      const available = budget.amountUsd - budget.committedUsd - budget.consumedUsd;
      if (row.estimatedTotalUsd > available && strict) {
        throw new ConflictError(
          `Requisition $${row.estimatedTotalUsd.toFixed(2)} exceeds available $${available.toFixed(2)} (strict mode)`,
        );
      }
      await commitBudget(c.env.DB, {
        budgetId: budget.id,
        amount: row.estimatedTotalUsd,
        sourceType: 'REQUISITION',
        sourceId: id,
        note: `Submit ${row.requisitionNumber}`,
        byUserId: user.id,
      });
      budgetCommit = { budgetId: budget.id, budgetCostCenter: costCenter };
    }
  }

  // Emergency fast-lane (PV3-B): if the requisition was flagged as
  // emergency, skip normal approver assignment and shoot directly to
  // APPROVED — but stamp PENDING_REVIEW so a manager triages it post-hoc.
  const isEmergency = row.isEmergency === 1;
  const finalStatus = isEmergency ? 'APPROVED' : 'SUBMITTED';
  const finalApprover = isEmergency ? user.id : approverUserId;
  await db
    .update(requisitions)
    .set({
      status: finalStatus,
      approverUserId: finalApprover,
      approvedAt: isEmergency ? now : null,
      emergencyReviewStatus: isEmergency ? 'PENDING_REVIEW' : null,
      budgetId: budgetCommit?.budgetId ?? null,
      costCenter: budgetCommit?.budgetCostCenter ?? null,
      updatedAt: now,
    })
    .where(eq(requisitions.id, id));
  await appendHistory(
    db, id, isEmergency ? 'EMERGENCY_APPROVED' : 'SUBMITTED',
    'DRAFT', finalStatus, user.id,
    isEmergency ? `Emergency fast-lane: ${row.emergencyReason ?? 'no reason'}` : null,
  );

  // Notify the assigned approver (Feature D13)
  if (approverUserId) {
    const notif = new NotificationService(c.env.DB);
    await notif.createNotification({
      receiverId: approverUserId,
      message: `Requisition ${row.requisitionNumber} (${row.title}) awaits your approval`,
      redirectTo: 'NO_REDIRECT',
      redirectId: id,
    });
  }

  return c.json({
    id,
    status: 'SUBMITTED',
    approver: approver ?? null,
    matched: !!approver,
  });
});

// ─── POST /:id/approve ────────────────────────────────────────────────────
app.post('/:id/approve', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { comment?: string };
  const row = await loadAndAuthorize(db, user, id);
  if (!['SUBMITTED', 'IN_REVIEW'].includes(row.status)) {
    throw new ConflictError('Only SUBMITTED or IN_REVIEW can be approved');
  }
  const now = new Date().toISOString();
  await db
    .update(requisitions)
    .set({ status: 'APPROVED', approvedAt: now, updatedAt: now })
    .where(eq(requisitions.id, id));
  await appendHistory(db, id, 'APPROVED', row.status, 'APPROVED', user.id, body.comment);
  return c.json({ id, status: 'APPROVED' });
});

// ─── POST /:id/reject ─────────────────────────────────────────────────────
app.post('/:id/reject', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as { reason?: string };
  if (!body.reason?.trim()) throw new ValidationError('reason is required');
  const row = await loadAndAuthorize(db, user, id);
  if (!['SUBMITTED', 'IN_REVIEW'].includes(row.status)) {
    throw new ConflictError('Only SUBMITTED or IN_REVIEW can be rejected');
  }
  await db
    .update(requisitions)
    .set({
      status: 'REJECTED',
      rejectedReason: body.reason.trim(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(requisitions.id, id));
  await appendHistory(db, id, 'REJECTED', row.status, 'REJECTED', user.id, body.reason);
  // Release the budget commit from submit.
  if (row.budgetId && row.estimatedTotalUsd && row.estimatedTotalUsd > 0) {
    await releaseBudget(c.env.DB, {
      budgetId: row.budgetId,
      amount: row.estimatedTotalUsd,
      sourceType: 'REQUISITION',
      sourceId: id,
      note: `Reject ${row.requisitionNumber}`,
      byUserId: user.id,
    });
  }
  return c.json({ id, status: 'REJECTED' });
});

// ─── POST /:id/cancel ─────────────────────────────────────────────────────
app.post('/:id/cancel', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { comment?: string };
  const row = await loadAndAuthorize(db, user, id);
  if (['CONVERTED', 'REJECTED', 'CANCELLED'].includes(row.status)) {
    throw new ConflictError('Cannot cancel a terminal requisition');
  }
  await db
    .update(requisitions)
    .set({ status: 'CANCELLED', updatedAt: new Date().toISOString() })
    .where(eq(requisitions.id, id));
  await appendHistory(db, id, 'CANCELLED', row.status, 'CANCELLED', user.id, body.comment);
  // Release the budget commit from submit (if any).
  if (row.budgetId && row.estimatedTotalUsd && row.estimatedTotalUsd > 0) {
    await releaseBudget(c.env.DB, {
      budgetId: row.budgetId,
      amount: row.estimatedTotalUsd,
      sourceType: 'REQUISITION',
      sourceId: id,
      note: `Cancel ${row.requisitionNumber}`,
      byUserId: user.id,
    });
  }
  return c.json({ id, status: 'CANCELLED' });
});

// ─── POST /:id/convert ────────────────────────────────────────────────────
// Spawn one order per vendor (lines with same preferredVendorId merge into
// one order; lines with no preferred vendor go into a single "unassigned" order).
app.post('/:id/convert', requirePermission('requisitions', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'APPROVED') throw new ConflictError('Only APPROVED can be converted');

  const items = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.requisitionId, id));
  if (items.length === 0) throw new ValidationError('Cannot convert empty requisition');

  // Group by vendor (null = unassigned)
  const buckets = new Map<string, any[]>();
  for (const it of items) {
    const k = it.preferredVendorId ?? '__UNASSIGNED__';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(it);
  }

  const now = new Date().toISOString();
  const createdOrderIds: string[] = [];

  for (const [vendorKey, lines] of buckets.entries()) {
    const orderId = crypto.randomUUID();
    const vendorId = vendorKey === '__UNASSIGNED__' ? null : vendorKey;
    const orderTotal = lines.reduce(
      (s, l) => s + (l.quantity ?? 0) * (l.estimatedUnitPriceUsd ?? 0),
      0,
    );
    // Pre-fill minimum required fields. Orders table is the existing one — we use a subset.
    await db.insert(orders).values({
      id: orderId,
      identifier: `${row.requisitionNumber}-${createdOrderIds.length + 1}`,
      hospitalId: row.hospitalId,
      vendorId,
      providerId: null,
      facilityId: row.facilityId,
      departmentId: row.departmentId,
      status: 'PENDING',
      orderSubStatus: 'NEW_ORDER',
      requisitionId: id,
      createdAt: now,
      updatedAt: now,
    } as any);
    // Items
    for (const l of lines) {
      await db.insert(orderItems).values({
        id: crypto.randomUUID(),
        orderId,
        code: l.hcpcCode,
        description: l.description,
        quantity: l.quantity,
        createdAt: now,
      } as any);
    }
    createdOrderIds.push(orderId);
  }

  await db
    .update(requisitions)
    .set({
      status: 'CONVERTED',
      convertedAt: now,
      convertedOrderIds: JSON.stringify(createdOrderIds),
      updatedAt: now,
    })
    .where(eq(requisitions.id, id));
  await appendHistory(
    db,
    id,
    'CONVERTED',
    'APPROVED',
    'CONVERTED',
    user.id,
    `Converted into ${createdOrderIds.length} order(s)`,
  );

  return c.json({ id, status: 'CONVERTED', orderIds: createdOrderIds });
});

// ─── POST /:id/convert-to-po ──────────────────────────────────────────────
//
// Alternative conversion path (gap 3). Same fan-out logic as /convert, but
// emits `purchase_orders` rows instead of `orders` rows. POs are the
// procurement-document side; once created the transmission service can
// send them by EDI/API/PUNCHOUT/EMAIL/PORTAL (gap 4).
//
// Requisition lands in CONVERTED state; `convertedOrderIds` carries the new
// PO ids (the column is reused — it's a polymorphic pointer).
app.post('/:id/convert-to-po', requirePermission('requisitions', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuthorize(db, user, id);
  if (row.status !== 'APPROVED') {
    throw new ConflictError('Only APPROVED requisitions can be converted to POs');
  }
  const items = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.requisitionId, id));
  if (items.length === 0) throw new ValidationError('No items to convert');

  const buckets = new Map<string, any[]>();
  for (const it of items) {
    const k = it.preferredVendorId ?? '__UNASSIGNED__';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(it);
  }

  const now = new Date().toISOString();
  const createdPoIds: string[] = [];

  // Look up the next sequence number for the PO number.
  const seqDb = getDb(c.env.DB);
  await ensureSequenceTable(seqDb);
  for (const [vendorKey, lines] of buckets.entries()) {
    if (vendorKey === '__UNASSIGNED__') {
      // Skip unassigned lines — a PO requires a vendor. Caller should fix.
      continue;
    }
    const poId = crypto.randomUUID();
    const poNumberSeq = await getNextValue(seqDb, 'purchase_orders');
    const poNumber = `PO-${new Date().getFullYear()}-${String(poNumberSeq).padStart(5, '0')}`;
    const lineTotals = lines.map((l) => ({
      ...l,
      lineTotal: (l.quantity ?? 0) * (l.estimatedUnitPriceUsd ?? 0),
    }));
    const total = lineTotals.reduce((s, l) => s + l.lineTotal, 0);

    await db.insert(purchaseOrders).values({
      id: poId,
      number: poNumber,
      date: now.slice(0, 10),
      status: 'ORDER_COMPLETED',
      vendorId: vendorKey,
      hospitalId: row.hospitalId,
      requisitionId: id,
      totalUsd: total,
      currency: 'USD',
      neededByDate: row.neededByDate ?? null,
      notes: row.notes ?? null,
      createdByUserId: user.id,
      transmissionState: 'NOT_SENT',
      transmissionAttempts: 0,
      createdAt: now,
      updatedAt: now,
    } as any);

    for (const l of lineTotals) {
      await db.insert(purchaseOrderItems).values({
        id: crypto.randomUUID(),
        purchaseOrderId: poId,
        description: l.description,
        quantity: l.quantity,
        hcpcCode: l.hcpcCode,
        requisitionItemId: l.id,
        unitPriceUsd: l.estimatedUnitPriceUsd ?? null,
        lineTotalUsd: l.lineTotal,
        createdAt: now,
      } as any);
    }
    createdPoIds.push(poId);
  }

  if (createdPoIds.length === 0) {
    throw new ValidationError(
      'No POs created. Every line was unassigned — assign a preferred vendor first.',
    );
  }

  await db
    .update(requisitions)
    .set({
      status: 'CONVERTED',
      convertedAt: now,
      convertedOrderIds: JSON.stringify(createdPoIds),
      updatedAt: now,
    })
    .where(eq(requisitions.id, id));
  await appendHistory(
    db,
    id,
    'CONVERTED',
    'APPROVED',
    'CONVERTED',
    user.id,
    `Converted into ${createdPoIds.length} PO(s)`,
  );

  return c.json({ id, status: 'CONVERTED', purchaseOrderIds: createdPoIds });
});

// ─── POST /:id/emergency-review ───────────────────────────────────────────
// Manager triages an emergency-approved requisition post-hoc. Marks it
// REVIEWED_OK (acceptable use) or REVIEWED_FLAG (questionable — audit).
app.post('/:id/emergency-review', requirePermission('requisitions', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as { decision: 'REVIEWED_OK' | 'REVIEWED_FLAG'; note?: string };
  if (!['REVIEWED_OK', 'REVIEWED_FLAG'].includes(body.decision)) {
    throw new ValidationError('decision must be REVIEWED_OK or REVIEWED_FLAG');
  }
  const row = await loadAndAuthorize(db, user, id);
  if (row.emergencyReviewStatus !== 'PENDING_REVIEW') {
    throw new ConflictError(`Cannot review — emergencyReviewStatus is ${row.emergencyReviewStatus ?? 'NONE'}`);
  }
  const now = new Date().toISOString();
  await db.update(requisitions).set({
    emergencyReviewStatus: body.decision,
    emergencyReviewedAt: now,
    emergencyReviewedByUserId: user.id,
    updatedAt: now,
  }).where(eq(requisitions.id, id));
  await appendHistory(db, id, 'EMERGENCY_REVIEWED', null, null, user.id, `${body.decision}: ${body.note ?? ''}`);
  return c.json({ id, emergencyReviewStatus: body.decision });
});

// ─── GET /emergency-review-queue ──────────────────────────────────────────
// PENDING_REVIEW requisitions, hospital-scoped.
app.get('/emergency-review-queue', requirePermission('requisitions', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const conds: any[] = [eq(requisitions.emergencyReviewStatus, 'PENDING_REVIEW')];
  if (!isAdminRole(user)) {
    if (!user.hospitalId) throw new ForbiddenError('hospital scope required');
    conds.push(eq(requisitions.hospitalId, user.hospitalId));
  }
  const rows = await db
    .select().from(requisitions)
    .where(and(...conds))
    .orderBy(desc(requisitions.approvedAt))
    .limit(500);
  return c.json({ items: rows });
});

// ─── POST /:id/comment ────────────────────────────────────────────────────
app.post('/:id/comment', requirePermission('requisitions', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as { comment?: string };
  if (!body.comment?.trim()) throw new ValidationError('comment is required');
  await loadAndAuthorize(db, user, id);
  await appendHistory(db, id, 'COMMENT', null, null, user.id, body.comment.trim());
  return c.json({ id, ok: true });
});

export default app;

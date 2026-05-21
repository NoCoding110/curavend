/**
 * Approvals — unified triage queue for items awaiting decision.
 *
 * Aggregates orders that need attention from the current user's perspective:
 *   - HOSPITAL admins: orders in NEW_ORDER (need vendor) or
 *                      ORDER_REQUESTED_FOR_MODIFY (vendor asked to modify)
 *   - VENDOR admins:   orders in VENDOR_ASSIGNED (need vendor confirmation)
 *   - PROVIDER admins: same as HOSPITAL but scoped to their provider
 *   - ADMIN:           pending users + all orders awaiting any party
 *
 * Approve/reject delegate to the existing order status-transition logic in
 * routes/orders.ts (no duplicate business logic).
 */

import { Hono } from 'hono';
import { eq, and, sql, asc, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orders, users, orderHistory, contracts, vendors, hospitals } from '@curavend/db';
import { AppError, NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { assertOrderAccess } from './orders';
import {
  approveContract,
  rejectContract,
  requestContractChanges,
} from '../lib/contractTransitions';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

app.onError((err, c) => {
  const e = err as any;
  if (e && typeof e.statusCode === 'number' && typeof e.code === 'string') {
    return c.json({ error: e.message, code: e.code }, e.statusCode as any);
  }
  console.error('[approvals] Unhandled error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

type EntityType = 'order' | 'user' | 'contract';

interface QueueRow {
  entityType: EntityType;
  entityId: string;
  hospitalId: string | null;
  vendorId: string | null;
  pendingState: string;            // raw substatus / approvalStatus value
  summary: string;                  // short one-line description
  requestedByUserId: string | null;
  requestedAt: string;
  ageDays: number;
  actionUrl: string;                // frontend deep-link
}

function ageDays(iso: string): number {
  const created = new Date(iso).getTime();
  if (!created) return 0;
  return Math.floor((Date.now() - created) / 86_400_000);
}

/** Substatuses that count as "needs attention" depending on whose queue. */
const HOSPITAL_PENDING_SUBSTATUSES = ['NEW_ORDER', 'ORDER_REQUESTED_FOR_MODIFY'];
const VENDOR_PENDING_SUBSTATUSES   = ['VENDOR_ASSIGNED'];
const ALL_PENDING_SUBSTATUSES = [
  ...HOSPITAL_PENDING_SUBSTATUSES,
  ...VENDOR_PENDING_SUBSTATUSES,
];

function pendingSubstatusesFor(user: AuthUser): string[] {
  if (user.userType === 'ADMIN') return ALL_PENDING_SUBSTATUSES;
  if (user.userType === 'HOSPITAL' || user.userType === 'PROVIDER') {
    return HOSPITAL_PENDING_SUBSTATUSES;
  }
  if (user.userType === 'VENDOR' || user.userType === 'SUPER_VENDOR') {
    return VENDOR_PENDING_SUBSTATUSES;
  }
  return [];
}

// ─── GET /approvals/queue ───────────────────────────────────────────────────

app.get('/queue', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);

  const {
    type,           // 'order' | 'user' | 'all' (default 'all')
    facilityId,
    fromDate,
    toDate,
    limit: limitStr = '100',
    offset: offsetStr = '0',
  } = c.req.query();

  const limit = Math.min(Number(limitStr) || 100, 500);
  const offset = Number(offsetStr) || 0;

  const wantOrders = !type || type === 'all' || type === 'order';
  const wantUsers  = (!type || type === 'all' || type === 'user') &&
                     (user.userType === 'ADMIN' || user.role === 'ACCOUNT_MANAGER');
  const wantContracts = !type || type === 'all' || type === 'contract';

  const queueRows: QueueRow[] = [];

  // ── Orders ────────────────────────────────────────────────────────────
  if (wantOrders) {
    const subStatuses = pendingSubstatusesFor(user);
    if (subStatuses.length) {
      const orderConditions: any[] = [inArray(orders.orderSubStatus, subStatuses)];

      if (user.userType === 'HOSPITAL' && user.hospitalId) {
        orderConditions.push(eq(orders.hospitalId, user.hospitalId));
      } else if (user.userType === 'VENDOR' && user.vendorId) {
        orderConditions.push(eq(orders.vendorId, user.vendorId));
      } else if (user.userType === 'PROVIDER' && user.providerId) {
        orderConditions.push(eq(orders.providerId, user.providerId));
      } else if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
        orderConditions.push(eq(orders.superVendorId, user.superVendorId));
      }
      // ADMIN: no extra scoping

      if (facilityId) orderConditions.push(eq(orders.facilityId, facilityId));
      if (fromDate)   orderConditions.push(sql`${orders.createdAt} >= ${fromDate}`);
      if (toDate)     orderConditions.push(sql`${orders.createdAt} <= ${toDate}`);

      const orderRows = await db
        .select({
          id: orders.id,
          identifier: orders.identifier,
          orderSubStatus: orders.orderSubStatus,
          hospitalId: orders.hospitalId,
          vendorId: orders.vendorId,
          patientName: orders.patientName,
          patientLastName: orders.patientLastName,
          changedByUserId: orders.changedByUserId,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          modifyReason: orders.modifyReason,
        })
        .from(orders)
        .where(and(...orderConditions))
        .orderBy(asc(orders.createdAt))
        .limit(limit)
        .offset(offset);

      for (const o of orderRows) {
        const patient = [o.patientName, o.patientLastName].filter(Boolean).join(' ') || 'Patient';
        const ident = o.identifier ?? o.id.slice(0, 8);
        let summary = '';
        switch (o.orderSubStatus) {
          case 'NEW_ORDER':
            summary = `New order ${ident} for ${patient} — needs vendor assignment`;
            break;
          case 'ORDER_REQUESTED_FOR_MODIFY':
            summary = `Order ${ident} for ${patient} — vendor requested modification${o.modifyReason ? `: ${o.modifyReason}` : ''}`;
            break;
          case 'VENDOR_ASSIGNED':
            summary = `Order ${ident} for ${patient} — awaiting vendor receipt confirmation`;
            break;
          default:
            summary = `Order ${ident} for ${patient} — ${o.orderSubStatus}`;
        }
        queueRows.push({
          entityType: 'order',
          entityId: o.id,
          hospitalId: o.hospitalId ?? null,
          vendorId: o.vendorId ?? null,
          pendingState: o.orderSubStatus,
          summary,
          requestedByUserId: o.changedByUserId ?? null,
          requestedAt: o.updatedAt ?? o.createdAt,
          ageDays: ageDays(o.updatedAt ?? o.createdAt),
          actionUrl: `/provider-orders/${o.id}`,
        });
      }
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────
  if (wantUsers) {
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        userType: users.userType,
        role: users.role,
        hospitalId: users.hospitalId,
        vendorId: users.vendorId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.approvalStatus, 'PENDING'))
      .orderBy(asc(users.createdAt))
      .limit(limit);

    for (const u of userRows) {
      queueRows.push({
        entityType: 'user',
        entityId: u.id,
        hospitalId: u.hospitalId ?? null,
        vendorId: u.vendorId ?? null,
        pendingState: 'PENDING',
        summary: `${u.name ?? u.email} — ${u.role} ${u.userType}${u.email ? ` (${u.email})` : ''}`,
        requestedByUserId: null,
        requestedAt: u.createdAt,
        ageDays: ageDays(u.createdAt),
        actionUrl: `/admin/approvals?focus=${u.id}`,
      });
    }
  }

  // ── Contracts ────────────────────────────────────────────────────────
  // Show PENDING_APPROVAL contracts that the current user is allowed to
  // review (counterparty side, or ADMIN). Drafted-by-me contracts that I
  // submitted are NOT shown here — they're shown on the contract detail page.
  if (wantContracts) {
    const contractConditions: any[] = [eq(contracts.status, 'PENDING_APPROVAL')];

    if (user.userType === 'HOSPITAL' && user.hospitalId) {
      // Hospital sees contracts pending where they are the counterparty
      // (i.e. initiated by the vendor side, hospital must approve)
      contractConditions.push(eq(contracts.hospitalId, user.hospitalId));
      contractConditions.push(eq(contracts.initiatedBy, 'VENDOR'));
    } else if (user.userType === 'VENDOR' && user.vendorId) {
      contractConditions.push(eq(contracts.vendorId, user.vendorId));
      contractConditions.push(eq(contracts.initiatedBy, 'HOSPITAL'));
    } else if (user.userType !== 'ADMIN') {
      // PROVIDER and SUPER_VENDOR don't currently approve contracts
      contractConditions.push(sql`1 = 0`);
    }

    const contractRows = await db
      .select({
        id: contracts.id,
        name: contracts.name,
        hospitalId: contracts.hospitalId,
        vendorId: contracts.vendorId,
        initiatedBy: contracts.initiatedBy,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        updatedAt: contracts.updatedAt,
        createdAt: contracts.createdAt,
        hospitalName: hospitals.name,
        vendorName: vendors.name,
      })
      .from(contracts)
      .leftJoin(hospitals, eq(contracts.hospitalId, hospitals.id))
      .leftJoin(vendors, eq(contracts.vendorId, vendors.id))
      .where(and(...contractConditions))
      .orderBy(asc(contracts.updatedAt))
      .limit(limit);

    for (const ct of contractRows) {
      const title = ct.name ?? `Contract ${ct.id.slice(0, 8)}`;
      const parties = [ct.hospitalName, ct.vendorName].filter(Boolean).join(' ↔ ');
      const drafter = ct.initiatedBy === 'HOSPITAL' ? ct.hospitalName : ct.vendorName;
      const summary = `${title} (${parties}) — submitted by ${drafter ?? 'counterparty'} for your review`;
      queueRows.push({
        entityType: 'contract',
        entityId: ct.id,
        hospitalId: ct.hospitalId ?? null,
        vendorId: ct.vendorId ?? null,
        pendingState: 'PENDING_APPROVAL',
        summary,
        requestedByUserId: null,
        requestedAt: ct.updatedAt ?? ct.createdAt,
        ageDays: ageDays(ct.updatedAt ?? ct.createdAt),
        actionUrl: `/contracts/${ct.id}`,
      });
    }
  }

  // Sort combined list — oldest first (stalest floats to top)
  queueRows.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));

  return c.json({
    items: queueRows,
    total: queueRows.length,
    counts: {
      order: queueRows.filter((r) => r.entityType === 'order').length,
      user:  queueRows.filter((r) => r.entityType === 'user').length,
      contract: queueRows.filter((r) => r.entityType === 'contract').length,
    },
  });
});

// ─── POST /approvals/:type/:id/approve ──────────────────────────────────────
//
// Dispatcher: route to the correct underlying transition based on entityType.
// Each branch reuses existing business logic, never duplicates it.

app.post('/:type/:id/approve', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const { type, id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  if (type === 'order') {
    return await approveOrder(c, db, user, id, body);
  }
  if (type === 'user') {
    if (user.role !== 'ACCOUNT_MANAGER' && user.role !== 'ACCOUNT_MANAGER_USER') {
      throw new ForbiddenError('Only account managers can approve user registrations');
    }
    const row = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0]);
    if (!row) throw new NotFoundError('User not found');
    await db.update(users).set({
      approvalStatus: 'APPROVED',
      userStatus: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, id));
    return c.json({ success: true, entityType: 'user', entityId: id });
  }
  if (type === 'contract') {
    const result = await approveContract(c.env, user, id);
    return c.json({ success: true, entityType: 'contract', entityId: id, ...result });
  }

  throw new ValidationError(`Unsupported approval entity type: ${type}`);
});

// ─── POST /approvals/:type/:id/reject ───────────────────────────────────────

app.post('/:type/:id/reject', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const { type, id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const reason: string | undefined = body.reason;

  if (type === 'order') {
    return await rejectOrder(c, db, user, id, reason);
  }
  if (type === 'user') {
    if (user.role !== 'ACCOUNT_MANAGER' && user.role !== 'ACCOUNT_MANAGER_USER') {
      throw new ForbiddenError('Only account managers can reject user registrations');
    }
    const row = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0]);
    if (!row) throw new NotFoundError('User not found');
    await db.update(users).set({
      approvalStatus: 'REJECTED',
      userStatus: 'INACTIVE',
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, id));
    return c.json({ success: true, entityType: 'user', entityId: id });
  }
  if (type === 'contract') {
    const result = await rejectContract(c.env, user, id, reason);
    return c.json({ success: true, entityType: 'contract', entityId: id, ...result });
  }

  throw new ValidationError(`Unsupported approval entity type: ${type}`);
});

// ─── POST /approvals/bulk-approve ──────────────────────────────────────────
//
// Bulk action — accepts up to 50 (entityType, entityId) pairs.
// Per-item failures are aggregated; partial success is reported.

app.post('/bulk-approve', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const items: Array<{ entityType: string; entityId: string }> = body.items ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('items[] is required and must be non-empty');
  }
  if (items.length > 50) {
    throw new ValidationError('Bulk-approve limited to 50 items per call');
  }

  const results: Array<{ entityType: string; entityId: string; status: 'OK' | 'FAILED'; error?: string }> = [];

  for (const item of items) {
    try {
      if (item.entityType === 'order') {
        await approveOrderRaw(db, user, item.entityId);
      } else if (item.entityType === 'user') {
        if (user.role !== 'ACCOUNT_MANAGER' && user.role !== 'ACCOUNT_MANAGER_USER') {
          throw new ForbiddenError('Only account managers can approve users');
        }
        const row = await db.select().from(users).where(eq(users.id, item.entityId)).limit(1).then(r => r[0]);
        if (!row) throw new NotFoundError('User not found');
        await db.update(users).set({
          approvalStatus: 'APPROVED',
          userStatus: 'ACTIVE',
          updatedAt: new Date().toISOString(),
        }).where(eq(users.id, item.entityId));
      } else {
        throw new ValidationError(`Unsupported entity type: ${item.entityType}`);
      }
      results.push({ ...item, status: 'OK' });
    } catch (err: any) {
      results.push({ ...item, status: 'FAILED', error: err?.message ?? 'unknown' });
    }
  }

  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  return c.json({
    results,
    succeeded: results.length - failedCount,
    failed: failedCount,
  });
});

// ─── Internal helpers (reuse order-status logic) ────────────────────────────

async function approveOrder(c: any, db: any, user: AuthUser, id: string, body: any) {
  await approveOrderRaw(db, user, id, body.vendorId);
  return c.json({ success: true, entityType: 'order', entityId: id });
}

/**
 * Approve an order based on its current substatus:
 *   - NEW_ORDER → VENDOR_ASSIGNED (requires vendorId in body if not already set)
 *   - VENDOR_ASSIGNED → VENDOR_CONFIRMED_RECEIPT (vendor side)
 *   - ORDER_REQUESTED_FOR_MODIFY → VENDOR_ASSIGNED (re-accept after modification)
 */
async function approveOrderRaw(db: any, user: AuthUser, id: string, vendorIdOverride?: string) {
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Order not found');
  const order = existing[0];
  assertOrderAccess(user, order);

  const now = new Date().toISOString();
  let nextSubStatus: string;
  const updateData: any = { updatedAt: now, changedByUserId: user.id };

  switch (order.orderSubStatus) {
    case 'NEW_ORDER':
    case 'ORDER_REQUESTED_FOR_MODIFY':
      nextSubStatus = 'VENDOR_ASSIGNED';
      if (vendorIdOverride) updateData.vendorId = vendorIdOverride;
      if (!order.vendorId && !vendorIdOverride) {
        throw new ValidationError('Cannot assign vendor — order has no vendor; provide vendorId in request body');
      }
      break;
    case 'VENDOR_ASSIGNED':
      nextSubStatus = 'VENDOR_CONFIRMED_RECEIPT';
      break;
    default:
      throw new ValidationError(`Order in state ${order.orderSubStatus} is not awaiting approval`);
  }

  let history: any[] = [];
  try { history = JSON.parse(order.orderSubStatusHistory ?? '[]'); } catch { /* empty */ }
  history.push({ status: nextSubStatus, timestamp: now, actor: user.id });

  updateData.status = 'IN_PROGRESS';
  updateData.orderSubStatus = nextSubStatus;
  updateData.orderSubStatusHistory = JSON.stringify(history);

  await db.update(orders).set(updateData).where(eq(orders.id, id));

  await db.insert(orderHistory).values({
    orderId: id,
    changedByUserId: user.id,
    description: `Approved by ${user.email} → ${nextSubStatus}`,
  });
}

async function rejectOrder(c: any, db: any, user: AuthUser, id: string, reason?: string) {
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Order not found');
  const order = existing[0];
  assertOrderAccess(user, order);

  const now = new Date().toISOString();
  let nextSubStatus: string;

  // Vendors decline; hospitals cancel.
  if (user.userType === 'VENDOR' || user.userType === 'SUPER_VENDOR') {
    nextSubStatus = 'VENDOR_DECLINED';
  } else {
    nextSubStatus = 'FACILITY_CANCELLED';
  }

  let history: any[] = [];
  try { history = JSON.parse(order.orderSubStatusHistory ?? '[]'); } catch { /* empty */ }
  history.push({ status: nextSubStatus, timestamp: now, actor: user.id, reason });

  await db.update(orders).set({
    status: 'CANCELLED',
    orderSubStatus: nextSubStatus,
    orderSubStatusHistory: JSON.stringify(history),
    declineReason: reason ?? null,
    changedByUserId: user.id,
    updatedAt: now,
  }).where(eq(orders.id, id));

  await db.insert(orderHistory).values({
    orderId: id,
    changedByUserId: user.id,
    description: `Rejected by ${user.email} → ${nextSubStatus}${reason ? `: ${reason}` : ''}`,
  });

  return c.json({ success: true, entityType: 'order', entityId: id, newSubStatus: nextSubStatus });
}

export default app;

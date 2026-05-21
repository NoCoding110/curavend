/**
 * /api/vendor-erp-connectors — Phase E: admin / vendor / super-vendor CRUD
 * for ERP push connector configuration. Hospital users have NO access.
 *
 * Also exposes:
 *   POST /:id/test-push  — manually fire a synthetic push attempt
 *   GET  /push-log       — recent push log entries (admin: all; vendor: own)
 */

import { Hono } from 'hono';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorErpConnectors,
  vendorErpPushLog,
  vendors,
  orders,
} from '@curavend/db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  AppError,
} from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { pushOrderToErp } from '../jobs/pushOrderToErp';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// Sub-router error handler — mirrors the global one in index.ts so AppErrors
// surface as structured JSON rather than Hono's default plain-500.
app.onError((err, c) => {
  const e = err as any;
  if (e && typeof e.statusCode === 'number' && typeof e.code === 'string') {
    return c.json({ error: e.message, code: e.code }, e.statusCode as any);
  }
  console.error('[vendor-erp-connectors] Unhandled error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

const VALID_TYPES = new Set(['HTTP_POST', 'WEBHOOK_POST', 'EDI_850', 'MANUAL']);
const VALID_TRIGGERS = new Set([
  'NEW_ORDER',
  'VENDOR_ASSIGNED',
  'VENDOR_CONFIRMED_RECEIPT',
  'PATIENT_VISITED_AND_ASSESSED',
  'DELIVERED',
  'PROOF_UPLOADED',
  'ORDER_COMPLETED',
]);

function assertWriteScope(user: AuthUser, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  if (user.userType === 'SUPER_VENDOR' && user.superVendorId) return;
  throw new ForbiddenError('Access denied');
}

// GET /vendor-erp-connectors
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const queryVendorId = c.req.query('vendorId');

  if (user.userType === 'HOSPITAL' || user.userType === 'PROVIDER') {
    throw new ForbiddenError('ERP connector configuration is vendor-side only');
  }

  const conditions: any[] = [];
  if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(vendorErpConnectors.vendorId, user.vendorId));
  } else if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
    const childIds = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.superVendorId, user.superVendorId));
    const ids = childIds.map((r) => r.id);
    if (ids.length === 0) return c.json({ items: [] });
    conditions.push(
      inArray(
        vendorErpConnectors.vendorId,
        queryVendorId ? [queryVendorId] : ids,
      ),
    );
  } else {
    // ADMIN — optional filter
    if (queryVendorId) conditions.push(eq(vendorErpConnectors.vendorId, queryVendorId));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await (where ? db.select().from(vendorErpConnectors).where(where) : db.select().from(vendorErpConnectors));
  return c.json({ items: rows });
});

// GET /vendor-erp-connectors/:id
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await db.select().from(vendorErpConnectors).where(eq(vendorErpConnectors.id, id)).limit(1).then((r) => r[0]);
  if (!row) throw new NotFoundError('Connector not found');
  assertWriteScope(user, row.vendorId);
  return c.json(row);
});

// POST /vendor-erp-connectors
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  const vendorId: string =
    user.userType === 'VENDOR' && user.vendorId ? user.vendorId : body.vendorId;
  if (!vendorId) throw new ValidationError('vendorId is required');
  assertWriteScope(user, vendorId);

  const connectorType = body.connectorType;
  if (!connectorType || !VALID_TYPES.has(connectorType)) {
    throw new ValidationError(`connectorType must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
  const triggerEvent = body.triggerEvent ?? 'VENDOR_CONFIRMED_RECEIPT';
  if (!VALID_TRIGGERS.has(triggerEvent)) {
    throw new ValidationError(`triggerEvent must be one of: ${[...VALID_TRIGGERS].join(', ')}`);
  }

  // config must serialize as JSON; validate field-map shape if present
  let configString: string | null = null;
  if (body.config !== undefined && body.config !== null) {
    if (typeof body.config === 'string') {
      try { JSON.parse(body.config); } catch { throw new ValidationError('config is not valid JSON'); }
      configString = body.config;
    } else if (typeof body.config === 'object') {
      configString = JSON.stringify(body.config);
    } else {
      throw new ValidationError('config must be an object or JSON string');
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(vendorErpConnectors).values({
    id,
    vendorId,
    connectorType,
    endpointUrl: body.endpointUrl ?? null,
    authSecretRef: body.authSecretRef ?? null,
    triggerEvent,
    config: configString,
    isActive: body.isActive === false ? 0 : 1,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.select().from(vendorErpConnectors).where(eq(vendorErpConnectors.id, id)).limit(1).then((r) => r[0]);
  return c.json(created, 201);
});

// PUT /vendor-erp-connectors/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.select().from(vendorErpConnectors).where(eq(vendorErpConnectors.id, id)).limit(1).then((r) => r[0]);
  if (!existing) throw new NotFoundError('Connector not found');
  assertWriteScope(user, existing.vendorId);

  const updates: any = { updatedAt: new Date().toISOString() };

  if (body.connectorType !== undefined) {
    if (!VALID_TYPES.has(body.connectorType)) {
      throw new ValidationError(`connectorType must be one of: ${[...VALID_TYPES].join(', ')}`);
    }
    updates.connectorType = body.connectorType;
  }
  if (body.triggerEvent !== undefined) {
    if (!VALID_TRIGGERS.has(body.triggerEvent)) {
      throw new ValidationError(`triggerEvent must be one of: ${[...VALID_TRIGGERS].join(', ')}`);
    }
    updates.triggerEvent = body.triggerEvent;
  }
  if (body.endpointUrl !== undefined) updates.endpointUrl = body.endpointUrl;
  if (body.authSecretRef !== undefined) updates.authSecretRef = body.authSecretRef;
  if (body.isActive !== undefined) updates.isActive = body.isActive ? 1 : 0;
  if (body.config !== undefined) {
    if (body.config === null) updates.config = null;
    else if (typeof body.config === 'string') {
      try { JSON.parse(body.config); } catch { throw new ValidationError('config is not valid JSON'); }
      updates.config = body.config;
    } else if (typeof body.config === 'object') {
      updates.config = JSON.stringify(body.config);
    }
  }

  await db.update(vendorErpConnectors).set(updates).where(eq(vendorErpConnectors.id, id));

  const fresh = await db.select().from(vendorErpConnectors).where(eq(vendorErpConnectors.id, id)).limit(1).then((r) => r[0]);
  return c.json(fresh);
});

// DELETE /vendor-erp-connectors/:id
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const existing = await db.select().from(vendorErpConnectors).where(eq(vendorErpConnectors.id, id)).limit(1).then((r) => r[0]);
  if (!existing) throw new NotFoundError('Connector not found');
  assertWriteScope(user, existing.vendorId);

  await db.delete(vendorErpConnectors).where(eq(vendorErpConnectors.id, id));
  return c.json({ success: true });
});

// POST /vendor-erp-connectors/:id/test-push
//
// Picks a recent order for the connector's vendor, runs the full transform +
// HTTP push, and reports the result. Useful for verifying field maps before
// going live. Rate-limited to 1 call per 30 s per connector via KV.
app.post('/:id/test-push', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const user = c.get('user');
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));

    const conn = await db.select().from(vendorErpConnectors).where(eq(vendorErpConnectors.id, id)).limit(1).then((r) => r[0]);
    if (!conn) return c.json({ error: 'Connector not found', code: 'NOT_FOUND' }, 404);

    // Scope check (throws ForbiddenError for non-admin non-owner)
    try {
      assertWriteScope(user, conn.vendorId);
    } catch {
      return c.json({ error: 'Access denied', code: 'FORBIDDEN' }, 403);
    }

    // KV rate-limit
    const rlKey = `rl:erp-test:${id}`;
    let recent: string | null = null;
    try {
      recent = await c.env.KV.get(rlKey);
    } catch {
      // KV unavailable — skip rate limit rather than erroring
    }
    if (recent) {
      return c.json(
        { error: 'Test pushes are limited to 1 per 30 seconds per connector', code: 'RATE_LIMITED' },
        429,
      );
    }
    try {
      await c.env.KV.put(rlKey, '1', { expirationTtl: 30 });
    } catch {
      // Non-fatal — proceed without rate-limit enforcement
    }

    // Pick the order: caller-supplied id, otherwise the vendor's most recent
    let orderId: string | undefined = body.orderId;
    if (!orderId) {
      const recentOrder = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.vendorId, conn.vendorId))
        .orderBy(desc(orders.createdAt))
        .limit(1)
        .then((r) => r[0]);
      if (!recentOrder) {
        return c.json(
          { error: 'No orders exist for this vendor — pass orderId in the body to test against a specific order', code: 'NOT_FOUND' },
          404,
        );
      }
      orderId = recentOrder.id;
    }

    // Force the trigger to match the connector's configured event so the push
    // actually runs even if the order isn't in that state.
    const result = await pushOrderToErp(c.env, {
      orderId,
      triggerEvent: conn.triggerEvent,
    });
    const mine = result.find((r) => r.connectorId === id);

    return c.json({
      orderId,
      triggerEvent: conn.triggerEvent,
      result: mine ?? { connectorId: id, attempts: 0, finalStatus: 'NOT_RUN' },
      note: mine
        ? mine.finalStatus === 'OK'
          ? 'Push succeeded — check vendor_erp_push_log for full request/response'
          : `Push failed: ${mine.error ?? 'see log'}`
        : 'Connector did not match its own trigger — possible isActive=0 or stale state',
    });
  } catch (err: any) {
    console.error('[test-push] Unhandled error:', err?.message ?? err);
    return c.json({ error: err?.message ?? 'Internal error during test push', code: 'INTERNAL_ERROR' }, 500);
  }
});

// GET /vendor-erp-connectors/push-log
app.get('/push-log/recent', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { connectorId, orderId, limit = '100' } = c.req.query();

  const filters: any[] = [];
  if (connectorId) filters.push(eq(vendorErpPushLog.connectorId, connectorId));
  if (orderId) filters.push(eq(vendorErpPushLog.orderId, orderId));

  // Tenant scoping: vendor users can only see their own connector ids
  if (user.userType === 'VENDOR' && user.vendorId) {
    const ownConnectorIds = await db
      .select({ id: vendorErpConnectors.id })
      .from(vendorErpConnectors)
      .where(eq(vendorErpConnectors.vendorId, user.vendorId))
      .then((rs) => rs.map((r) => r.id));
    if (ownConnectorIds.length === 0) return c.json({ items: [] });
    filters.push(inArray(vendorErpPushLog.connectorId, ownConnectorIds));
  } else if (user.userType === 'HOSPITAL' || user.userType === 'PROVIDER') {
    throw new ForbiddenError('Push log is vendor-side only');
  }

  const where = filters.length ? and(...filters) : undefined;
  const baseQuery = db
    .select()
    .from(vendorErpPushLog)
    .orderBy(desc(vendorErpPushLog.pushedAt))
    .limit(Math.min(Number(limit) || 100, 500));

  const rows = await (where ? baseQuery.where(where) : baseQuery);
  return c.json({ items: rows });
});

export default app;

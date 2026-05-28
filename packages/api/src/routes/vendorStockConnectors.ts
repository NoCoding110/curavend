/**
 * /api/vendor-stock-connectors — Phase D: admin / vendor / super-vendor CRUD
 * for stock-feed connector configuration. Hospital users have NO access.
 *
 * Also exposes:
 *   POST /:id/test-poll  — manually fire a poll for an HTTP_POLL connector
 *   POST /run-all-now    — admin: poll every active HTTP_POLL connector now
 */

import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorStockConnectors,
  vendorStockSnapshots,
  vendorStockFeedLog,
  vendorLocations,
  vendors,
} from '@curavend/db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../lib/errors';
import type { Env } from '../lib/env';
import { safeFetch } from '../lib/safeFetch';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

const VALID_TYPES = new Set(['HTTP_POLL', 'WEBHOOK', 'EDI_846', 'MANUAL']);

function assertConnectorWriteScope(user: any, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  if (user.userType === 'SUPER_VENDOR' && user.superVendorId) return;
  throw new ForbiddenError('Access denied');
}

// GET /vendor-stock-connectors
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const queryVendorId = c.req.query('vendorId');

  if (user.userType === 'HOSPITAL' || user.userType === 'PROVIDER') {
    throw new ForbiddenError(
      'Stock connector configuration is vendor-side only',
    );
  }

  const conditions: any[] = [];
  if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(vendorStockConnectors.vendorId, user.vendorId));
  } else if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
    const childIds = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.superVendorId, user.superVendorId));
    const ids = childIds.map((r) => r.id);
    if (ids.length === 0) return c.json({ items: [] });
    conditions.push(
      inArray(
        vendorStockConnectors.vendorId,
        queryVendorId ? [queryVendorId] : ids,
      ),
    );
  } else {
    if (queryVendorId)
      conditions.push(eq(vendorStockConnectors.vendorId, queryVendorId));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(vendorStockConnectors).where(where);
  return c.json({ items: rows });
});

// GET /vendor-stock-connectors/:id
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Connector not found');
  assertConnectorWriteScope(user, rows[0].vendorId);
  return c.json(rows[0]);
});

// POST /vendor-stock-connectors
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  const vendorId: string =
    user.userType === 'VENDOR' && user.vendorId ? user.vendorId : body.vendorId;
  if (!vendorId) throw new ValidationError('vendorId is required');
  assertConnectorWriteScope(user, vendorId);

  const connectorType = body.connectorType;
  if (!VALID_TYPES.has(connectorType)) {
    throw new ValidationError(
      `connectorType must be one of: ${[...VALID_TYPES].join(', ')}`,
    );
  }

  if (
    (connectorType === 'HTTP_POLL' || connectorType === 'WEBHOOK') &&
    !body.endpointUrl
  ) {
    throw new ValidationError(
      `endpointUrl is required for ${connectorType} connectors`,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(vendorStockConnectors).values({
    id,
    vendorId,
    connectorType,
    endpointUrl: body.endpointUrl ?? null,
    authSecretRef: body.authSecretRef ?? null,
    pollIntervalMinutes: Math.max(
      1,
      Number(body.pollIntervalMinutes ?? 15),
    ),
    isActive: body.isActive === false ? 0 : 1,
    config: body.config ? JSON.stringify(body.config) : null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  return c.json(created[0], 201);
});

// PUT /vendor-stock-connectors/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('Connector not found');
  assertConnectorWriteScope(user, existing[0].vendorId);

  const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.endpointUrl !== undefined) patch.endpointUrl = body.endpointUrl;
  if (body.authSecretRef !== undefined)
    patch.authSecretRef = body.authSecretRef;
  if (body.pollIntervalMinutes !== undefined)
    patch.pollIntervalMinutes = Math.max(1, Number(body.pollIntervalMinutes));
  if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
  if (body.config !== undefined)
    patch.config = body.config ? JSON.stringify(body.config) : null;

  await db
    .update(vendorStockConnectors)
    .set(patch)
    .where(eq(vendorStockConnectors.id, id));

  const updated = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  return c.json(updated[0]);
});

// DELETE /vendor-stock-connectors/:id — soft delete
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  if (!existing.length) throw new NotFoundError('Connector not found');
  assertConnectorWriteScope(user, existing[0].vendorId);

  await db
    .update(vendorStockConnectors)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(vendorStockConnectors.id, id));
  return c.json({ ok: true });
});

// ─────────────── Manual poll trigger ───────────────────────────────

interface FeedRow {
  vendorSku: string;
  locationId: string;
  qtyOnHand?: number;
  quantityOnHand?: number;
  available?: number;
  availableQuantity?: number;
  observedAt?: string;
  hcpcCode?: string;
}

/**
 * Run one HTTP_POLL connector. Returns log shape for persistence.
 */
async function runHttpPollConnector(
  c: any,
  conn: typeof vendorStockConnectors.$inferSelect,
): Promise<{ status: 'OK' | 'PARTIAL' | 'FAILED'; rowsWritten: number; errorSummary: string | null; durationMs: number }> {
  const db = getDb(c.env.DB);
  const t0 = Date.now();
  try {
    if (!conn.endpointUrl) {
      return {
        status: 'FAILED',
        rowsWritten: 0,
        errorSummary: 'endpointUrl missing',
        durationMs: Date.now() - t0,
      };
    }

    // Resolve auth secret from wrangler secrets if referenced
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'curavend-stock-poller/1.0',
    };
    if (conn.authSecretRef) {
      const secret = (c.env as any)[conn.authSecretRef];
      if (secret) headers.Authorization = `Bearer ${secret}`;
    }

    const resp = await safeFetch(conn.endpointUrl, {
      headers,
      cf: { cacheTtl: 0 },
    } as any);

    if (!resp.ok) {
      return {
        status: 'FAILED',
        rowsWritten: 0,
        errorSummary: `HTTP ${resp.status} ${resp.statusText}`.slice(0, 500),
        durationMs: Date.now() - t0,
      };
    }

    const raw = (await resp.json()) as FeedRow[] | { items?: FeedRow[] };
    const rows: FeedRow[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any).items)
        ? (raw as any).items
        : [];

    if (rows.length === 0) {
      return {
        status: 'OK',
        rowsWritten: 0,
        errorSummary: null,
        durationMs: Date.now() - t0,
      };
    }

    // Confirm referenced location ids belong to this vendor (defensive)
    const locIds = Array.from(new Set(rows.map((r) => r.locationId)));
    const validLocs = await db
      .select({ id: vendorLocations.id })
      .from(vendorLocations)
      .where(
        and(
          eq(vendorLocations.vendorId, conn.vendorId),
          inArray(vendorLocations.id, locIds),
        ),
      );
    const validLocSet = new Set(validLocs.map((l) => l.id));

    const now = new Date().toISOString();
    let written = 0;
    let skipped = 0;
    for (const r of rows) {
      if (!r.vendorSku || !r.locationId) {
        skipped++;
        continue;
      }
      if (!validLocSet.has(r.locationId)) {
        skipped++;
        continue;
      }
      const qty =
        Number(r.quantityOnHand ?? r.qtyOnHand ?? 0) | 0;
      const avail =
        r.availableQuantity != null
          ? Number(r.availableQuantity) | 0
          : r.available != null
            ? Number(r.available) | 0
            : null;
      const observedAt = r.observedAt ?? now;

      // Upsert via on-conflict-update on the unique index
      await db
        .insert(vendorStockSnapshots)
        .values({
          id: crypto.randomUUID(),
          vendorId: conn.vendorId,
          vendorLocationId: r.locationId,
          vendorSku: r.vendorSku,
          hcpcCode: r.hcpcCode ?? null,
          quantityOnHand: qty,
          availableQuantity: avail,
          source: conn.connectorType,
          observedAt,
          ingestedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            vendorStockSnapshots.vendorId,
            vendorStockSnapshots.vendorLocationId,
            vendorStockSnapshots.vendorSku,
          ],
          set: {
            quantityOnHand: qty,
            availableQuantity: avail,
            hcpcCode: r.hcpcCode ?? null,
            source: conn.connectorType,
            observedAt,
            ingestedAt: now,
          },
        });
      written++;
    }

    // Update connector last_*
    await db
      .update(vendorStockConnectors)
      .set({
        lastPolledAt: now,
        lastSuccessAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(vendorStockConnectors.id, conn.id));

    return {
      status: skipped > 0 ? 'PARTIAL' : 'OK',
      rowsWritten: written,
      errorSummary:
        skipped > 0
          ? `${skipped} row(s) skipped (unknown SKU or location)`
          : null,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    const now = new Date().toISOString();
    await db
      .update(vendorStockConnectors)
      .set({
        lastPolledAt: now,
        lastError: String(err?.message || err).slice(0, 500),
        updatedAt: now,
      })
      .where(eq(vendorStockConnectors.id, conn.id));
    return {
      status: 'FAILED',
      rowsWritten: 0,
      errorSummary: String(err?.message || err).slice(0, 500),
      durationMs: Date.now() - t0,
    };
  }
}

/**
 * Walk every active HTTP_POLL connector, fetch its feed, persist snapshots.
 * Used by scheduled cron and the run-all-now admin endpoint.
 */
export async function runAllStockPolls(c: any): Promise<{
  attempted: number;
  ok: number;
  failed: number;
}> {
  const db = getDb(c.env.DB);
  const conns = await db
    .select()
    .from(vendorStockConnectors)
    .where(
      and(
        eq(vendorStockConnectors.isActive, 1),
        eq(vendorStockConnectors.connectorType, 'HTTP_POLL'),
      ),
    );

  let ok = 0;
  let failed = 0;
  for (const conn of conns) {
    const result = await runHttpPollConnector(c, conn);
    await db.insert(vendorStockFeedLog).values({
      id: crypto.randomUUID(),
      connectorId: conn.id,
      status: result.status,
      rowsWritten: result.rowsWritten,
      errorSummary: result.errorSummary,
      durationMs: result.durationMs,
      ranAt: new Date().toISOString(),
    });
    if (result.status === 'FAILED') failed++;
    else ok++;
  }
  return { attempted: conns.length, ok, failed };
}

// POST /:id/test-poll — admin/vendor: trigger a single connector now
app.post('/:id/test-poll', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Connector not found');
  assertConnectorWriteScope(user, rows[0].vendorId);

  if (rows[0].connectorType !== 'HTTP_POLL') {
    throw new ValidationError(
      `test-poll only supported for HTTP_POLL connectors (got ${rows[0].connectorType})`,
    );
  }

  const result = await runHttpPollConnector(c, rows[0]);
  await db.insert(vendorStockFeedLog).values({
    id: crypto.randomUUID(),
    connectorId: id,
    status: result.status,
    rowsWritten: result.rowsWritten,
    errorSummary: result.errorSummary,
    durationMs: result.durationMs,
    ranAt: new Date().toISOString(),
  });
  return c.json(result);
});

// POST /run-all-now — admin only
app.post('/run-all-now', async (c) => {
  const user = c.get('user');
  if (user.userType !== 'ADMIN') {
    throw new ForbiddenError('Admin only');
  }
  const result = await runAllStockPolls(c);
  return c.json(result);
});

// GET /:id/log — recent feed log entries
app.get('/:id/log', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(vendorStockConnectors)
    .where(eq(vendorStockConnectors.id, id))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Connector not found');
  assertConnectorWriteScope(user, rows[0].vendorId);

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20),
  );
  const log = await db
    .select()
    .from(vendorStockFeedLog)
    .where(eq(vendorStockFeedLog.connectorId, id))
    .orderBy(sql`${vendorStockFeedLog.ranAt} DESC`)
    .limit(limit);
  return c.json({ items: log });
});

export default app;

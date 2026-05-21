/**
 * /api/stock-feeds — Phase D unauthenticated webhook receiver for vendor
 * stock pushes. HMAC-verified per connector secret. NOT JWT-gated.
 *
 *   POST /api/stock-feeds/:vendorId/webhook
 *     Headers:
 *       X-Curavend-Signature: <hex hmac-sha256(body, secret)>
 *       X-Curavend-Timestamp: <ISO8601>   (rejected if drift > 5min)
 *     Body: VendorStockFeedRow[] (same shape as HTTP_POLL response)
 */

import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorStockConnectors,
  vendorStockSnapshots,
  vendorStockFeedLog,
  vendorLocations,
} from '@curavend/db';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env }>();

const MAX_DRIFT_MS = 5 * 60 * 1000; // 5 min replay window

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

app.post('/:vendorId/webhook', async (c) => {
  const db = getDb(c.env.DB);
  const { vendorId } = c.req.param();
  const sigHeader = c.req.header('x-curavend-signature') ?? '';
  const tsHeader = c.req.header('x-curavend-timestamp') ?? '';
  const rawBody = await c.req.text();

  // Replay protection
  const ts = Date.parse(tsHeader);
  if (!Number.isFinite(ts)) {
    return c.json(
      { error: 'X-Curavend-Timestamp header missing or invalid' },
      400,
    );
  }
  if (Math.abs(Date.now() - ts) > MAX_DRIFT_MS) {
    return c.json({ error: 'Timestamp outside replay window' }, 401);
  }

  // Find the connector for this vendor that has a configured webhook secret
  const conns = await db
    .select()
    .from(vendorStockConnectors)
    .where(
      and(
        eq(vendorStockConnectors.vendorId, vendorId),
        eq(vendorStockConnectors.connectorType, 'WEBHOOK'),
        eq(vendorStockConnectors.isActive, 1),
      ),
    )
    .limit(1);
  if (!conns.length) {
    return c.json({ error: 'No active WEBHOOK connector for vendor' }, 404);
  }
  const conn = conns[0];

  if (!conn.authSecretRef) {
    return c.json({ error: 'Connector has no authSecretRef' }, 401);
  }
  const secret = (c.env as any)[conn.authSecretRef];
  if (!secret) {
    return c.json(
      { error: `Secret ${conn.authSecretRef} not bound to worker` },
      401,
    );
  }

  // Verify HMAC over the raw body (NOT the parsed JSON — bytes-stable)
  const expected = await hmacSha256Hex(secret, rawBody);
  if (!constantTimeEquals(sigHeader.toLowerCase(), expected)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Parse + upsert
  let parsed: any[];
  try {
    const j = JSON.parse(rawBody);
    parsed = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (parsed.length === 0) {
    return c.json({ ok: true, written: 0 });
  }

  const now = new Date().toISOString();
  const t0 = Date.now();

  // Validate referenced locations belong to this vendor
  const locIds = Array.from(
    new Set(parsed.map((r) => r.locationId).filter(Boolean)),
  );
  const validLocs = await db
    .select({ id: vendorLocations.id })
    .from(vendorLocations)
    .where(
      and(
        eq(vendorLocations.vendorId, vendorId),
        inArray(vendorLocations.id, locIds),
      ),
    );
  const validLocSet = new Set(validLocs.map((l) => l.id));

  let written = 0;
  let skipped = 0;
  for (const r of parsed) {
    if (!r.vendorSku || !r.locationId || !validLocSet.has(r.locationId)) {
      skipped++;
      continue;
    }
    const qty = Number(r.quantityOnHand ?? r.qtyOnHand ?? 0) | 0;
    const avail =
      r.availableQuantity != null
        ? Number(r.availableQuantity) | 0
        : r.available != null
          ? Number(r.available) | 0
          : null;
    const observedAt = r.observedAt ?? now;

    await db
      .insert(vendorStockSnapshots)
      .values({
        id: crypto.randomUUID(),
        vendorId,
        vendorLocationId: r.locationId,
        vendorSku: r.vendorSku,
        hcpcCode: r.hcpcCode ?? null,
        quantityOnHand: qty,
        availableQuantity: avail,
        source: 'WEBHOOK',
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
          source: 'WEBHOOK',
          observedAt,
          ingestedAt: now,
        },
      });
    written++;
  }

  // Bump connector + log
  await db
    .update(vendorStockConnectors)
    .set({
      lastPolledAt: now,
      lastSuccessAt: now,
      lastError: skipped > 0 ? `${skipped} row(s) skipped` : null,
      updatedAt: now,
    })
    .where(eq(vendorStockConnectors.id, conn.id));

  await db.insert(vendorStockFeedLog).values({
    id: crypto.randomUUID(),
    connectorId: conn.id,
    status: skipped > 0 ? 'PARTIAL' : 'OK',
    rowsWritten: written,
    errorSummary: skipped > 0 ? `${skipped} row(s) skipped` : null,
    durationMs: Date.now() - t0,
    ranAt: now,
  });

  return c.json({ ok: true, written, skipped });
});

export default app;

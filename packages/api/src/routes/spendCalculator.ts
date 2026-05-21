/**
 * Spend Calculator — estimates projected spend for a set of HCPC codes
 * and quantities, applying the best available fee schedule rate:
 * state rate > custom fee schedule > Medicare rate.
 *
 * Matches ProxyIQ's /spend-calculator Lambda.
 */
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

interface LineItem {
  hcpcCode: string;
  quantity: number;
  description?: string;
}

interface RateResult {
  hcpcCode: string;
  description: string | null;
  quantity: number;
  unitRate: number | null;
  rateSource: 'STATE' | 'CUSTOM' | 'MEDICARE' | 'NONE';
  lineTotal: number;
}

async function resolveRate(
  env: Env,
  hcpcCode: string,
  stateCode?: string | null,
  vendorId?: string | null,
): Promise<{ rate: number | null; source: RateResult['rateSource']; description: string | null }> {
  // 1. State rate (highest priority when stateCode provided)
  if (stateCode) {
    const stateRow = await env.DB.prepare(
      `SELECT rate, description FROM state_rate_schedule_items
       WHERE hcpc_code = ? AND state_code = ?
         AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= ?)
       ORDER BY effective_date DESC LIMIT 1`,
    )
      .bind(hcpcCode, stateCode, new Date().toISOString().slice(0, 10))
      .first<{ rate: number; description: string | null }>();
    if (stateRow) return { rate: stateRow.rate, source: 'STATE', description: stateRow.description };
  }

  // 2. Custom fee schedule (vendor-specific)
  if (vendorId) {
    const customRow = await env.DB.prepare(
      `SELECT cfsi.rate, cfsi.description
       FROM custom_fee_schedule_items cfsi
       JOIN custom_fee_schedules cfs ON cfs.id = cfsi.fee_schedule_id
       WHERE cfsi.hcpc_code = ? AND cfs.vendor_id = ?
         AND cfs.end_date >= ?
       ORDER BY cfs.start_date DESC LIMIT 1`,
    )
      .bind(hcpcCode, vendorId, new Date().toISOString().slice(0, 10))
      .first<{ rate: number; description: string | null }>();
    if (customRow) return { rate: customRow.rate, source: 'CUSTOM', description: customRow.description };
  }

  // 3. Medicare rate (national fallback)
  const medicareRow = await env.DB.prepare(
    `SELECT non_rural_rate as rate, description FROM medicare_fee_schedule_items WHERE hcpc_code = ? LIMIT 1`,
  )
    .bind(hcpcCode)
    .first<{ rate: number; description: string | null }>();
  if (medicareRow) return { rate: medicareRow.rate, source: 'MEDICARE', description: medicareRow.description };

  return { rate: null, source: 'NONE', description: null };
}

// POST /spend-calculator
app.post('/', async (c) => {
  const body = await c.req.json();

  const items: LineItem[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ValidationError('items array required: [{hcpcCode, quantity}]');

  const stateCode: string | null = body.stateCode ?? null;
  const vendorId: string | null = body.vendorId ?? null;

  const results: RateResult[] = [];
  let grandTotal = 0;

  for (const item of items) {
    if (!item.hcpcCode) continue;
    const qty = Number(item.quantity) || 1;
    const resolved = await resolveRate(c.env, item.hcpcCode, stateCode, vendorId);
    const lineTotal = resolved.rate != null ? resolved.rate * qty : 0;
    grandTotal += lineTotal;

    results.push({
      hcpcCode: item.hcpcCode,
      description: item.description ?? resolved.description,
      quantity: qty,
      unitRate: resolved.rate,
      rateSource: resolved.source,
      lineTotal,
    });
  }

  return c.json({
    items: results,
    grandTotal,
    stateCode,
    vendorId,
    calculatedAt: new Date().toISOString(),
  });
});

// GET /spend-calculator/rate?hcpc=L1234&state=CA&vendorId=xxx
// Quick single-code lookup (used by encounter pre-check)
app.get('/rate', async (c) => {
  const { hcpc, state, vendorId } = c.req.query();
  if (!hcpc) throw new ValidationError('hcpc query param required');
  const resolved = await resolveRate(c.env, hcpc, state ?? null, vendorId ?? null);
  return c.json({ hcpcCode: hcpc, unitRate: resolved.rate, rateSource: resolved.source, description: resolved.description });
});

export default app;

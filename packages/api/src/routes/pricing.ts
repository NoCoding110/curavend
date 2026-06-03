/**
 * Pricing query endpoints.
 *
 *   GET  /pricing/rate?hospitalId=&vendorId=&hcpcCode=&asOf=
 *   POST /pricing/rates/bulk  body: { hospitalId, vendorId, hcpcCodes: [...], feeScheduleId?, asOf? }
 *
 * Resolution chain: CONTRACT → GPO_CONTRACT → FEE_SCHEDULE → MEDICARE → MANUAL.
 *
 * Hot paths cached in KV with 5-minute TTL.
 */
import { Hono } from 'hono';
import { ForbiddenError, ValidationError } from '../lib/errors';
import { resolvePricesBulk } from '../lib/priceResolver';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertCanQuery(user: AuthUser, hospitalId: string, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'HOSPITAL' && user.hospitalId === hospitalId) return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  throw new ForbiddenError('Cannot query pricing for that hospital/vendor pair');
}

// GET /pricing/rate
app.get('/rate', async (c) => {
  const user = c.get('user');
  const { hospitalId, vendorId, hcpcCode, asOf } = c.req.query();
  if (!hospitalId || !vendorId || !hcpcCode) {
    throw new ValidationError('hospitalId, vendorId, and hcpcCode are required');
  }
  assertCanQuery(user, hospitalId, vendorId);

  const asOfDate = asOf ?? new Date().toISOString().slice(0, 10);

  // KV cache
  const cacheKey = `pricing:${hospitalId}:${vendorId}:${hcpcCode}:${asOfDate}`;
  try {
    const cached = await c.env.KV.get(cacheKey);
    if (cached) return c.json(JSON.parse(cached));
  } catch { /* KV miss is fine */ }

  const priceMap = await resolvePricesBulk(c.env.DB, {
    hospitalId,
    vendorId,
    codes: [hcpcCode],
    asOf: asOfDate,
  });
  const resolved = priceMap.get(hcpcCode);

  const response = {
    hcpcCode,
    rate: resolved?.unitPrice ?? null,
    source: resolved?.priceSource ?? null,
    priceSource: resolved?.priceSource ?? null,
    contractId: resolved?.contractId ?? null,
    medicareFee: resolved?.medicareFee ?? null,
    currency: 'USD',
    asOf: asOfDate,
  };

  try {
    await c.env.KV.put(cacheKey, JSON.stringify(response), { expirationTtl: 300 });
  } catch { /* cache write failure is non-fatal */ }
  return c.json(response);
});

// POST /pricing/rates/bulk
app.post('/rates/bulk', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  if (!body.hospitalId || !body.vendorId || !Array.isArray(body.hcpcCodes)) {
    throw new ValidationError('hospitalId, vendorId, and hcpcCodes[] are required');
  }
  assertCanQuery(user, body.hospitalId, body.vendorId);

  const codes: string[] = body.hcpcCodes.filter((c: any) => typeof c === 'string');
  if (codes.length === 0) return c.json({ rates: {}, asOf: body.asOf ?? new Date().toISOString().slice(0, 10) });

  const asOfDate = body.asOf ?? new Date().toISOString().slice(0, 10);
  const priceMap = await resolvePricesBulk(c.env.DB, {
    hospitalId: body.hospitalId,
    vendorId: body.vendorId,
    codes,
    feeScheduleId: body.feeScheduleId ?? null,
    asOf: asOfDate,
  });

  const rates: Record<string, any> = {};
  for (const code of codes) {
    const resolved = priceMap.get(code);
    rates[code] = {
      rate: resolved?.unitPrice ?? null,
      source: resolved?.priceSource ?? null,
      priceSource: resolved?.priceSource ?? null,
      contractId: resolved?.contractId ?? null,
      medicareFee: resolved?.medicareFee ?? null,
      currency: 'USD',
    };
  }
  return c.json({ rates, asOf: asOfDate });
});

export default app;

/**
 * Pricing query endpoints.
 *
 *   GET  /pricing/rate?hospitalId=&vendorId=&hcpcCode=&asOf=
 *   POST /pricing/rates/bulk  body: { hospitalId, vendorId, hcpcCodes: [...] }
 *
 * Resolution chain: CONTRACT → MEDICARE → null. (Custom fee schedules are
 * applied at invoice time and not exposed here for v1; can be extended.)
 *
 * Hot paths cached in KV with 5-minute TTL.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { ForbiddenError, ValidationError } from '../lib/errors';
import { getContractRate, getContractRatesBulk } from '../lib/contractPricing';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertCanQuery(user: AuthUser, hospitalId: string, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'HOSPITAL' && user.hospitalId === hospitalId) return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  throw new ForbiddenError('Cannot query pricing for that hospital/vendor pair');
}

async function getMedicareRate(d1: Env['DB'], hcpcCode: string): Promise<number | null> {
  const db = getDb(d1);
  const row: any = await db.run(sql`
    SELECT non_rural_rate FROM medicare_fee_schedule_items WHERE hcpc_code = ${hcpcCode} LIMIT 1
  `);
  const value = row.results?.[0]?.non_rural_rate;
  return typeof value === 'number' ? value : null;
}

// GET /pricing/rate
app.get('/rate', async (c) => {
  const user = c.get('user');
  const { hospitalId, vendorId, hcpcCode, asOf } = c.req.query();
  if (!hospitalId || !vendorId || !hcpcCode) {
    throw new ValidationError('hospitalId, vendorId, and hcpcCode are required');
  }
  assertCanQuery(user, hospitalId, vendorId);

  // KV cache
  const cacheKey = `pricing:${hospitalId}:${vendorId}:${hcpcCode}:${asOf ?? new Date().toISOString().slice(0, 10)}`;
  try {
    const cached = await c.env.KV.get(cacheKey);
    if (cached) return c.json(JSON.parse(cached));
  } catch { /* KV miss is fine */ }

  // Priority 1: contract
  const contract = await getContractRate(c.env.DB, hospitalId, vendorId, hcpcCode, asOf);
  let response: any;
  if (contract) {
    response = {
      hcpcCode,
      rate: contract.rate,
      source: 'CONTRACT',
      contractId: contract.contractId,
      currency: 'USD',
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
    };
  } else {
    // Priority 2: medicare
    const medicare = await getMedicareRate(c.env.DB, hcpcCode);
    if (medicare != null) {
      response = {
        hcpcCode,
        rate: medicare,
        source: 'MEDICARE',
        contractId: null,
        currency: 'USD',
        asOf: asOf ?? new Date().toISOString().slice(0, 10),
      };
    } else {
      response = {
        hcpcCode,
        rate: null,
        source: null,
        contractId: null,
        currency: 'USD',
        asOf: asOf ?? new Date().toISOString().slice(0, 10),
      };
    }
  }
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
  if (codes.length === 0) return c.json({ rates: {} });

  const contractMap = await getContractRatesBulk(c.env.DB, body.hospitalId, body.vendorId, codes, body.asOf);
  const rates: Record<string, any> = {};

  for (const code of codes) {
    const contract = contractMap.get(code);
    if (contract) {
      rates[code] = {
        rate: contract.rate,
        source: 'CONTRACT',
        contractId: contract.contractId,
        currency: 'USD',
      };
    } else {
      const medicare = await getMedicareRate(c.env.DB, code);
      rates[code] = medicare != null
        ? { rate: medicare, source: 'MEDICARE', contractId: null, currency: 'USD' }
        : { rate: null, source: null, contractId: null, currency: 'USD' };
    }
  }
  return c.json({ rates, asOf: body.asOf ?? new Date().toISOString().slice(0, 10) });
});

export default app;

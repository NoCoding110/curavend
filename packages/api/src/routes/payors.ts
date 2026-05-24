/**
 * /api/payors — Payor CRUD, contract rates, and eligibility-check stub.
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  payors,
  payorContractItems,
  eligibilityChecks,
  PAYOR_KINDS,
  type PayorKind,
} from '@curavend/db';
import { ValidationError, NotFoundError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── GET /payors ──────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(payors).orderBy(payors.name);
  return c.json({ items: rows });
});

// ─── POST /payors ─────────────────────────────────────────────────────────
app.post('/', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    name?: string;
    kind?: string;
    payorCode?: string;
    phone?: string;
    website?: string;
    notes?: string;
  };
  if (!body.name?.trim()) throw new ValidationError('name is required');
  if (!body.kind || !PAYOR_KINDS.includes(body.kind as PayorKind)) {
    throw new ValidationError(`kind must be one of ${PAYOR_KINDS.join(', ')}`);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(payors).values({
    id,
    name: body.name.trim(),
    kind: body.kind,
    payorCode: body.payorCode ?? null,
    phone: body.phone ?? null,
    website: body.website ?? null,
    notes: body.notes ?? null,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ id, name: body.name.trim(), kind: body.kind }, 201);
});

// ─── GET /payors/:id ──────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const [p] = await db.select().from(payors).where(eq(payors.id, id)).limit(1);
  if (!p) throw new NotFoundError('Payor not found');
  const itemCount = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(payorContractItems)
    .where(eq(payorContractItems.payorId, id));
  return c.json({ ...p, contractItemCount: Number(itemCount[0]?.c ?? 0) });
});

// ─── PUT /payors/:id ──────────────────────────────────────────────────────
app.put('/:id', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = (await c.req.json()) as Partial<{
    name: string;
    kind: string;
    payorCode: string;
    phone: string;
    website: string;
    notes: string;
    isActive: number;
  }>;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name != null) patch.name = body.name.trim();
  if (body.kind != null) {
    if (!PAYOR_KINDS.includes(body.kind as PayorKind)) throw new ValidationError('Invalid kind');
    patch.kind = body.kind;
  }
  if (body.payorCode !== undefined) patch.payorCode = body.payorCode;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.website !== undefined) patch.website = body.website;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.isActive !== undefined) patch.isActive = body.isActive;
  await db.update(payors).set(patch).where(eq(payors.id, id));
  return c.json({ id, updated: true });
});

// ─── GET /payors/:id/items ────────────────────────────────────────────────
app.get('/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(payorContractItems)
    .where(eq(payorContractItems.payorId, id))
    .orderBy(payorContractItems.hcpcCode);
  return c.json({ items: rows });
});

// ─── POST /payors/:id/items ───────────────────────────────────────────────
// Bulk upsert payor contract rates.
app.post('/:id/items', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = (await c.req.json()) as {
    items?: Array<{
      hcpcCode: string;
      allowableUsd: number;
      effectiveStartDate: string;
      effectiveEndDate?: string;
      vendorId?: string;
      description?: string;
      patientResponsibilityUsd?: number;
      requiresPriorAuth?: boolean;
    }>;
  };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('items (non-empty array) is required');
  }
  const [p] = await db.select().from(payors).where(eq(payors.id, id)).limit(1);
  if (!p) throw new NotFoundError('Payor not found');

  const now = new Date().toISOString();
  const processed: string[] = [];
  for (const item of body.items) {
    if (!item.hcpcCode || typeof item.allowableUsd !== 'number' || !item.effectiveStartDate) {
      throw new ValidationError('Each item needs hcpcCode, allowableUsd, effectiveStartDate');
    }
    const existing = await db
      .select({ id: payorContractItems.id })
      .from(payorContractItems)
      .where(
        and(
          eq(payorContractItems.payorId, id),
          eq(payorContractItems.hcpcCode, item.hcpcCode),
          eq(payorContractItems.effectiveStartDate, item.effectiveStartDate),
          item.vendorId
            ? eq(payorContractItems.vendorId, item.vendorId)
            : sql`${payorContractItems.vendorId} IS NULL`,
        ),
      )
      .limit(1);
    if (existing.length) {
      await db
        .update(payorContractItems)
        .set({
          allowableUsd: item.allowableUsd,
          effectiveEndDate: item.effectiveEndDate ?? null,
          description: item.description ?? null,
          patientResponsibilityUsd: item.patientResponsibilityUsd ?? null,
          requiresPriorAuth: item.requiresPriorAuth ? 1 : 0,
          isActive: 1,
          updatedAt: now,
        })
        .where(eq(payorContractItems.id, existing[0].id));
      processed.push(existing[0].id);
    } else {
      const newId = crypto.randomUUID();
      await db.insert(payorContractItems).values({
        id: newId,
        payorId: id,
        vendorId: item.vendorId ?? null,
        hcpcCode: item.hcpcCode,
        description: item.description ?? null,
        allowableUsd: item.allowableUsd,
        patientResponsibilityUsd: item.patientResponsibilityUsd ?? null,
        effectiveStartDate: item.effectiveStartDate,
        effectiveEndDate: item.effectiveEndDate ?? null,
        requiresPriorAuth: item.requiresPriorAuth ? 1 : 0,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });
      processed.push(newId);
    }
  }
  return c.json({ payorId: id, processed: processed.length, itemIds: processed });
});

// ─── POST /payors/:id/eligibility-check ───────────────────────────────────
// Stub: no real X12 270/271 yet. Records the check and returns a synthesized
// response so the UI flow works end-to-end. A future PR plugs in a real
// clearinghouse (Change Healthcare, Availity, etc.).
app.post(
  '/:id/eligibility-check',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER', 'FACILITY_USER', 'PHYSICIAN'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    const body = (await c.req.json()) as {
      patientMemberId: string;
      patientName?: string;
      patientDob?: string;
      hcpcCode?: string;
      orderId?: string;
    };
    if (!body.patientMemberId) throw new ValidationError('patientMemberId is required');

    const [p] = await db.select().from(payors).where(eq(payors.id, id)).limit(1);
    if (!p) throw new NotFoundError('Payor not found');

    // Stub logic: roll a deterministic-ish synthesized response based on the member id hash.
    // Real impl would call X12 270 → 271 here.
    const hashed = [...body.patientMemberId].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
    const isActive = hashed % 7 !== 0;
    const copay = Number(((hashed % 50) + 5).toFixed(2));
    const deductible = 1500;
    const deductibleMet = Number((((hashed % 13) * 100) + 200).toFixed(2));

    const status = !isActive ? 'INACTIVE' : 'ACTIVE';
    const benefitNotes = isActive
      ? `Active coverage. Plan year deductible $${deductible}. Coinsurance applies after deductible. (Stubbed response — real EDI 270/271 not yet wired.)`
      : `Member ID not found or coverage lapsed. (Stubbed response.)`;

    const checkId = crypto.randomUUID();
    await db.insert(eligibilityChecks).values({
      id: checkId,
      payorId: id,
      patientMemberId: body.patientMemberId,
      patientName: body.patientName ?? null,
      patientDob: body.patientDob ?? null,
      requestedHcpcCode: body.hcpcCode ?? null,
      orderId: body.orderId ?? null,
      status,
      benefitNotes,
      copayUsd: isActive ? copay : null,
      deductibleUsd: isActive ? deductible : null,
      deductibleMetUsd: isActive ? deductibleMet : null,
      rawResponse: JSON.stringify({
        stub: true,
        payor: p.name,
        member: body.patientMemberId,
        active: isActive,
      }),
      checkedAt: new Date().toISOString(),
    });

    return c.json({
      id: checkId,
      status,
      benefitNotes,
      copayUsd: isActive ? copay : null,
      deductibleUsd: isActive ? deductible : null,
      deductibleMetUsd: isActive ? deductibleMet : null,
      payor: { id: p.id, name: p.name, kind: p.kind },
      stub: true,
    });
  },
);

// ─── GET /payors/eligibility-checks ───────────────────────────────────────
// Recent checks (admin dashboard / audit).
app.get('/eligibility-checks/recent', async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const rows = await db
    .select()
    .from(eligibilityChecks)
    .orderBy(sql`${eligibilityChecks.checkedAt} desc`)
    .limit(limit);
  return c.json({ items: rows });
});

export default app;

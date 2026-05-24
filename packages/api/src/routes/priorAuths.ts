/**
 * /api/prior-auths — Prior Authorization lifecycle.
 *
 * State machine:
 *   NEEDED → SUBMITTED → PENDING → APPROVED | DENIED | EXPIRED | CANCELLED
 *
 * Endpoints:
 *   GET    /                          — list (tenant-scoped)
 *   POST   /                          — create
 *   GET    /:id                       — detail + history
 *   PATCH  /:id                       — update fields
 *   POST   /:id/transition            — body { toStatus, reason?, authNumber?, quantityApproved? }
 *   POST   /:id/documents             — body { blobKey } — attach
 *   GET    /summary/dashboard         — counts by status for dashboard widget
 */
import { Hono } from 'hono';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  priorAuths,
  priorAuthHistory,
  payors,
  orders,
  PRIOR_AUTH_STATUSES,
  type PriorAuthStatus,
} from '@curavend/db';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

const MANAGER_OR_USER = [
  'ACCOUNT_MANAGER',
  'ACCOUNT_MANAGER_USER',
  'FACILITY_ACCOUNT_MANAGER',
  'FACILITY_USER',
  'PHYSICIAN',
  'VENDOR_ACCOUNT_MANAGER',
  'PROVIDER_EXECUTIVE_ADMIN',
];

/**
 * Allowed transitions per the state machine. Wildcard `*` means any source.
 */
const TRANSITIONS: Record<PriorAuthStatus, PriorAuthStatus[]> = {
  NEEDED: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'],
  PENDING: ['APPROVED', 'DENIED', 'CANCELLED'],
  APPROVED: ['EXPIRED', 'CANCELLED'],
  DENIED: ['SUBMITTED'], // resubmission allowed
  EXPIRED: ['SUBMITTED'], // renewal
  CANCELLED: [],
};

// ─── GET / ────────────────────────────────────────────────────────────────
app.get('/', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { status, payorId, orderId } = c.req.query();

  const conds = [];
  // Tenant scoping: facility users only see their hospital's PAs.
  if (caller.userType !== 'ADMIN' && caller.role !== 'ACCOUNT_MANAGER' && caller.role !== 'ACCOUNT_MANAGER_USER') {
    if (caller.hospitalId) conds.push(eq(priorAuths.hospitalId, caller.hospitalId));
  }
  if (status && PRIOR_AUTH_STATUSES.includes(status as PriorAuthStatus)) {
    conds.push(eq(priorAuths.status, status));
  }
  if (payorId) conds.push(eq(priorAuths.payorId, payorId));
  if (orderId) conds.push(eq(priorAuths.orderId, orderId));

  const rows = await db
    .select()
    .from(priorAuths)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(priorAuths.updatedAt))
    .limit(200);

  // Join payor names for the table view.
  const payorIds = [...new Set(rows.map((r) => r.payorId))];
  const payorRows = payorIds.length
    ? await db.select({ id: payors.id, name: payors.name, kind: payors.kind }).from(payors).where(inArray(payors.id, payorIds))
    : [];
  const payorMap = new Map(payorRows.map((p) => [p.id, p]));

  return c.json({
    items: rows.map((r) => ({ ...r, payor: payorMap.get(r.payorId) ?? null })),
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────
app.post('/', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const body = (await c.req.json()) as {
    orderId?: string;
    payorId: string;
    payorMemberId?: string;
    payorGroupId?: string;
    patientName: string;
    patientDob?: string;
    hcpcCode: string;
    // Also accept singular icd10 (string) for the DME wizard, which sends one code
    icd10?: string;
    icd10Codes?: string[];
    clinicalNote?: string;
    effectiveStartDate?: string;
    effectiveEndDate?: string;
  };

  // payorMemberId is encouraged but not strictly required at NEEDED stage —
  // patient may not have the card on hand when the order is created. It must
  // be filled before SUBMITTED.
  if (!body.payorId || !body.patientName || !body.hcpcCode) {
    throw new ValidationError('payorId, patientName, hcpcCode are required');
  }
  // Normalize icd10 -> icd10Codes
  if (!body.icd10Codes && body.icd10) body.icd10Codes = [body.icd10];
  // Verify payor exists.
  const [p] = await db.select().from(payors).where(eq(payors.id, body.payorId)).limit(1);
  if (!p) throw new NotFoundError('Payor not found');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const hospitalId = caller.hospitalId ?? null;

  await db.insert(priorAuths).values({
    id,
    orderId: body.orderId ?? null,
    hospitalId,
    payorId: body.payorId,
    payorMemberId: body.payorMemberId ?? null,
    payorGroupId: body.payorGroupId ?? null,
    patientName: body.patientName,
    patientDob: body.patientDob ?? null,
    hcpcCode: body.hcpcCode,
    icd10Codes: body.icd10Codes ? JSON.stringify(body.icd10Codes) : null,
    clinicalNote: body.clinicalNote ?? null,
    status: 'NEEDED',
    effectiveStartDate: body.effectiveStartDate ?? null,
    effectiveEndDate: body.effectiveEndDate ?? null,
    createdBy: caller.id,
    lastEditedBy: caller.id,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(priorAuthHistory).values({
    id: crypto.randomUUID(),
    priorAuthId: id,
    fromStatus: null,
    toStatus: 'NEEDED',
    reason: 'Created',
    changedBy: caller.id,
    createdAt: now,
  });

  // PA→order linkage lives on priorAuths.orderId; orders has no priorAuthId
  // column, so no reverse update is needed.

  return c.json({ id }, 201);
});

// ─── GET /:id ─────────────────────────────────────────────────────────────
app.get('/:id', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const [row] = await db.select().from(priorAuths).where(eq(priorAuths.id, id)).limit(1);
  if (!row) throw new NotFoundError('Prior auth not found');
  const history = await db
    .select()
    .from(priorAuthHistory)
    .where(eq(priorAuthHistory.priorAuthId, id))
    .orderBy(desc(priorAuthHistory.createdAt));
  const [p] = await db.select().from(payors).where(eq(payors.id, row.payorId)).limit(1);
  return c.json({ ...row, payor: p ?? null, history });
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────
app.patch('/:id', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as Partial<{
    payorMemberId: string;
    payorGroupId: string | null;
    patientName: string;
    patientDob: string | null;
    hcpcCode: string;
    clinicalNote: string | null;
    icd10Codes: string[];
    effectiveStartDate: string | null;
    effectiveEndDate: string | null;
    authNumber: string | null;
    quantityApproved: number | null;
  }>;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString(), lastEditedBy: caller.id };
  if (body.payorMemberId != null) patch.payorMemberId = body.payorMemberId;
  if (body.payorGroupId !== undefined) patch.payorGroupId = body.payorGroupId;
  if (body.patientName != null) patch.patientName = body.patientName;
  if (body.patientDob !== undefined) patch.patientDob = body.patientDob;
  if (body.hcpcCode != null) patch.hcpcCode = body.hcpcCode;
  if (body.clinicalNote !== undefined) patch.clinicalNote = body.clinicalNote;
  if (body.icd10Codes !== undefined) patch.icd10Codes = JSON.stringify(body.icd10Codes);
  if (body.effectiveStartDate !== undefined) patch.effectiveStartDate = body.effectiveStartDate;
  if (body.effectiveEndDate !== undefined) patch.effectiveEndDate = body.effectiveEndDate;
  if (body.authNumber !== undefined) patch.authNumber = body.authNumber;
  if (body.quantityApproved !== undefined) patch.quantityApproved = body.quantityApproved;

  await db.update(priorAuths).set(patch).where(eq(priorAuths.id, id));
  return c.json({ id, updated: true });
});

// ─── POST /:id/transition ─────────────────────────────────────────────────
app.post('/:id/transition', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as {
    toStatus: PriorAuthStatus;
    reason?: string;
    authNumber?: string;
    quantityApproved?: number;
    effectiveStartDate?: string;
    effectiveEndDate?: string;
  };
  if (!body.toStatus || !PRIOR_AUTH_STATUSES.includes(body.toStatus)) {
    throw new ValidationError(`toStatus must be one of ${PRIOR_AUTH_STATUSES.join(', ')}`);
  }

  const [row] = await db.select().from(priorAuths).where(eq(priorAuths.id, id)).limit(1);
  if (!row) throw new NotFoundError('Prior auth not found');

  const allowed = TRANSITIONS[row.status as PriorAuthStatus] ?? [];
  if (!allowed.includes(body.toStatus)) {
    throw new ForbiddenError(`Cannot transition from ${row.status} to ${body.toStatus}`);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: body.toStatus, statusReason: body.reason ?? null, updatedAt: now, lastEditedBy: caller.id };
  if (body.toStatus === 'SUBMITTED' && !row.submittedAt) patch.submittedAt = now;
  if (body.toStatus === 'APPROVED' || body.toStatus === 'DENIED') patch.decisionAt = now;
  if (body.authNumber !== undefined) patch.authNumber = body.authNumber;
  if (body.quantityApproved !== undefined) patch.quantityApproved = body.quantityApproved;
  if (body.effectiveStartDate !== undefined) patch.effectiveStartDate = body.effectiveStartDate;
  if (body.effectiveEndDate !== undefined) patch.effectiveEndDate = body.effectiveEndDate;

  await db.update(priorAuths).set(patch).where(eq(priorAuths.id, id));
  await db.insert(priorAuthHistory).values({
    id: crypto.randomUUID(),
    priorAuthId: id,
    fromStatus: row.status,
    toStatus: body.toStatus,
    reason: body.reason ?? null,
    changedBy: caller.id,
    createdAt: now,
  });

  return c.json({ id, status: body.toStatus });
});

// ─── POST /:id/documents ──────────────────────────────────────────────────
// Attach an R2 blob key to the PA's document list.
app.post('/:id/documents', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = (await c.req.json()) as { blobKey?: string };
  if (!body.blobKey) throw new ValidationError('blobKey is required');

  const [row] = await db.select().from(priorAuths).where(eq(priorAuths.id, id)).limit(1);
  if (!row) throw new NotFoundError('Prior auth not found');

  const existing: string[] = row.documentBlobKeys ? JSON.parse(row.documentBlobKeys) : [];
  if (!existing.includes(body.blobKey)) existing.push(body.blobKey);
  await db
    .update(priorAuths)
    .set({ documentBlobKeys: JSON.stringify(existing), updatedAt: new Date().toISOString() })
    .where(eq(priorAuths.id, id));
  return c.json({ id, documentBlobKeys: existing });
});

// ─── GET /summary/dashboard ───────────────────────────────────────────────
app.get('/summary/dashboard', rbac(...MANAGER_OR_USER), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const tenantCond = caller.userType !== 'ADMIN' && caller.role !== 'ACCOUNT_MANAGER' && caller.role !== 'ACCOUNT_MANAGER_USER' && caller.hospitalId
    ? `WHERE hospital_id = '${caller.hospitalId.replace(/'/g, "''")}'`
    : '';
  const raw: any = await db.run(
    sql.raw(`
      SELECT status, COUNT(*) as c
      FROM prior_auths
      ${tenantCond}
      GROUP BY status
    `),
  );
  const counts: Record<string, number> = {};
  for (const r of raw.results ?? []) counts[r.status] = Number(r.c);
  // Expiring soon: APPROVED with effective_end_date in next 30 days.
  const expRaw: any = await db.run(
    sql.raw(`
      SELECT COUNT(*) as c
      FROM prior_auths
      WHERE status = 'APPROVED'
        AND effective_end_date IS NOT NULL
        AND date(effective_end_date) <= date('now', '+30 days')
        AND date(effective_end_date) >= date('now')
        ${tenantCond ? tenantCond.replace('WHERE', 'AND') : ''}
    `),
  );
  const expiringSoon = Number(expRaw.results?.[0]?.c ?? 0);
  return c.json({ counts, expiringSoon });
});

export default app;

/**
 * /api/rmas — Vendor RMA (return material authorization) workflow.
 *
 *   GET  /                   list (filter by state, vendorId, hospitalId)
 *   POST /                   manual create (auto-spawn handled in goodsReceipts.post)
 *   GET  /:id                detail + lines
 *   POST /:id/submit         DRAFT → SUBMITTED
 *   POST /:id/approve        SUBMITTED → APPROVED (vendor accepts)
 *   POST /:id/reject         SUBMITTED → REJECTED
 *   POST /:id/ship           APPROVED → SHIPPED (return shipped)
 *   POST /:id/receive        SHIPPED → RECEIVED (vendor got it)
 *   POST /:id/credit         RECEIVED → CREDITED
 *   POST /:id/cancel         any non-terminal → CANCELLED
 *
 * Tenant: hospital sees their hospitalId. Vendor sees their vendorId.
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { vendorRmas, vendorRmaLines, RMA_STATES, RMA_REASONS } from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { getNextValue, ensureSequenceTable } from '../services/sequenceService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

async function loadAndAuth(d1: D1Database, u: AuthUser, id: string) {
  const db = getDb(d1);
  const [row] = await db.select().from(vendorRmas).where(eq(vendorRmas.id, id)).limit(1);
  if (!row) throw new NotFoundError('RMA not found');
  if (isAdmin(u)) return row;
  if (u.vendorId && row.vendorId === u.vendorId) return row;
  if (u.hospitalId && row.hospitalId === u.hospitalId) return row;
  throw new ForbiddenError('RMA belongs to a different tenant');
}

app.get('/', requirePermission('rmas', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { state, vendorId, hospitalId } = c.req.query();
  const conds: any[] = [];
  if (state) conds.push(eq(vendorRmas.state, state));
  if (!isAdmin(user)) {
    if (user.vendorId) conds.push(eq(vendorRmas.vendorId, user.vendorId));
    else if (user.hospitalId) conds.push(eq(vendorRmas.hospitalId, user.hospitalId));
    else throw new ForbiddenError('Tenant scope required');
  } else {
    if (vendorId) conds.push(eq(vendorRmas.vendorId, vendorId));
    if (hospitalId) conds.push(eq(vendorRmas.hospitalId, hospitalId));
  }
  const rows = await db
    .select()
    .from(vendorRmas)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(vendorRmas.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/', requirePermission('rmas', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.vendorId) throw new ValidationError('vendorId required');
  if (!body.reason || !(RMA_REASONS as readonly string[]).includes(body.reason)) {
    throw new ValidationError(`reason must be one of ${RMA_REASONS.join(', ')}`);
  }
  if (user.vendorId) throw new ForbiddenError('Vendors cannot file RMAs against themselves');

  await ensureSequenceTable(db);
  const seq = await getNextValue(db, 'vendor_rmas');
  const rmaNumber = `RMA-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? null) : user.hospitalId;

  await db.insert(vendorRmas).values({
    id, rmaNumber,
    vendorId: body.vendorId, hospitalId,
    sourceGrnId: body.sourceGrnId ?? null,
    sourceOrderId: body.sourceOrderId ?? null,
    state: 'DRAFT',
    reason: body.reason,
    reasonDetail: body.reasonDetail ?? null,
    expectedCreditUsd: body.expectedCreditUsd ?? null,
    notes: body.notes ?? null,
    createdByUserId: user.id,
    createdAt: now, updatedAt: now,
  });

  if (Array.isArray(body.lines)) {
    for (const ln of body.lines) {
      await db.insert(vendorRmaLines).values({
        id: crypto.randomUUID(),
        rmaId: id,
        grnLineId: ln.grnLineId ?? null,
        hcpcCode: ln.hcpcCode ?? null,
        description: ln.description ?? null,
        quantity: ln.quantity ?? 1,
        unitCreditUsd: ln.unitCreditUsd ?? null,
        condition: ln.condition ?? null,
        notes: ln.notes ?? null,
        createdAt: now,
      });
    }
  }
  return c.json({ id, rmaNumber, state: 'DRAFT' }, 201);
});

app.get('/:id', requirePermission('rmas', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuth(c.env.DB, user, id);
  const lines = await db.select().from(vendorRmaLines).where(eq(vendorRmaLines.rmaId, id));
  return c.json({ ...row, lines });
});

function makeTransition(
  from: string[], toState: string, stampField: string | null = null,
  permissionLevel: 'WRITE' | 'FULL' = 'WRITE',
) {
  return [
    requirePermission('rmas', permissionLevel),
    async (c: any) => {
      const db = getDb(c.env.DB);
      const user = c.get('user');
      const { id } = c.req.param();
      const body = (await c.req.json().catch(() => ({}))) as any;
      const row = await loadAndAuth(c.env.DB, user, id);
      if (!from.includes(row.state)) {
        throw new ConflictError(`Can't transition from ${row.state} to ${toState}`);
      }
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { state: toState, updatedAt: now };
      if (stampField) patch[stampField] = now;
      // Optional payload knobs
      if (body.vendorRmaNumber) patch.vendorRmaNumber = body.vendorRmaNumber;
      if (body.trackingNumber) patch.trackingNumber = body.trackingNumber;
      if (body.actualCreditUsd != null) patch.actualCreditUsd = Number(body.actualCreditUsd);
      if (body.notes) patch.notes = body.notes;
      await db.update(vendorRmas).set(patch).where(eq(vendorRmas.id, id));
      return c.json({ id, state: toState });
    },
  ] as const;
}

app.post('/:id/submit', ...makeTransition(['DRAFT'], 'SUBMITTED', 'submittedAt'));
app.post('/:id/approve', ...makeTransition(['SUBMITTED'], 'APPROVED', 'approvedAt'));
app.post('/:id/reject', ...makeTransition(['SUBMITTED'], 'REJECTED'));
app.post('/:id/ship', ...makeTransition(['APPROVED'], 'SHIPPED', 'shippedAt'));
app.post('/:id/receive', ...makeTransition(['SHIPPED'], 'RECEIVED', 'receivedAt'));
app.post('/:id/credit', ...makeTransition(['RECEIVED'], 'CREDITED', 'creditedAt'));
app.post('/:id/cancel', ...makeTransition(
  ['DRAFT', 'SUBMITTED', 'APPROVED', 'SHIPPED'], 'CANCELLED', null, 'FULL',
));

export default app;

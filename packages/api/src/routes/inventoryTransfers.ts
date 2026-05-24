/**
 * /api/transfers — hospital-side facility-to-facility stock transfers.
 *
 *   GET    /                  list (filter by state, from/to facility)
 *   POST   /                  create (REQUESTED)
 *   GET    /:id               detail + lines
 *   POST   /:id/approve       REQUESTED → APPROVED
 *   POST   /:id/ship          APPROVED → SHIPPED (records tracking)
 *   POST   /:id/receive       SHIPPED → RECEIVED (terminal)
 *   POST   /:id/cancel        any non-terminal → CANCELLED
 *   GET    /suggestions       reads cross-site-inventory + suggests transfers from over-stocked to under-stocked sites
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  inventoryTransfers, inventoryTransferLines, TRANSFER_STATES, TRANSFER_PRIORITIES,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { ensureSequenceTable, getNextValue } from '../services/sequenceService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

async function loadAndAuth(d1: D1Database, u: AuthUser, id: string) {
  const db = getDb(d1);
  const [row] = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, id)).limit(1);
  if (!row) throw new NotFoundError('Transfer not found');
  if (isAdmin(u)) return row;
  if (u.hospitalId && row.hospitalId === u.hospitalId) return row;
  throw new ForbiddenError('Transfer belongs to a different tenant');
}

app.get('/', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { state, fromFacilityId, toFacilityId } = c.req.query();
  const conds: any[] = [];
  if (state) conds.push(eq(inventoryTransfers.state, state));
  if (fromFacilityId) conds.push(eq(inventoryTransfers.fromFacilityId, fromFacilityId));
  if (toFacilityId) conds.push(eq(inventoryTransfers.toFacilityId, toFacilityId));
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('hospital scope required');
    conds.push(eq(inventoryTransfers.hospitalId, user.hospitalId));
  }
  const rows = await db
    .select().from(inventoryTransfers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(inventoryTransfers.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.fromFacilityId || !body.toFacilityId) {
    throw new ValidationError('fromFacilityId and toFacilityId required');
  }
  if (body.fromFacilityId === body.toFacilityId) {
    throw new ValidationError('from and to must differ');
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new ValidationError('lines[] required');
  }
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? user.hospitalId) : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');

  await ensureSequenceTable(db);
  const seq = await getNextValue(db, 'inventory_transfers');
  const id = crypto.randomUUID();
  const number = `TR-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const now = new Date().toISOString();

  await db.insert(inventoryTransfers).values({
    id, transferNumber: number, hospitalId,
    fromFacilityId: body.fromFacilityId, toFacilityId: body.toFacilityId,
    requestedByUserId: user.id,
    state: 'REQUESTED',
    priority: body.priority && (TRANSFER_PRIORITIES as readonly string[]).includes(body.priority) ? body.priority : 'NORMAL',
    reason: body.reason ?? null,
    notes: body.notes ?? null,
    createdAt: now, updatedAt: now,
  });
  for (const ln of body.lines) {
    await db.insert(inventoryTransferLines).values({
      id: crypto.randomUUID(),
      transferId: id,
      hcpcCode: ln.hcpcCode ?? null,
      description: ln.description ?? null,
      quantity: ln.quantity ?? 1,
      lotNumber: ln.lotNumber ?? null,
      unitCostUsd: ln.unitCostUsd ?? null,
      createdAt: now,
    });
  }
  return c.json({ id, transferNumber: number, state: 'REQUESTED' }, 201);
});

app.get('/:id', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadAndAuth(c.env.DB, user, id);
  const lines = await db.select().from(inventoryTransferLines).where(eq(inventoryTransferLines.transferId, id));
  return c.json({ ...row, lines });
});

function transition(
  from: string[], to: string, stampField: string | null = null,
) {
  return [
    requirePermission('orders', 'WRITE'),
    async (c: any) => {
      const db = getDb(c.env.DB);
      const user = c.get('user');
      const { id } = c.req.param();
      const body = (await c.req.json().catch(() => ({}))) as any;
      const row = await loadAndAuth(c.env.DB, user, id);
      if (!from.includes(row.state)) {
        throw new ConflictError(`Can't transition from ${row.state} to ${to}`);
      }
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { state: to, updatedAt: now };
      if (stampField) patch[stampField] = now;
      if (to === 'APPROVED') patch.approvedByUserId = user.id;
      if (body.trackingNumber) patch.trackingNumber = body.trackingNumber;
      if (body.notes) patch.notes = body.notes;
      await db.update(inventoryTransfers).set(patch).where(eq(inventoryTransfers.id, id));
      return c.json({ id, state: to });
    },
  ] as const;
}

app.post('/:id/approve', ...transition(['REQUESTED'], 'APPROVED'));
app.post('/:id/ship', ...transition(['APPROVED'], 'SHIPPED', 'shippedAt'));
app.post('/:id/receive', ...transition(['SHIPPED'], 'RECEIVED', 'receivedAt'));
app.post('/:id/cancel', ...transition(['REQUESTED', 'APPROVED', 'SHIPPED'], 'CANCELLED'));

export default app;

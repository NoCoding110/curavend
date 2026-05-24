/**
 * /api/point-of-use — bedside / procedure-room item consumption capture.
 *
 *   POST  /                  capture one event (optionally decrement inventory)
 *   POST  /batch             capture many at once (procedure tray scan)
 *   GET   /                  list (filter by encounter, patient, dept, date)
 *   GET   /by-encounter/:id  events for a specific encounter
 *
 * If `inventoryLotId` is supplied, the service issues from that lab lot
 * (FEFO override). Otherwise it logs intent without decrementing.
 */
import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { pointOfUseEvents, labInventoryLots } from '@curavend/db';
import { ValidationError, ForbiddenError, NotFoundError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { recordMovement } from '../services/labInventoryService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

interface PouLineInput {
  hcpcCode?: string;
  formularyItemId?: string;
  manufacturerNumber?: string;
  serialNumber?: string;
  lotNumber?: string;
  quantity?: number;
  unitPriceUsd?: number;
  inventoryLotId?: string;
  notes?: string;
}

async function captureOne(
  d1: D1Database, user: AuthUser, hospitalId: string,
  ctx: { facilityId?: string; departmentId?: string; roomId?: string; patientMrn?: string; encounterId?: string; providerUserId?: string; deviceId?: string },
  line: PouLineInput,
) {
  const db = getDb(d1);
  const id = crypto.randomUUID();
  const capturedAt = new Date().toISOString();

  // If a lab lot is referenced, decrement it through the lab inventory service.
  if (line.inventoryLotId) {
    const [lot] = await db
      .select()
      .from(labInventoryLots)
      .where(eq(labInventoryLots.id, line.inventoryLotId))
      .limit(1);
    if (!lot) throw new NotFoundError(`Lot ${line.inventoryLotId} not found`);
    const qty = line.quantity ?? 1;
    if (lot.quantityOnHand < qty) {
      throw new ValidationError(`Lot ${lot.lotNumber} has ${lot.quantityOnHand} on hand, needed ${qty}`);
    }
    await recordMovement(d1, {
      lotId: lot.id,
      movementType: 'ISSUE',
      quantity: -qty,
      reason: `POU: enc=${ctx.encounterId ?? '?'} mrn=${ctx.patientMrn ?? '?'}`,
      performedByUserId: user.id,
    });
  }

  await db.insert(pointOfUseEvents).values({
    id,
    hospitalId,
    facilityId: ctx.facilityId ?? null,
    departmentId: ctx.departmentId ?? null,
    roomId: ctx.roomId ?? null,
    patientMrn: ctx.patientMrn ?? null,
    encounterId: ctx.encounterId ?? null,
    providerUserId: ctx.providerUserId ?? user.id,
    hcpcCode: line.hcpcCode ?? null,
    formularyItemId: line.formularyItemId ?? null,
    manufacturerNumber: line.manufacturerNumber ?? null,
    serialNumber: line.serialNumber ?? null,
    lotNumber: line.lotNumber ?? null,
    quantity: line.quantity ?? 1,
    unitPriceUsd: line.unitPriceUsd ?? null,
    inventoryLotId: line.inventoryLotId ?? null,
    capturedAt,
    capturedByUserId: user.id,
    deviceId: ctx.deviceId ?? null,
    notes: line.notes ?? null,
    createdAt: capturedAt,
  });
  return id;
}

app.post('/', requirePermission('point-of-use', 'WRITE'), async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? user.hospitalId) : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  if (!body.hcpcCode && !body.formularyItemId && !body.inventoryLotId) {
    throw new ValidationError('At least one of hcpcCode, formularyItemId, inventoryLotId required');
  }
  const id = await captureOne(c.env.DB, user, hospitalId, body, body);
  return c.json({ id }, 201);
});

app.post('/batch', requirePermission('point-of-use', 'WRITE'), async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? user.hospitalId) : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new ValidationError('lines[] required');
  }
  const ids: string[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  for (let i = 0; i < body.lines.length; i++) {
    try {
      const id = await captureOne(c.env.DB, user, hospitalId, body, body.lines[i]);
      ids.push(id);
    } catch (err: any) {
      errors.push({ index: i, error: String(err?.message ?? err) });
    }
  }
  return c.json({ captured: ids.length, ids, errors });
});

app.get('/', requirePermission('point-of-use', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { encounterId, patientMrn, departmentId, fromDate, toDate, limit } = c.req.query();
  const conds: any[] = [];
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('Hospital scope required');
    conds.push(eq(pointOfUseEvents.hospitalId, user.hospitalId));
  }
  if (encounterId) conds.push(eq(pointOfUseEvents.encounterId, encounterId));
  if (patientMrn) conds.push(eq(pointOfUseEvents.patientMrn, patientMrn));
  if (departmentId) conds.push(eq(pointOfUseEvents.departmentId, departmentId));
  if (fromDate) conds.push(gte(pointOfUseEvents.capturedAt, fromDate));
  if (toDate) conds.push(lte(pointOfUseEvents.capturedAt, toDate));
  const cap = Math.min(Number(limit) || 500, 2000);
  const rows = await db
    .select()
    .from(pointOfUseEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(pointOfUseEvents.capturedAt))
    .limit(cap);
  return c.json({ items: rows });
});

app.get('/by-encounter/:id', requirePermission('point-of-use', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(pointOfUseEvents)
    .where(eq(pointOfUseEvents.encounterId, id))
    .orderBy(desc(pointOfUseEvents.capturedAt));
  return c.json({ items: rows });
});

export default app;

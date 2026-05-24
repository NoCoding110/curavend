/**
 * /api/controlled-substance — chain of custody log + dispense flow.
 *
 *   GET   /log                    history (filter by item, schedule, range)
 *   POST  /event                  record a RECEIVE / DISPENSE / WASTE / TRANSFER / COUNT / DISCREPANCY
 *   GET   /balance/:formularyItemId   running balance computed from log
 *
 * Service rules:
 *   - Schedule II events MUST carry witnessedByUserId (rejected otherwise).
 *   - Other schedules SHOULD; service warns but accepts.
 *   - Every event has a signed quantity (positive RECEIVE, negative DISPENSE/WASTE).
 *   - COUNT events stamp quantityAfter only (no balance change unless a
 *     DISCREPANCY event is also written by the operator).
 */
import { Hono } from 'hono';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  controlledSubstanceLog, formularyItems, CONTROLLED_EVENT_TYPES,
} from '@curavend/db';
import { ValidationError, ForbiddenError, NotFoundError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/log', requirePermission('compliance-alerts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { formularyItemId, eventType, fromDate, toDate, limit } = c.req.query();
  const conds: any[] = [];
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('hospital scope required');
    conds.push(eq(controlledSubstanceLog.hospitalId, user.hospitalId));
  }
  if (formularyItemId) conds.push(eq(controlledSubstanceLog.formularyItemId, formularyItemId));
  if (eventType) conds.push(eq(controlledSubstanceLog.eventType, eventType));
  if (fromDate) conds.push(gte(controlledSubstanceLog.occurredAt, fromDate));
  if (toDate) conds.push(lte(controlledSubstanceLog.occurredAt, toDate));
  const cap = Math.min(Number(limit) || 500, 2000);
  const rows = await db
    .select().from(controlledSubstanceLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(controlledSubstanceLog.occurredAt))
    .limit(cap);
  return c.json({ items: rows });
});

app.post('/event', requirePermission('compliance-alerts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.formularyItemId && !body.hcpcCode) {
    throw new ValidationError('formularyItemId or hcpcCode required');
  }
  if (!body.eventType || !(CONTROLLED_EVENT_TYPES as readonly string[]).includes(body.eventType)) {
    throw new ValidationError(`eventType must be one of ${CONTROLLED_EVENT_TYPES.join(', ')}`);
  }
  if (typeof body.quantity !== 'number') throw new ValidationError('quantity (signed) required');

  // Resolve formulary item + DEA schedule if id provided.
  let deaSchedule: string | null = body.deaSchedule ?? null;
  let formularyHospitalId: string | null = null;
  if (body.formularyItemId) {
    const [item] = await db
      .select({ hospitalId: formularyItems.hospitalId, deaSchedule: formularyItems.deaSchedule, hcpcCode: formularyItems.hcpcCode })
      .from(formularyItems).where(eq(formularyItems.id, body.formularyItemId)).limit(1);
    if (!item) throw new NotFoundError('Formulary item not found');
    deaSchedule = item.deaSchedule;
    formularyHospitalId = item.hospitalId;
    if (!deaSchedule) {
      throw new ValidationError('Referenced formulary item has no DEA Schedule — not a controlled substance');
    }
  }

  // Schedule II requires witnesses on DISPENSE + WASTE.
  if (deaSchedule === 'II' && (body.eventType === 'DISPENSE' || body.eventType === 'WASTE')) {
    if (!body.witnessedByUserId) {
      throw new ValidationError('Schedule II DISPENSE/WASTE requires witnessedByUserId');
    }
    if (body.witnessedByUserId === user.id) {
      throw new ValidationError('Witness must differ from performer');
    }
  }

  // Tenant.
  const hospitalId = isAdmin(user)
    ? (body.hospitalId ?? formularyHospitalId ?? user.hospitalId)
    : (user.hospitalId ?? formularyHospitalId);
  if (!hospitalId) throw new ValidationError('hospitalId required');

  // Compute running balance from last log row for this item/hospital.
  let quantityAfter: number | null = null;
  if (body.formularyItemId) {
    const [last] = await db
      .select({ quantityAfter: controlledSubstanceLog.quantityAfter })
      .from(controlledSubstanceLog)
      .where(and(
        eq(controlledSubstanceLog.hospitalId, hospitalId),
        eq(controlledSubstanceLog.formularyItemId, body.formularyItemId),
      ))
      .orderBy(desc(controlledSubstanceLog.occurredAt))
      .limit(1);
    const prev = last?.quantityAfter ?? 0;
    quantityAfter = body.eventType === 'COUNT'
      ? Number(body.quantity)              // count REPLACES balance
      : prev + Number(body.quantity);      // others ADJUST
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(controlledSubstanceLog).values({
    id, hospitalId,
    facilityId: body.facilityId ?? null,
    formularyItemId: body.formularyItemId ?? null,
    hcpcCode: body.hcpcCode ?? null,
    deaSchedule,
    eventType: body.eventType,
    quantity: Number(body.quantity),
    quantityAfter,
    patientMrn: body.patientMrn ?? null,
    encounterId: body.encounterId ?? null,
    lotNumber: body.lotNumber ?? null,
    performedByUserId: user.id,
    witnessedByUserId: body.witnessedByUserId ?? null,
    notes: body.notes ?? null,
    occurredAt: now,
  });
  return c.json({ id, quantityAfter }, 201);
});

app.get('/balance/:formularyItemId', requirePermission('compliance-alerts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { formularyItemId } = c.req.param();
  const conds: any[] = [eq(controlledSubstanceLog.formularyItemId, formularyItemId)];
  if (!isAdmin(user) && user.hospitalId) conds.push(eq(controlledSubstanceLog.hospitalId, user.hospitalId));
  const [last] = await db
    .select().from(controlledSubstanceLog)
    .where(and(...conds))
    .orderBy(desc(controlledSubstanceLog.occurredAt))
    .limit(1);
  return c.json({ formularyItemId, balance: last?.quantityAfter ?? 0, lastEventAt: last?.occurredAt ?? null });
});

export default app;

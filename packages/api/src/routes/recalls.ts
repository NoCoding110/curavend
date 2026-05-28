/**
 * /api/recalls — manufacturer recall intake + affected-item triage.
 *
 *   GET    /                       list (filter by state, severity, hcpc)
 *   POST   /                       create recall + auto-scan affected items
 *   GET    /:id                    detail + affected_items
 *   POST   /:id/disposition/:itemId  set disposition on one affected item
 *   POST   /:id/close              all dispositions set → CLOSED
 */
import { Hono } from 'hono';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  recalls, recallAffectedItems, RECALL_CLASSIFICATIONS, RECALL_ACTIONS,
  RECALL_DISPOSITIONS, labInventoryLots, pointOfUseEvents,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { ensureSequenceTable, getNextValue } from '../services/sequenceService';
import { logPhiAccess } from '../services/phiAuditService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/', requirePermission('compliance-alerts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const { state, severity, hcpcCode } = c.req.query();
  const conds: any[] = [];
  if (state) conds.push(eq(recalls.state, state));
  if (severity) conds.push(eq(recalls.severity, severity));
  if (hcpcCode) conds.push(eq(recalls.hcpcCode, hcpcCode));
  const rows = await db
    .select().from(recalls)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(recalls.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/', requirePermission('compliance-alerts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Admin-only');
  const body = (await c.req.json()) as any;
  if (!body.description || !body.actionRequired) {
    throw new ValidationError('description and actionRequired required');
  }
  if (body.classification && !(RECALL_CLASSIFICATIONS as readonly string[]).includes(body.classification)) {
    throw new ValidationError(`classification must be one of ${RECALL_CLASSIFICATIONS.join(', ')}`);
  }
  if (!(RECALL_ACTIONS as readonly string[]).includes(body.actionRequired)) {
    throw new ValidationError(`actionRequired must be one of ${RECALL_ACTIONS.join(', ')}`);
  }
  await ensureSequenceTable(db);
  const seq = await getNextValue(db, 'recalls');
  const id = crypto.randomUUID();
  const recallNumber = `REC-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
  const now = new Date().toISOString();
  const lotsJson = Array.isArray(body.lotNumbers) ? JSON.stringify(body.lotNumbers) : null;

  await db.insert(recalls).values({
    id, recallNumber,
    manufacturerRecallId: body.manufacturerRecallId ?? null,
    manufacturerName: body.manufacturerName ?? null,
    noticeReceivedAt: body.noticeReceivedAt ?? now,
    classification: body.classification ?? null,
    severity: body.severity ?? (body.classification === 'CLASS_I' ? 'CRITICAL' : 'WARN'),
    hcpcCode: body.hcpcCode ?? null,
    manufacturerNumber: body.manufacturerNumber ?? null,
    lotNumbers: lotsJson,
    description: body.description,
    actionRequired: body.actionRequired,
    state: 'OPEN',
    createdByUserId: user.id,
    createdAt: now, updatedAt: now,
  });

  // ─── Auto-scan affected items ──────────────────────────────────────────
  // Match by hcpc + (optionally) lot number. Quarantine lab lots on the spot.
  let affectedCount = 0;
  try {
    if (body.hcpcCode) {
      const lotMatch = Array.isArray(body.lotNumbers) && body.lotNumbers.length > 0
        ? body.lotNumbers as string[]
        : null;

      // Lab inventory lots.
      let lotQuery: any = db
        .select({
          id: labInventoryLots.id, lotNumber: labInventoryLots.lotNumber,
          siteId: labInventoryLots.siteId, quantityOnHand: labInventoryLots.quantityOnHand,
        })
        .from(labInventoryLots);
      const lotConds: any[] = [eq(labInventoryLots.status, 'ACTIVE')];
      if (lotMatch) lotConds.push(inArray(labInventoryLots.lotNumber, lotMatch));
      lotQuery = lotQuery.where(and(...lotConds));
      const lots = await lotQuery;
      for (const lot of lots) {
        await db.insert(recallAffectedItems).values({
          id: crypto.randomUUID(),
          recallId: id, kind: 'LAB_LOT', subjectId: lot.id,
          lotNumber: lot.lotNumber, quantityAffected: lot.quantityOnHand,
          createdAt: now,
        });
        // Auto-quarantine if action requires it.
        if (body.actionRequired === 'QUARANTINE' || body.actionRequired === 'RETURN' || body.actionRequired === 'DESTROY') {
          await db
            .update(labInventoryLots)
            .set({ status: 'QUARANTINED', notes: `Recall ${recallNumber}`, updatedAt: now })
            .where(eq(labInventoryLots.id, lot.id));
        }
        affectedCount++;
      }

      // POU events using this hcpc/lot — patient notification candidates.
      const pouConds: any[] = [eq(pointOfUseEvents.hcpcCode, body.hcpcCode)];
      if (lotMatch) pouConds.push(inArray(pointOfUseEvents.lotNumber, lotMatch));
      const pous = await db
        .select({
          id: pointOfUseEvents.id, hospitalId: pointOfUseEvents.hospitalId,
          patientMrn: pointOfUseEvents.patientMrn, lotNumber: pointOfUseEvents.lotNumber,
          quantity: pointOfUseEvents.quantity,
        })
        .from(pointOfUseEvents)
        .where(and(...pouConds))
        .limit(2000);
      for (const ev of pous) {
        await db.insert(recallAffectedItems).values({
          id: crypto.randomUUID(),
          recallId: id, kind: 'POU_EVENT', subjectId: ev.id,
          hospitalId: ev.hospitalId, lotNumber: ev.lotNumber,
          patientMrn: ev.patientMrn, quantityAffected: ev.quantity,
          createdAt: now,
        });
        affectedCount++;
      }
    }
  } catch (err) {
    console.error('[recalls] auto-scan failed', err);
  }

  return c.json({ id, recallNumber, affectedCount }, 201);
});

app.get('/:id', requirePermission('compliance-alerts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [row] = await db.select().from(recalls).where(eq(recalls.id, id)).limit(1);
  if (!row) throw new NotFoundError('Recall not found');
  const items = await db
    .select().from(recallAffectedItems)
    .where(eq(recallAffectedItems.recallId, id))
    .orderBy(desc(recallAffectedItems.createdAt))
    .limit(2000);
  await logPhiAccess(c.env, {
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    resourceType: 'RECALL',
    resourceId: id,
    action: 'VIEW',
    ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  });
  return c.json({ ...row, affectedItems: items });
});

app.post('/:id/disposition/:itemId', requirePermission('compliance-alerts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();
  const body = (await c.req.json()) as { disposition: string; notes?: string };
  if (!(RECALL_DISPOSITIONS as readonly string[]).includes(body.disposition)) {
    throw new ValidationError(`disposition must be one of ${RECALL_DISPOSITIONS.join(', ')}`);
  }
  const now = new Date().toISOString();
  await db.update(recallAffectedItems).set({
    disposition: body.disposition,
    dispositionedAt: now,
    dispositionedByUserId: user.id,
    notes: body.notes ?? null,
  }).where(and(eq(recallAffectedItems.id, itemId), eq(recallAffectedItems.recallId, id)));
  return c.json({ id, itemId, disposition: body.disposition });
});

app.post('/:id/close', requirePermission('compliance-alerts', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Admin-only');
  const { id } = c.req.param();
  const [row] = await db.select().from(recalls).where(eq(recalls.id, id)).limit(1);
  if (!row) throw new NotFoundError('Recall not found');
  if (row.state === 'CLOSED') throw new ConflictError('Already closed');
  // Check all affected items have dispositions.
  const undisposed = await db.run(sql.raw(`
    SELECT COUNT(*) AS c FROM recall_affected_items
    WHERE recall_id = '${id.replace(/'/g, "''")}' AND disposition IS NULL
  `));
  const remaining = Number(undisposed.results?.[0]?.c ?? 0);
  if (remaining > 0) {
    throw new ConflictError(`${remaining} affected items still need a disposition`);
  }
  const now = new Date().toISOString();
  await db.update(recalls).set({
    state: 'CLOSED', closedAt: now, closedByUserId: user.id, updatedAt: now,
  }).where(eq(recalls.id, id));
  return c.json({ id, state: 'CLOSED' });
});

export default app;

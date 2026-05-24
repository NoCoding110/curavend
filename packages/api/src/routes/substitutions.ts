/**
 * /api/substitutions — substitution audit log.
 *
 *   GET   /                 list (filter by context, hcpc, range)
 *   POST  /log              record a swap (called by create-order wizard,
 *                           backorder triage, requisition convert)
 *
 * Governance gate (PV3 caveat 4): non-admin callers must provide
 * `approverUserId` when the substitute is NOT in the formulary_substitutes
 * pre-approved list for the source HCPC. Admins bypass.
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  substitutionAuditLog, SUBSTITUTION_CONTEXTS,
  formularyItems, formularySubstitutes,
} from '@curavend/db';
import { ValidationError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

/**
 * True iff `toHcpcCode` is a pre-approved substitute for `fromHcpcCode` in
 * the hospital's formulary. Returns false on no-match (ad-hoc swap, needs
 * explicit approval).
 */
async function isApprovedSubstitute(
  d1: D1Database, hospitalId: string | null,
  fromHcpc: string, toHcpc: string,
): Promise<boolean> {
  if (!hospitalId) return false;
  const db = getDb(d1);
  const [fm] = await db
    .select({ id: formularyItems.id })
    .from(formularyItems)
    .where(and(
      eq(formularyItems.hospitalId, hospitalId),
      eq(formularyItems.hcpcCode, fromHcpc),
      eq(formularyItems.status, 'ACTIVE'),
    ))
    .limit(1);
  if (!fm) return false;
  const [sub] = await db
    .select({ id: formularySubstitutes.id })
    .from(formularySubstitutes)
    .where(and(
      eq(formularySubstitutes.formularyItemId, fm.id),
      eq(formularySubstitutes.substituteHcpcCode, toHcpc),
    ))
    .limit(1);
  return !!sub;
}

app.get('/', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { contextType, fromHcpcCode, contextId } = c.req.query();
  const conds: any[] = [];
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('hospital scope required');
    conds.push(eq(substitutionAuditLog.hospitalId, user.hospitalId));
  }
  if (contextType) conds.push(eq(substitutionAuditLog.contextType, contextType));
  if (fromHcpcCode) conds.push(eq(substitutionAuditLog.fromHcpcCode, fromHcpcCode));
  if (contextId) conds.push(eq(substitutionAuditLog.contextId, contextId));
  const rows = await db
    .select().from(substitutionAuditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(substitutionAuditLog.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/log', requirePermission('formulary', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.fromHcpcCode || !body.toHcpcCode || !body.contextType) {
    throw new ValidationError('fromHcpcCode, toHcpcCode, contextType required');
  }
  if (!(SUBSTITUTION_CONTEXTS as readonly string[]).includes(body.contextType)) {
    throw new ValidationError(`contextType must be one of ${SUBSTITUTION_CONTEXTS.join(', ')}`);
  }
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? user.hospitalId) : user.hospitalId;

  // Governance gate: ad-hoc (not-in-formulary) swaps need an approver.
  if (!isAdmin(user)) {
    const preApproved = await isApprovedSubstitute(
      c.env.DB, hospitalId ?? null, body.fromHcpcCode, body.toHcpcCode,
    );
    if (!preApproved && !body.approverUserId) {
      throw new ValidationError(
        `${body.toHcpcCode} is not in ${body.fromHcpcCode}'s approved-substitutes list. ` +
        `Provide approverUserId to record an ad-hoc swap.`,
      );
    }
  }

  const id = crypto.randomUUID();
  await db.insert(substitutionAuditLog).values({
    id, hospitalId: hospitalId ?? null,
    fromHcpcCode: body.fromHcpcCode,
    toHcpcCode: body.toHcpcCode,
    contextType: body.contextType,
    contextId: body.contextId ?? null,
    reason: body.reason ?? null,
    approverUserId: body.approverUserId ?? null,
    substitutedByUserId: user.id,
    createdAt: new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

export default app;

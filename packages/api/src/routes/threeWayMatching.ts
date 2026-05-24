/**
 * /api/three-way-match — 3-way matching for invoices.
 *
 * Endpoints:
 *   POST   /run/:invoiceId     — compute (or recompute) match for an invoice
 *   GET    /invoice/:invoiceId — fetch existing match rows for an invoice
 *   GET    /exceptions         — list all non-PERFECT matches (paginated)
 *   POST   /:matchId/resolve   — mark a match exception as resolved (ACCEPTED/DISPUTED/OVERRIDDEN)
 */
import { Hono } from 'hono';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { threeWayMatches, invoices, MATCH_STATUSES } from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { runThreeWayMatch } from '../services/threeWayMatchService';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

// ─── POST /run/:invoiceId ─────────────────────────────────────────────────
app.post('/run/:invoiceId', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const { invoiceId } = c.req.param();
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) throw new NotFoundError('Invoice not found');
  if (!isAdmin(user) && user.hospitalId && (inv as any).hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized for this invoice');
  }
  const results = await runThreeWayMatch(c.env.DB, invoiceId);
  return c.json({
    invoiceId,
    total: results.length,
    byStatus: results.reduce<Record<string, number>>((acc, r) => {
      acc[r.matchStatus] = (acc[r.matchStatus] ?? 0) + 1;
      return acc;
    }, {}),
    results,
  });
});

// ─── GET /invoice/:invoiceId ──────────────────────────────────────────────
app.get('/invoice/:invoiceId', requirePermission('goods-receipts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const { invoiceId } = c.req.param();
  const rows = await db
    .select()
    .from(threeWayMatches)
    .where(eq(threeWayMatches.invoiceId, invoiceId));
  return c.json({ items: rows });
});

// ─── GET /exceptions ──────────────────────────────────────────────────────
// All non-PERFECT, non-resolved matches (oldest first).
app.get('/exceptions', requirePermission('goods-receipts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { matchStatus } = c.req.query();
  const conds: any[] = [ne(threeWayMatches.matchStatus, 'PERFECT')];
  if (matchStatus && (MATCH_STATUSES as readonly string[]).includes(matchStatus)) {
    conds.push(eq(threeWayMatches.matchStatus, matchStatus));
  }
  const rows = await db
    .select()
    .from(threeWayMatches)
    .where(and(...conds))
    .orderBy(desc(threeWayMatches.computedAt))
    .limit(500);

  // Tenant-scope: only show exceptions on invoices the user can see
  if (!isAdmin(user) && user.hospitalId) {
    const invoiceIds = Array.from(new Set(rows.map((r) => r.invoiceId)));
    if (invoiceIds.length === 0) return c.json({ items: [] });
    const visible = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          inArray(invoices.id, invoiceIds),
          eq((invoices as any).hospitalId, user.hospitalId),
        ),
      );
    const visibleSet = new Set(visible.map((v) => v.id));
    return c.json({ items: rows.filter((r) => visibleSet.has(r.invoiceId)) });
  }
  return c.json({ items: rows });
});

// ─── POST /:matchId/resolve ───────────────────────────────────────────────
app.post('/:matchId/resolve', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { matchId } = c.req.param();
  const body = (await c.req.json()) as { resolution?: string; notes?: string };
  if (!body.resolution || !['ACCEPTED', 'DISPUTED', 'OVERRIDDEN'].includes(body.resolution)) {
    throw new ValidationError('resolution must be ACCEPTED, DISPUTED, or OVERRIDDEN');
  }
  const [row] = await db.select().from(threeWayMatches).where(eq(threeWayMatches.id, matchId)).limit(1);
  if (!row) throw new NotFoundError('Match not found');

  // Tenant guard
  if (!isAdmin(user) && user.hospitalId) {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, row.invoiceId)).limit(1);
    if (!inv || (inv as any).hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized');
    }
  }

  await db
    .update(threeWayMatches)
    .set({
      resolution: body.resolution,
      notes: body.notes ?? row.notes,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: user.id,
    })
    .where(eq(threeWayMatches.id, matchId));
  return c.json({ id: matchId, resolution: body.resolution });
});

export default app;

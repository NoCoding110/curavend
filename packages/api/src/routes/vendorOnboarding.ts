/**
 * /api/vendor-onboarding — supplier onboarding state machine.
 *
 *   GET    /                   list (filter by state, hospitalId)
 *   POST   /invite             create INVITED row (vendor + optional hospital + docs required)
 *   GET    /:id                detail + history
 *   POST   /:id/advance        bump to next state (with optional note)
 *   POST   /:id/mark-doc       mark a doc as received (toggles docsReceived)
 *   POST   /:id/suspend        any non-terminal → SUSPENDED
 *   POST   /:id/reactivate     SUSPENDED → ACTIVE
 *
 * Tenant scope: admin sees all; hospital users see their hospital's rows.
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorOnboardingStates,
  vendorOnboardingHistory,
  ONBOARDING_STATES,
  ONBOARDING_DOC_TYPES,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

// Linear advancement chain (callers can also SUSPEND from any non-terminal).
const NEXT: Record<string, string | null> = {
  INVITED: 'DOCS_PENDING',
  DOCS_PENDING: 'DOCS_RECEIVED',
  DOCS_RECEIVED: 'CREDENTIALED',
  CREDENTIALED: 'APPROVED',
  APPROVED: 'ACTIVE',
  ACTIVE: null,
  SUSPENDED: null,
};

async function appendHistory(
  db: any, onboardingId: string, fromState: string | null, toState: string,
  userId: string | undefined, note: string | null,
) {
  await db.insert(vendorOnboardingHistory).values({
    id: crypto.randomUUID(),
    onboardingId,
    fromState,
    toState,
    byUserId: userId,
    note,
    createdAt: new Date().toISOString(),
  });
}

app.get('/', requirePermission('vendor-onboarding', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { state, hospitalId } = c.req.query();
  const conds: any[] = [];
  if (state) conds.push(eq(vendorOnboardingStates.state, state));
  if (!isAdmin(user)) {
    if (user.hospitalId) conds.push(eq(vendorOnboardingStates.hospitalId, user.hospitalId));
    else throw new ForbiddenError('Hospital scope required');
  } else if (hospitalId) {
    conds.push(eq(vendorOnboardingStates.hospitalId, hospitalId));
  }
  const rows = await db
    .select()
    .from(vendorOnboardingStates)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(vendorOnboardingStates.updatedAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/invite', requirePermission('vendor-onboarding', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.vendorId) throw new ValidationError('vendorId required');
  const hospitalId = isAdmin(user) ? (body.hospitalId ?? null) : user.hospitalId ?? null;

  // Default doc list: covers the common hospital onboarding checklist.
  const docsRequired: string[] = Array.isArray(body.docsRequired) && body.docsRequired.length
    ? body.docsRequired.filter((d: string) => (ONBOARDING_DOC_TYPES as readonly string[]).includes(d))
    : ['W9', 'COI', 'OIG_ATTESTATION', 'MSA'];

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.insert(vendorOnboardingStates).values({
      id,
      vendorId: body.vendorId,
      hospitalId,
      state: 'INVITED',
      invitedByUserId: user.id,
      invitedAt: now,
      docsRequired: JSON.stringify(docsRequired),
      docsReceived: JSON.stringify([]),
      notes: body.notes ?? null,
      lastAdvancedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      throw new ConflictError('Vendor already has an onboarding row for this hospital');
    }
    throw err;
  }
  await appendHistory(db, id, null, 'INVITED', user.id, body.notes ?? null);
  return c.json({ id, state: 'INVITED' }, 201);
});

app.get('/:id', requirePermission('vendor-onboarding', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [row] = await db.select().from(vendorOnboardingStates).where(eq(vendorOnboardingStates.id, id)).limit(1);
  if (!row) throw new NotFoundError('Onboarding not found');
  if (!isAdmin(user) && row.hospitalId && row.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Onboarding belongs to a different tenant');
  }
  const history = await db
    .select()
    .from(vendorOnboardingHistory)
    .where(eq(vendorOnboardingHistory.onboardingId, id))
    .orderBy(desc(vendorOnboardingHistory.createdAt));
  return c.json({ ...row, history });
});

app.post('/:id/advance', requirePermission('vendor-onboarding', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  const [row] = await db.select().from(vendorOnboardingStates).where(eq(vendorOnboardingStates.id, id)).limit(1);
  if (!row) throw new NotFoundError('Onboarding not found');
  if (!isAdmin(user) && row.hospitalId && row.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Onboarding belongs to a different tenant');
  }
  const next = NEXT[row.state];
  if (!next) throw new ConflictError(`Cannot advance from ${row.state}`);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    state: next, updatedAt: now, lastAdvancedByUserId: user.id,
  };
  if (next === 'CREDENTIALED') patch.credentialedAt = now;
  if (next === 'APPROVED') patch.approvedAt = now;
  if (next === 'ACTIVE') patch.activatedAt = now;
  await db.update(vendorOnboardingStates).set(patch).where(eq(vendorOnboardingStates.id, id));
  await appendHistory(db, id, row.state, next, user.id, body.note ?? null);
  return c.json({ id, state: next });
});

app.post('/:id/mark-doc', requirePermission('vendor-onboarding', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as { doc: string; received: boolean };
  if (!body.doc) throw new ValidationError('doc required');
  const [row] = await db.select().from(vendorOnboardingStates).where(eq(vendorOnboardingStates.id, id)).limit(1);
  if (!row) throw new NotFoundError('Onboarding not found');
  if (!isAdmin(user) && row.hospitalId && row.hospitalId !== user.hospitalId) {
    throw new ForbiddenError('Onboarding belongs to a different tenant');
  }
  const received: string[] = row.docsReceived ? JSON.parse(row.docsReceived) : [];
  const filtered = received.filter((d) => d !== body.doc);
  if (body.received) filtered.push(body.doc);

  // Auto-advance INVITED → DOCS_PENDING on first doc received; DOCS_PENDING
  // → DOCS_RECEIVED when all required docs are in.
  const required: string[] = row.docsRequired ? JSON.parse(row.docsRequired) : [];
  let newState = row.state;
  if (row.state === 'INVITED' && filtered.length > 0) newState = 'DOCS_PENDING';
  if (row.state === 'DOCS_PENDING' && required.every((d) => filtered.includes(d))) {
    newState = 'DOCS_RECEIVED';
  }

  const now = new Date().toISOString();
  await db
    .update(vendorOnboardingStates)
    .set({
      docsReceived: JSON.stringify(filtered),
      state: newState,
      updatedAt: now,
      lastAdvancedByUserId: user.id,
    })
    .where(eq(vendorOnboardingStates.id, id));
  if (newState !== row.state) {
    await appendHistory(db, id, row.state, newState, user.id, `Auto-advance after doc: ${body.doc}`);
  }
  return c.json({ id, state: newState, docsReceived: filtered });
});

app.post('/:id/suspend', requirePermission('vendor-onboarding', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as { reason: string };
  if (!body.reason?.trim()) throw new ValidationError('reason required');
  const [row] = await db.select().from(vendorOnboardingStates).where(eq(vendorOnboardingStates.id, id)).limit(1);
  if (!row) throw new NotFoundError('Onboarding not found');
  if (row.state === 'SUSPENDED') throw new ConflictError('Already suspended');
  const now = new Date().toISOString();
  await db.update(vendorOnboardingStates).set({
    state: 'SUSPENDED', suspendedAt: now, suspendedReason: body.reason,
    updatedAt: now, lastAdvancedByUserId: user.id,
  }).where(eq(vendorOnboardingStates.id, id));
  await appendHistory(db, id, row.state, 'SUSPENDED', user.id, body.reason);
  return c.json({ id, state: 'SUSPENDED' });
});

app.post('/:id/reactivate', requirePermission('vendor-onboarding', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [row] = await db.select().from(vendorOnboardingStates).where(eq(vendorOnboardingStates.id, id)).limit(1);
  if (!row) throw new NotFoundError('Onboarding not found');
  if (row.state !== 'SUSPENDED') throw new ConflictError('Only SUSPENDED can be reactivated');
  const now = new Date().toISOString();
  await db.update(vendorOnboardingStates).set({
    state: 'ACTIVE', suspendedAt: null, suspendedReason: null,
    activatedAt: now, updatedAt: now, lastAdvancedByUserId: user.id,
  }).where(eq(vendorOnboardingStates.id, id));
  await appendHistory(db, id, 'SUSPENDED', 'ACTIVE', user.id, 'Reactivated');
  return c.json({ id, state: 'ACTIVE' });
});

export default app;

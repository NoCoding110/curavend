/**
 * Contracts & Pricing routes.
 *
 * Surface area:
 *   /                          GET (list) POST (create DRAFT)
 *   /:id                       GET PUT DELETE (single contract)
 *   /:id/items                 GET POST                  (mutable working set)
 *   /:id/items/:itemId         PUT DELETE
 *   /:id/submit | withdraw | approve | reject | request-changes | reopen
 *     | terminate | amend                                (state transitions)
 *   /:id/revisions             GET (list)
 *   /:id/revisions/:revId      GET (one snapshot)
 *   /:id/history               GET (narrative event log)
 *   /:id/extract-from-pdf      POST (Workers AI line-item suggestion)
 *
 *   /fee-schedules             GET POST  (custom fee schedules — legacy)
 *   /fee-schedules/:id         GET
 *   /fee-schedules/:id/items   GET POST
 *   /fee-schedules/:id/items/:itemId  PUT DELETE
 */
import { Hono } from 'hono';
import { eq, desc, asc, and, like, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  contracts,
  contractItems,
  contractRevisions,
  contractHistory,
  customFeeSchedules,
  customFeeScheduleItems,
  vendors,
  hospitals,
  users,
} from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import {
  assertContractAccess,
  assertCanReviewContract,
  isContractDrafter,
} from '../lib/contractAccess';
import {
  submitContract,
  withdrawContract,
  approveContract,
  rejectContract,
  requestContractChanges,
  reopenContract,
  terminateContract,
  amendContract,
} from '../lib/contractTransitions';
import { extractContractItemsFromPdf } from '../services/aiService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// Ensures the caller can write fee schedules for the given vendor.
// ADMIN: any vendor. VENDOR: only own vendor. Everyone else: 403.
function assertFeeScheduleWriteAccess(user: AuthUser, vendorId: string | null | undefined): void {
  if (user?.userType === 'ADMIN') return;
  if (user?.userType === 'VENDOR' && vendorId && vendorId === user.vendorId) return;
  throw new ForbiddenError('You do not have write access to this fee schedule');
}

// ---------------------------------------------------------------------------
// Contracts list + create
// ---------------------------------------------------------------------------

// GET /contracts - List contracts scoped by user role
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const {
    search, vendorId, hospitalId, status,
    limit = '50', offset = '0',
    sortBy, sortOrder,
  } = c.req.query();

  let conditions: any[] = [];

  if (user.userType !== 'ADMIN') {
    if (user.vendorId) {
      conditions.push(eq(contracts.vendorId, user.vendorId));
    } else if (user.hospitalId) {
      conditions.push(eq(contracts.hospitalId, user.hospitalId));
    } else if (user.providerId) {
      conditions.push(eq(contracts.providerId, user.providerId));
    } else if (user.superVendorId) {
      conditions.push(eq(contracts.superVendorId, user.superVendorId));
    }
  }

  if (search) conditions.push(like(contracts.name, `%${search}%`));
  if (vendorId) conditions.push(eq(contracts.vendorId, vendorId));
  if (hospitalId) conditions.push(eq(contracts.hospitalId, hospitalId));
  if (status) conditions.push(eq(contracts.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const CONTRACT_SORT: Record<string, any> = {
    name: contracts.name,
    startDate: contracts.startDate,
    endDate: contracts.endDate,
    createdAt: contracts.createdAt,
    status: contracts.status,
  };
  const sortCol = (sortBy && CONTRACT_SORT[sortBy]) || contracts.createdAt;
  const orderFn = sortOrder === 'asc' ? asc : desc;

  const [results, countResult] = await Promise.all([
    db
      .select({
        id: contracts.id,
        name: contracts.name,
        vendorId: contracts.vendorId,
        vendor: vendors.name,
        hospitalId: contracts.hospitalId,
        hospital: hospitals.name,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        s3key: contracts.s3key,
        status: contracts.status,
        initiatedBy: contracts.initiatedBy,
        currentRevisionId: contracts.currentRevisionId,
        parentContractId: contracts.parentContractId,
        createdAt: contracts.createdAt,
        updatedAt: contracts.updatedAt,
      })
      .from(contracts)
      .leftJoin(vendors, eq(contracts.vendorId, vendors.id))
      .leftJoin(hospitals, eq(contracts.hospitalId, hospitals.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` }).from(contracts).where(whereClause),
  ]);

  return c.json({ items: results, total: countResult[0]?.count ?? 0 });
});

// POST /contracts - Create new DRAFT contract
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.startDate || !body.endDate) {
    throw new ValidationError('startDate and endDate are required');
  }

  let hospitalId: string | null = body.hospitalId || null;
  let vendorId: string | null = body.vendorId || null;
  let providerId: string | null = body.providerId || null;
  let superVendorId: string | null = body.superVendorId || null;

  // Force-bind caller's tenant + set initiatedBy
  let initiatedBy: 'HOSPITAL' | 'VENDOR' | 'ADMIN';
  if (user?.userType === 'ADMIN') {
    initiatedBy = 'ADMIN';
  } else if (user?.userType === 'HOSPITAL') {
    if (!user.hospitalId) throw new ForbiddenError('Hospital user has no hospitalId');
    hospitalId = user.hospitalId;
    initiatedBy = 'HOSPITAL';
  } else if (user?.userType === 'VENDOR') {
    if (!user.vendorId) throw new ForbiddenError('Vendor user has no vendorId');
    vendorId = user.vendorId;
    initiatedBy = 'VENDOR';
  } else if (user?.userType === 'PROVIDER') {
    if (!user.providerId) throw new ForbiddenError('Provider user has no providerId');
    providerId = user.providerId;
    initiatedBy = 'ADMIN';
  } else if (user?.userType === 'SUPER_VENDOR') {
    if (!user.superVendorId) throw new ForbiddenError('Super-vendor user has no superVendorId');
    superVendorId = user.superVendorId;
    initiatedBy = 'ADMIN';
  } else {
    throw new ForbiddenError('You do not have permission to create contracts');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(contracts).values({
    id,
    startDate: body.startDate,
    endDate: body.endDate,
    name: body.name || null,
    hospitalId,
    vendorId,
    superVendorId,
    providerId,
    s3key: body.fileKey || body.s3key || null,
    status: 'DRAFT',
    initiatedBy,
    itemCategories: body.itemCategories ? JSON.stringify(body.itemCategories) : null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(contractHistory).values({
    contractId: id,
    description: `${user.email} created the contract`,
    changedByUserId: user.id,
  });

  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return c.json(result[0], 201);
});

// ---------------------------------------------------------------------------
// Custom Fee Schedules (must be registered before /:id to avoid conflict)
// ---------------------------------------------------------------------------

// GET /contracts/fee-schedules - List fee schedules scoped by user role
app.get('/fee-schedules', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const { limit = '50', offset = '0' } = c.req.query();

  let conditions: any[] = [];

  if (user?.userType !== 'ADMIN') {
    if (user?.userType === 'VENDOR' && user.vendorId) {
      conditions.push(eq(customFeeSchedules.vendorId, user.vendorId));
    } else if (user?.userType === 'HOSPITAL' && user.hospitalId) {
      const myVendorRows = await db
        .select({ vendorId: contracts.vendorId })
        .from(contracts)
        .where(eq(contracts.hospitalId, user.hospitalId));
      const myVendorIds = myVendorRows.map((r) => r.vendorId).filter((v): v is string => !!v);
      if (myVendorIds.length === 0) {
        return c.json({ items: [] });
      }
      conditions.push(inArray(customFeeSchedules.vendorId, myVendorIds));
    } else if (user?.userType === 'SUPER_VENDOR' && user.superVendorId) {
      const myVendorRows = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.superVendorId, user.superVendorId));
      const myVendorIds = myVendorRows.map((r) => r.id).filter((v): v is string => !!v);
      if (myVendorIds.length === 0) {
        return c.json({ items: [] });
      }
      conditions.push(inArray(customFeeSchedules.vendorId, myVendorIds));
    } else {
      return c.json({ items: [] });
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: customFeeSchedules.id,
      vendorId: customFeeSchedules.vendorId,
      vendor: vendors.name,
      startDate: customFeeSchedules.startDate,
      endDate: customFeeSchedules.endDate,
      createdAt: customFeeSchedules.createdAt,
    })
    .from(customFeeSchedules)
    .leftJoin(vendors, eq(customFeeSchedules.vendorId, vendors.id))
    .where(whereClause)
    .orderBy(desc(customFeeSchedules.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const items = results.map((r) => ({
    ...r,
    name: r.vendor
      ? `${r.vendor} Fee Schedule (${r.startDate ?? ''} – ${r.endDate ?? ''})`
      : `Fee Schedule (${r.startDate ?? ''} – ${r.endDate ?? ''})`,
  }));

  return c.json({ items });
});

// POST /contracts/fee-schedules - Create fee schedule
app.post('/fee-schedules', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  let vendorId: string = body.vendorId;
  if (user?.userType !== 'ADMIN') {
    if (user?.userType !== 'VENDOR' || !user.vendorId) {
      throw new ForbiddenError('Only admins or vendors can create fee schedules');
    }
    vendorId = user.vendorId;
  }

  if (!vendorId) throw new ValidationError('vendorId is required');
  if (!body.startDate || !body.endDate) throw new ValidationError('startDate and endDate are required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(customFeeSchedules).values({
    id,
    vendorId,
    startDate: body.startDate,
    endDate: body.endDate,
    s3key: body.s3key || '',
    createdAt: now,
    updatedAt: now,
  });

  const result = await db.select().from(customFeeSchedules).where(eq(customFeeSchedules.id, id)).limit(1);
  return c.json(result[0], 201);
});

// GET /contracts/fee-schedules/:id/items
app.get('/fee-schedules/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const items = await db
    .select()
    .from(customFeeScheduleItems)
    .where(eq(customFeeScheduleItems.feeScheduleId, id));

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      hcpcCode: item.hcpcCode,
      description: item.description,
      price: item.rate,
    })),
  });
});

// GET /contracts/fee-schedules/:id
app.get('/fee-schedules/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const result = await db.select().from(customFeeSchedules).where(eq(customFeeSchedules.id, id)).limit(1);
  if (!result.length) throw new NotFoundError('Fee schedule not found');

  const items = await db.select().from(customFeeScheduleItems).where(eq(customFeeScheduleItems.feeScheduleId, id));
  return c.json({ ...result[0], items });
});

// POST /contracts/fee-schedules/:id/items
app.post('/fee-schedules/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const schedule = await db.select().from(customFeeSchedules).where(eq(customFeeSchedules.id, id)).limit(1);
  if (!schedule.length) throw new NotFoundError('Fee schedule not found');
  assertFeeScheduleWriteAccess(user, schedule[0].vendorId);

  if (!body.hcpcCode) throw new ValidationError('hcpcCode is required');

  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(customFeeScheduleItems).values({
    id: itemId,
    feeScheduleId: id,
    hcpcCode: body.hcpcCode,
    description: body.description || null,
    rate: body.rate ?? body.price ?? null,
    createdAt: now,
  });

  const result = await db.select().from(customFeeScheduleItems).where(eq(customFeeScheduleItems.id, itemId)).limit(1);
  return c.json(result[0], 201);
});

// PUT /contracts/fee-schedules/:id/items/:itemId
app.put('/fee-schedules/:id/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();
  const body = await c.req.json();

  const schedule = await db.select().from(customFeeSchedules).where(eq(customFeeSchedules.id, id)).limit(1);
  if (!schedule.length) throw new NotFoundError('Fee schedule not found');
  assertFeeScheduleWriteAccess(user, schedule[0].vendorId);

  const updatePayload: any = { ...body };
  if (body.price !== undefined && body.rate === undefined) {
    updatePayload.rate = body.price;
    delete updatePayload.price;
  }

  await db.update(customFeeScheduleItems).set(updatePayload).where(eq(customFeeScheduleItems.id, itemId));
  const result = await db.select().from(customFeeScheduleItems).where(eq(customFeeScheduleItems.id, itemId)).limit(1);
  return c.json(result[0]);
});

// DELETE /contracts/fee-schedules/:id/items/:itemId
app.delete('/fee-schedules/:id/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();

  const schedule = await db.select().from(customFeeSchedules).where(eq(customFeeSchedules.id, id)).limit(1);
  if (!schedule.length) throw new NotFoundError('Fee schedule not found');
  assertFeeScheduleWriteAccess(user, schedule[0].vendorId);

  await db.delete(customFeeScheduleItems).where(eq(customFeeScheduleItems.id, itemId));
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Contract Items (mutable working set)
// ---------------------------------------------------------------------------

// GET /contracts/:id/items
app.get('/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'read');

  const items = await db
    .select()
    .from(contractItems)
    .where(eq(contractItems.contractId, id))
    .orderBy(asc(contractItems.hcpcCode));
  return c.json({ items });
});

// POST /contracts/:id/items — DRAFT only
app.post('/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'write');
  if (contract[0].status !== 'DRAFT') {
    throw new ValidationError(`Can only add items to DRAFT contracts (current: ${contract[0].status})`);
  }
  if (!body.hcpcCode) throw new ValidationError('hcpcCode is required');
  if (body.negotiatedRate === undefined || body.negotiatedRate === null) {
    throw new ValidationError('negotiatedRate is required');
  }

  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(contractItems).values({
    id: itemId,
    contractId: id,
    hcpcCode: body.hcpcCode,
    description: body.description || null,
    negotiatedRate: Number(body.negotiatedRate),
    quantity: body.quantity ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // bump contract updatedAt
  await db.update(contracts).set({ updatedAt: now }).where(eq(contracts.id, id));

  const result = await db.select().from(contractItems).where(eq(contractItems.id, itemId)).limit(1);
  return c.json(result[0], 201);
});

// PUT /contracts/:id/items/:itemId — DRAFT only
app.put('/:id/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();
  const body = await c.req.json();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'write');
  if (contract[0].status !== 'DRAFT') {
    throw new ValidationError(`Can only edit items on DRAFT contracts (current: ${contract[0].status})`);
  }

  const now = new Date().toISOString();
  const updatePayload: any = { updatedAt: now };
  if (body.hcpcCode !== undefined) updatePayload.hcpcCode = body.hcpcCode;
  if (body.description !== undefined) updatePayload.description = body.description;
  if (body.negotiatedRate !== undefined) updatePayload.negotiatedRate = Number(body.negotiatedRate);
  if (body.quantity !== undefined) updatePayload.quantity = body.quantity;

  await db.update(contractItems).set(updatePayload).where(eq(contractItems.id, itemId));
  await db.update(contracts).set({ updatedAt: now }).where(eq(contracts.id, id));

  const result = await db.select().from(contractItems).where(eq(contractItems.id, itemId)).limit(1);
  return c.json(result[0]);
});

// DELETE /contracts/:id/items/:itemId — DRAFT only
app.delete('/:id/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, itemId } = c.req.param();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'write');
  if (contract[0].status !== 'DRAFT') {
    throw new ValidationError(`Can only delete items on DRAFT contracts (current: ${contract[0].status})`);
  }

  await db.delete(contractItems).where(eq(contractItems.id, itemId));
  await db.update(contracts).set({ updatedAt: new Date().toISOString() }).where(eq(contracts.id, id));
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

app.post('/:id/submit', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const result = await submitContract(c.env, user, id);
  return c.json({ success: true, ...result });
});

app.post('/:id/withdraw', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const result = await withdrawContract(c.env, user, id);
  return c.json({ success: true, ...result });
});

app.post('/:id/approve', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const result = await approveContract(c.env, user, id);
  return c.json({ success: true, ...result });
});

app.post('/:id/reject', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const result = await rejectContract(c.env, user, id, body.reason);
  return c.json({ success: true, ...result });
});

app.post('/:id/request-changes', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const result = await requestContractChanges(c.env, user, id, body.comment ?? '');
  return c.json({ success: true, ...result });
});

app.post('/:id/reopen', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const result = await reopenContract(c.env, user, id);
  return c.json({ success: true, ...result });
});

app.post('/:id/terminate', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const result = await terminateContract(c.env, user, id, body.reason);
  return c.json({ success: true, ...result });
});

app.post('/:id/amend', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const result = await amendContract(c.env, user, id);
  return c.json({ success: true, ...result }, 201);
});

// ---------------------------------------------------------------------------
// Revisions + history (read-only)
// ---------------------------------------------------------------------------

app.get('/:id/revisions', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'read');

  const rows = await db
    .select({
      id: contractRevisions.id,
      revisionNumber: contractRevisions.revisionNumber,
      s3key: contractRevisions.s3key,
      name: contractRevisions.name,
      startDate: contractRevisions.startDate,
      endDate: contractRevisions.endDate,
      submittedByUserId: contractRevisions.submittedByUserId,
      submittedAt: contractRevisions.submittedAt,
      submittedByEmail: users.email,
      reviewedByUserId: contractRevisions.reviewedByUserId,
      reviewedAt: contractRevisions.reviewedAt,
      reviewDecision: contractRevisions.reviewDecision,
      reviewComment: contractRevisions.reviewComment,
    })
    .from(contractRevisions)
    .leftJoin(users, eq(contractRevisions.submittedByUserId, users.id))
    .where(eq(contractRevisions.contractId, id))
    .orderBy(desc(contractRevisions.revisionNumber));

  return c.json({ items: rows });
});

app.get('/:id/revisions/:revId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, revId } = c.req.param();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'read');

  const rows = await db.select().from(contractRevisions).where(eq(contractRevisions.id, revId)).limit(1);
  if (!rows.length) throw new NotFoundError('Revision not found');
  if (rows[0].contractId !== id) throw new NotFoundError('Revision not found for this contract');

  // Parse the JSON snapshot
  let items: any[] = [];
  try {
    items = JSON.parse(rows[0].itemsSnapshot);
  } catch {
    items = [];
  }
  return c.json({ ...rows[0], items });
});

app.get('/:id/history', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'read');

  const rows = await db
    .select({
      id: contractHistory.id,
      description: contractHistory.description,
      changedByUserId: contractHistory.changedByUserId,
      changedByEmail: users.email,
      createdAt: contractHistory.createdAt,
    })
    .from(contractHistory)
    .leftJoin(users, eq(contractHistory.changedByUserId, users.id))
    .where(eq(contractHistory.contractId, id))
    .orderBy(desc(contractHistory.createdAt));

  return c.json({ items: rows });
});

// POST /contracts/:id/extract-from-pdf — AI suggestion (returns suggestions; never saves)
app.post('/:id/extract-from-pdf', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  const contract = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!contract.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, contract[0], 'write');
  if (contract[0].status !== 'DRAFT') {
    throw new ValidationError('PDF extraction only available on DRAFT contracts');
  }

  // Accept either inline base64 (from frontend pdfjs render) or use the s3key
  // already attached to the contract.
  const imageBase64: string | undefined = body.imageBase64 || body.base64;
  if (!imageBase64) {
    throw new ValidationError('imageBase64 is required (render PDF page 1 to PNG client-side)');
  }

  const suggestions = await extractContractItemsFromPdf(c.env, imageBase64);
  return c.json({ suggestions });
});

// ---------------------------------------------------------------------------
// Single contract (after fee-schedules + transitions to avoid route conflict)
// ---------------------------------------------------------------------------

// GET /contracts/:id - Get single contract (with items + computed flags)
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const result = await db
    .select({
      id: contracts.id,
      name: contracts.name,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      s3key: contracts.s3key,
      status: contracts.status,
      initiatedBy: contracts.initiatedBy,
      currentRevisionId: contracts.currentRevisionId,
      parentContractId: contracts.parentContractId,
      terminatedAt: contracts.terminatedAt,
      terminatedBy: contracts.terminatedBy,
      terminationReason: contracts.terminationReason,
      rejectedReason: contracts.rejectedReason,
      itemCategories: contracts.itemCategories,
      vendorId: contracts.vendorId,
      vendor: vendors.name,
      hospitalId: contracts.hospitalId,
      hospital: hospitals.name,
      superVendorId: contracts.superVendorId,
      providerId: contracts.providerId,
      createdAt: contracts.createdAt,
      updatedAt: contracts.updatedAt,
    })
    .from(contracts)
    .leftJoin(vendors, eq(contracts.vendorId, vendors.id))
    .leftJoin(hospitals, eq(contracts.hospitalId, hospitals.id))
    .where(eq(contracts.id, id))
    .limit(1);

  if (!result.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, result[0], 'read');

  // Compute action capabilities from the user's perspective
  const contract = result[0];
  const drafter = isContractDrafter(user, contract);
  let canReview = false;
  try {
    assertCanReviewContract(user, contract);
    canReview = true;
  } catch {
    canReview = false;
  }

  return c.json({
    ...contract,
    permissions: {
      isDrafter: drafter,
      canReview,
      canWrite: user.userType === 'ADMIN' ||
        (contract.hospitalId === user.hospitalId) ||
        (contract.vendorId === user.vendorId),
    },
  });
});

// PUT /contracts/:id - Update contract metadata (DRAFT only for non-admins)
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, existing[0], 'write');

  if (user?.userType !== 'ADMIN' && existing[0].status !== 'DRAFT') {
    throw new ValidationError(`Can only edit contracts in DRAFT status (current: ${existing[0].status})`);
  }

  const safeBody = { ...body };
  if (user?.userType !== 'ADMIN') {
    delete safeBody.hospitalId;
    delete safeBody.vendorId;
    delete safeBody.providerId;
    delete safeBody.superVendorId;
    delete safeBody.status; // status is only changed via transition endpoints
    delete safeBody.initiatedBy;
    delete safeBody.currentRevisionId;
    delete safeBody.parentContractId;
  }
  if (safeBody.itemCategories && typeof safeBody.itemCategories !== 'string') {
    safeBody.itemCategories = JSON.stringify(safeBody.itemCategories);
  }

  await db.update(contracts).set({ ...safeBody, updatedAt: new Date().toISOString() }).where(eq(contracts.id, id));
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return c.json(result[0]);
});

// DELETE /contracts/:id - Delete contract (DRAFT or REJECTED only for non-admins)
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Contract not found');
  assertContractAccess(user, existing[0], 'write');

  if (user?.userType !== 'ADMIN' &&
      existing[0].status !== 'DRAFT' &&
      existing[0].status !== 'REJECTED') {
    throw new ValidationError(`Can only delete DRAFT or REJECTED contracts (current: ${existing[0].status})`);
  }

  // Cascade delete items + revisions + history (no FK cascade in SQLite by default here)
  await db.delete(contractItems).where(eq(contractItems.contractId, id));
  await db.delete(contractRevisions).where(eq(contractRevisions.contractId, id));
  await db.delete(contractHistory).where(eq(contractHistory.contractId, id));
  await db.delete(contracts).where(eq(contracts.id, id));

  return c.json({ success: true });
});

export default app;

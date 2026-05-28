/**
 * labs.ts — Full lab portal API.
 *
 * Covers lab groups, kit sites, lab orders (creation triggers asset-gen
 * workflow), approval/rejection, PDF asset download, and dashboard counts.
 *
 * All routes scope by user.labGroupId for LAB users; ADMIN sees everything.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql, count, like, or } from 'drizzle-orm';
import {
  labGroups,
  labKitSites,
  labOrders,
  labOrderItems,
  workflowInstances,
} from '@curavend/db';
import { getDb } from '../lib/db';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { startWorkflow, getWorkflowStatus } from '../services/workflowService';
import { autoConsumeForLabOrder } from '../services/labInventoryService';
import { downloadFile } from '../services/storageService';
import { generateLabOrderTrackingReport, XLSX_CONTENT_TYPE } from '../services/xlsxService';
import { logPhiAccess } from '../services/phiAuditService';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// Scope helper — LAB users only see their group; ADMIN sees all
function scopeCondition(user: any, columnName: 'lab_group_id' = 'lab_group_id'): any {
  if (user.userType === 'ADMIN') return null;
  if (user.userType === 'LAB' && user.labGroupId) {
    if (columnName === 'lab_group_id') return eq(labOrders.labGroupId, user.labGroupId);
  }
  // Default: no access for non-LAB / non-ADMIN
  throw new ForbiddenError('Lab portal access denied');
}

function requireLabOrAdmin(user: any): void {
  if (user.userType !== 'LAB' && user.userType !== 'ADMIN') {
    throw new ForbiddenError('Lab portal requires LAB or ADMIN user type');
  }
}

// ─── Lab Groups CRUD ───────────────────────────────────────────────────────

app.get('/groups', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const db = getDb(c.env.DB);
  let rows;
  if (user.userType === 'LAB' && user.labGroupId) {
    rows = await db.select().from(labGroups).where(eq(labGroups.id, user.labGroupId));
  } else {
    rows = await db.select().from(labGroups).orderBy(desc(labGroups.createdAt));
  }
  return c.json({ data: rows });
});

const createGroupSchema = z.object({
  name: z.string().min(1),
  groupType: z.enum(['SINGLE_SITE', 'D2P']),
  vendorId: z.string().optional(),
  description: z.string().optional(),
});
app.post('/groups', async (c) => {
  const user = c.get('user') as any;
  if (user.userType !== 'ADMIN') throw new ForbiddenError('Only ADMIN can create lab groups');
  const body = await c.req.json();
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const db = getDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(labGroups).values({
    id,
    name: parsed.data.name,
    groupType: parsed.data.groupType,
    vendorId: parsed.data.vendorId ?? null,
    description: parsed.data.description ?? null,
  });
  return c.json({ id, ...parsed.data }, 201);
});

app.put('/groups/:id', async (c) => {
  const user = c.get('user') as any;
  if (user.userType !== 'ADMIN') throw new ForbiddenError('Only ADMIN can update lab groups');
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  const set: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.name) set.name = body.name;
  if (body.groupType) set.groupType = body.groupType;
  if (body.vendorId !== undefined) set.vendorId = body.vendorId;
  if (body.description !== undefined) set.description = body.description;
  await db.update(labGroups).set(set).where(eq(labGroups.id, id));
  return c.json({ success: true, id });
});

app.delete('/groups/:id', async (c) => {
  const user = c.get('user') as any;
  if (user.userType !== 'ADMIN') throw new ForbiddenError('Only ADMIN can delete lab groups');
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  await db.delete(labGroups).where(eq(labGroups.id, id));
  return c.json({ success: true });
});

// ─── Kit Sites CRUD ────────────────────────────────────────────────────────

app.get('/kit-sites', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const db = getDb(c.env.DB);
  const filter = user.userType === 'LAB' && user.labGroupId
    ? eq(labKitSites.labGroupId, user.labGroupId)
    : undefined;
  const rows = await (filter ? db.select().from(labKitSites).where(filter) : db.select().from(labKitSites));
  return c.json({ data: rows });
});

const createKitSiteSchema = z.object({
  labGroupId: z.string().min(1),
  siteName: z.string().min(1),
  siteNumber: z.string().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
});
app.post('/kit-sites', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const body = await c.req.json();
  const parsed = createKitSiteSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  if (user.userType === 'LAB' && user.labGroupId && parsed.data.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Cannot create kit site for another lab group');
  }
  const db = getDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(labKitSites).values({
    id,
    ...parsed.data,
    siteNumber: parsed.data.siteNumber ?? null,
    addressLine2: parsed.data.addressLine2 ?? null,
    contactName: parsed.data.contactName ?? null,
    contactPhone: parsed.data.contactPhone ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
  });
  return c.json({ id, ...parsed.data }, 201);
});

app.put('/kit-sites/:id', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  const existing = (await db.select().from(labKitSites).where(eq(labKitSites.id, id)).limit(1))[0];
  if (!existing) throw new NotFoundError('Kit site not found');
  if (user.userType === 'LAB' && user.labGroupId && existing.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Cannot modify kit site outside your lab group');
  }
  const set: Record<string, any> = { updatedAt: new Date().toISOString() };
  for (const k of ['siteName', 'siteNumber', 'addressLine1', 'addressLine2', 'city', 'state', 'zip', 'contactName', 'contactPhone', 'contactEmail']) {
    if (body[k] !== undefined) set[k] = body[k];
  }
  await db.update(labKitSites).set(set).where(eq(labKitSites.id, id));
  return c.json({ success: true, id });
});

app.delete('/kit-sites/:id', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const existing = (await db.select().from(labKitSites).where(eq(labKitSites.id, id)).limit(1))[0];
  if (!existing) throw new NotFoundError('Kit site not found');
  if (user.userType === 'LAB' && user.labGroupId && existing.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Cannot delete kit site outside your lab group');
  }
  await db.delete(labKitSites).where(eq(labKitSites.id, id));
  return c.json({ success: true });
});

// ─── Lab Orders ────────────────────────────────────────────────────────────

const createLabOrderSchema = z.object({
  labGroupId: z.string().min(1),
  kitSiteId: z.string().optional(),
  lcOrderReference: z.string().optional(),
  patientName: z.string().optional(),
  patientLastName: z.string().optional(),
  patientEmail: z.string().email().optional().or(z.literal('')),
  patientPhone: z.string().optional(),
  patientAddress: z.string().optional(),
  patientCity: z.string().optional(),
  patientState: z.string().optional(),
  patientZip: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  dxCodeList: z.array(z.object({ code: z.string() })).optional(),
  testList: z.array(z.object({ testCode: z.string(), testName: z.string() })).optional(),
  items: z.array(z.object({
    productId: z.string().optional(),
    testCode: z.string().optional(),
    testName: z.string().optional(),
    specimenType: z.string().optional(),
    barcode: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
  })).optional(),
  notes: z.string().optional(),
  // Athome parity — optional external-vendor reference (for ingested orders)
  externalOrderRef: z.string().optional(),
  externalVendorName: z.string().optional(),
});

app.post('/orders', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const body = await c.req.json();
  const parsed = createLabOrderSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  if (user.userType === 'LAB' && user.labGroupId && parsed.data.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Cannot create order for another lab group');
  }
  const db = getDb(c.env.DB);
  const id = crypto.randomUUID();
  const orderNumber = `LAB-${new Date().getFullYear()}-${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`;
  await db.insert(labOrders).values({
    id,
    orderNumber,
    parentOrderId: null,
    lcOrderReference: parsed.data.lcOrderReference ?? null,
    labGroupId: parsed.data.labGroupId,
    kitSiteId: parsed.data.kitSiteId ?? null,
    createdByUserId: user.id,
    patientName: parsed.data.patientName ?? null,
    patientLastName: parsed.data.patientLastName ?? null,
    patientEmail: parsed.data.patientEmail || null,
    patientPhone: parsed.data.patientPhone ?? null,
    patientAddress: parsed.data.patientAddress ?? null,
    patientCity: parsed.data.patientCity ?? null,
    patientState: parsed.data.patientState ?? null,
    patientZip: parsed.data.patientZip ?? null,
    quantity: parsed.data.quantity,
    dxCodeList: parsed.data.dxCodeList ? JSON.stringify(parsed.data.dxCodeList) : null,
    testList: parsed.data.testList ? JSON.stringify(parsed.data.testList) : null,
    status: 'OPEN',
    readyForApproval: 0,
    notes: parsed.data.notes ?? null,
  });
  if (parsed.data.items?.length) {
    for (const item of parsed.data.items) {
      await db.insert(labOrderItems).values({
        id: crypto.randomUUID(),
        labOrderId: id,
        productId: item.productId ?? null,
        testCode: item.testCode ?? null,
        testName: item.testName ?? null,
        specimenType: item.specimenType ?? null,
        barcode: item.barcode ?? null,
        quantity: item.quantity,
      });
    }
  }
  // Kick off asset-gen workflow
  let workflowInstanceId: string | null = null;
  try {
    const wf = await startWorkflow(c.env, 'LAB_ORDER_ASSET_GEN', 'lab_order', id, { labOrderId: id });
    workflowInstanceId = wf.instanceId;
  } catch (err) {
    console.error('[labs] Failed to start asset-gen workflow:', err);
  }

  // Auto-consume mapped consumables from kit-site inventory (FEFO).
  // Non-blocking: shortages are surfaced in the response so the caller can warn.
  let consumption: { attempted: number; fullyIssued: number; shortages: any[] } = {
    attempted: 0,
    fullyIssued: 0,
    shortages: [],
  };
  if (parsed.data.kitSiteId && parsed.data.items?.length) {
    try {
      const items = parsed.data.items
        .filter((i: any) => i.testCode)
        .map((i: any) => ({ testCode: i.testCode, quantity: i.quantity }));
      if (items.length > 0) {
        consumption = await autoConsumeForLabOrder(c.env.DB, {
          labOrderId: id,
          siteId: parsed.data.kitSiteId,
          labGroupId: parsed.data.labGroupId,
          items,
          performedByUserId: user.id,
        });
      }
    } catch (err) {
      console.error('[labs] auto-consume failed:', err);
    }
  }

  return c.json({ id, orderNumber, workflowInstanceId, consumption }, 201);
});

app.get('/orders', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const db = getDb(c.env.DB);
  const search = c.req.query('q');
  const status = c.req.query('status');
  const limit = Math.min(200, Number(c.req.query('limit') ?? 50));
  const offset = Number(c.req.query('offset') ?? 0);
  const conditions: any[] = [];
  if (user.userType === 'LAB' && user.labGroupId) conditions.push(eq(labOrders.labGroupId, user.labGroupId));
  if (status) conditions.push(eq(labOrders.status, status));
  if (search) {
    const pat = `%${search}%`;
    conditions.push(
      or(
        like(labOrders.orderNumber, pat),
        like(labOrders.patientName, pat),
        like(labOrders.patientLastName, pat),
        like(labOrders.lcOrderReference, pat),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(labOrders)
    .where(where as any)
    .orderBy(desc(labOrders.createdAt))
    .limit(limit)
    .offset(offset);
  const totalRes = await db
    .select({ count: count() })
    .from(labOrders)
    .where(where as any);
  return c.json({ data: rows, total: Number(totalRes[0]?.count ?? 0), limit, offset });
});

app.get('/orders/:id', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  const items = await db.select().from(labOrderItems).where(eq(labOrderItems.labOrderId, id));
  await logPhiAccess(c.env, {
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    resourceType: 'LAB_ORDER',
    resourceId: id,
    action: 'VIEW',
    ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  });
  return c.json({ data: { ...ord, items } });
});

app.put('/orders/:id', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  const set: Record<string, any> = { updatedAt: new Date().toISOString() };
  for (const k of ['patientName', 'patientLastName', 'patientEmail', 'patientPhone', 'patientAddress', 'patientCity', 'patientState', 'patientZip', 'notes', 'trackingNumber', 'carrier']) {
    if (body[k] !== undefined) set[k] = body[k];
  }
  if (body.dxCodeList !== undefined) set.dxCodeList = body.dxCodeList ? JSON.stringify(body.dxCodeList) : null;
  if (body.testList !== undefined) set.testList = body.testList ? JSON.stringify(body.testList) : null;
  await db.update(labOrders).set(set).where(eq(labOrders.id, id));
  return c.json({ success: true });
});

app.post('/orders/:id/approve', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  const now = new Date().toISOString();
  await db.update(labOrders).set({
    status: 'APPROVED',
    approvedBy: user.id,
    approvedAt: now,
    readyForApproval: 0,
    updatedAt: now,
  }).where(eq(labOrders.id, id));
  return c.json({ success: true });
});

app.post('/orders/:id/reject', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const body = (await c.req.json()) as { reason?: string };
  if (!body?.reason || body.reason.trim().length < 3) throw new ValidationError('reason is required');
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  const now = new Date().toISOString();
  await db.update(labOrders).set({
    status: 'REJECTED',
    rejectionReason: body.reason.trim(),
    rejectedBy: user.id,
    rejectedAt: now,
    updatedAt: now,
  }).where(eq(labOrders.id, id));
  return c.json({ success: true });
});

// ─── Athome parity: ingest, replay, qc-failure, parse-barcode ─────────────

import { writeReceived, appendEvent, loadJournalEntry } from '../services/auditJournalService';
import { parseHl7Barcode } from '../lib/hl7BarcodeParser';
import { dispatchCustomerEvent as dispatchEvent } from '../services/notificationRouter';
import { slaBreachTemplate as slaTmpl } from '../services/emailService';

/**
 * Internal helper: given a validated create-lab-order payload, persist the
 * row, items, and kick off the asset-gen workflow. Returns {id, orderNumber}.
 * Used by both POST /orders and POST /orders/ingest (and /replay).
 */
async function persistLabOrderFromPayload(
  env: Env,
  user: any,
  data: any,
): Promise<{ id: string; orderNumber: string; workflowInstanceId: string | null }> {
  const db = getDb(env.DB);
  const id = crypto.randomUUID();
  const orderNumber = `LAB-${new Date().getFullYear()}-${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`;
  await db.insert(labOrders).values({
    id,
    orderNumber,
    parentOrderId: null,
    lcOrderReference: data.lcOrderReference ?? null,
    labGroupId: data.labGroupId,
    kitSiteId: data.kitSiteId ?? null,
    createdByUserId: user.id ?? 'ingest',
    patientName: data.patientName ?? null,
    patientLastName: data.patientLastName ?? null,
    patientEmail: data.patientEmail || null,
    patientPhone: data.patientPhone ?? null,
    patientAddress: data.patientAddress ?? null,
    patientCity: data.patientCity ?? null,
    patientState: data.patientState ?? null,
    patientZip: data.patientZip ?? null,
    quantity: data.quantity ?? 1,
    dxCodeList: data.dxCodeList ? JSON.stringify(data.dxCodeList) : null,
    testList: data.testList ? JSON.stringify(data.testList) : null,
    status: 'OPEN',
    readyForApproval: 0,
    notes: data.notes ?? null,
    externalOrderRef: data.externalOrderRef ?? null,
    externalVendorName: data.externalVendorName ?? null,
  });
  if (data.items?.length) {
    for (const item of data.items) {
      await db.insert(labOrderItems).values({
        id: crypto.randomUUID(),
        labOrderId: id,
        productId: item.productId ?? null,
        testCode: item.testCode ?? null,
        testName: item.testName ?? null,
        specimenType: item.specimenType ?? null,
        barcode: item.barcode ?? null,
        quantity: item.quantity ?? 1,
      });
    }
  }
  let workflowInstanceId: string | null = null;
  try {
    const wf = await startWorkflow(env, 'LAB_ORDER_ASSET_GEN', 'lab_order', id, { labOrderId: id });
    workflowInstanceId = wf.instanceId;
  } catch (err) {
    console.error('[labs] Failed to start asset-gen workflow:', err);
  }
  return { id, orderNumber, workflowInstanceId };
}

/**
 * POST /orders/ingest — idempotent order-creation endpoint suitable for
 * external systems. Uses Idempotency-Key header for dedup, journals every
 * payload to R2 + DB, kicks off normal asset-gen workflow.
 */
app.post('/orders/ingest', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const body = await c.req.json();
  const parsed = createLabOrderSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  if (user.userType === 'LAB' && user.labGroupId && parsed.data.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Cannot ingest order for another lab group');
  }

  const idempotencyKey = c.req.header('Idempotency-Key') ?? c.req.header('X-Idempotency-Key') ?? null;
  const orderRef = (body as any).externalOrderRef ?? `INGEST-${crypto.randomUUID().slice(0, 12)}`;
  const sourceIp = c.req.header('CF-Connecting-IP') ?? null;

  const journal = await writeReceived(c.env, {
    orderRef,
    idempotencyKey,
    labGroupId: parsed.data.labGroupId,
    payload: body,
    sourceIp,
  });
  if (journal.isDuplicate) {
    return c.json({
      duplicate: true,
      journalId: journal.journalId,
      labOrderId: journal.existingLabOrderId,
    });
  }

  try {
    const result = await persistLabOrderFromPayload(c.env, user, parsed.data);
    await appendEvent(c.env, {
      parentJournalId: journal.journalId,
      orderRef,
      event: 'PROCESSED',
      labOrderId: result.id,
    });
    return c.json(
      { ...result, journalId: journal.journalId, idempotencyKey },
      201,
    );
  } catch (err: any) {
    await appendEvent(c.env, {
      parentJournalId: journal.journalId,
      orderRef,
      event: 'FAILED',
      errorMessage: err?.message ?? String(err),
    });
    throw err;
  }
});

/**
 * POST /orders/replay/:journalId — admin-only. Re-runs ingestion from a
 * journal entry. Creates a NEW lab order (different id, fresh asset
 * workflow). Does NOT mutate the original.
 */
app.post('/orders/replay/:journalId', async (c) => {
  const user = c.get('user') as any;
  if (user.userType !== 'ADMIN') {
    throw new ForbiddenError('Only ADMIN can replay ingest journal entries');
  }
  const journalId = c.req.param('journalId');
  const loaded = await loadJournalEntry(c.env, journalId);
  if (!loaded) throw new NotFoundError('Journal entry not found');

  const parsed = createLabOrderSchema.safeParse(loaded.payload);
  if (!parsed.success) {
    throw new ValidationError(`Journal payload no longer valid: ${parsed.error.issues[0].message}`);
  }

  const result = await persistLabOrderFromPayload(c.env, user, parsed.data);
  await appendEvent(c.env, {
    parentJournalId: journalId,
    orderRef: loaded.entry.orderRef,
    event: 'REPLAYED',
    labOrderId: result.id,
  });
  return c.json({
    ok: true,
    replayedFromJournalId: journalId,
    newLabOrderId: result.id,
    newOrderNumber: result.orderNumber,
  });
});

/**
 * POST /orders/:id/qc-failure — admin/lab can manually log a QC failure.
 * Mirrors the external webhook business rules: attempt 1-2 keeps PENDING,
 * attempt 3 or `permanentlyFailed=true` flips to QC_FAILED.
 */
app.post('/orders/:id/qc-failure', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    attemptNumber: number;
    permanentlyFailed?: boolean;
    reason: string;
  };
  if (!body?.reason || body.reason.trim().length < 3) {
    throw new ValidationError('reason is required');
  }
  if (!Number.isInteger(body.attemptNumber) || body.attemptNumber < 1 || body.attemptNumber > 3) {
    throw new ValidationError('attemptNumber must be 1-3');
  }
  if (body.permanentlyFailed && body.attemptNumber !== 3) {
    throw new ValidationError('permanentlyFailed only allowed when attemptNumber=3');
  }
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  if (ord.qcPermanentlyFailed === 1) {
    return c.json({ ok: false, reason: 'already permanently failed' });
  }
  const isTerminal = body.permanentlyFailed === true || body.attemptNumber === 3;
  await db
    .update(labOrders)
    .set({
      qcAttemptCount: Math.max(ord.qcAttemptCount, body.attemptNumber),
      qcPermanentlyFailed: isTerminal ? 1 : ord.qcPermanentlyFailed,
      qcFailureReason: body.reason.trim(),
      qcStatus: isTerminal ? 'FAILED' : 'PENDING',
      status: isTerminal ? 'QC_FAILED' : ord.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(labOrders.id, id));
  if (isTerminal) {
    const html = slaTmpl(
      'Lab order QC permanently failed',
      [
        {
          identifier: ord.orderNumber,
          patient: [ord.patientName, ord.patientLastName].filter(Boolean).join(' '),
          detail: body.reason.trim(),
          ageHours: 0,
        },
      ],
      'Failure',
    );
    c.executionCtx.waitUntil(
      dispatchEvent(c.env, {
        eventType: 'LAB_ORDER_QC_FAILED',
        labOrderId: ord.id,
        labGroupId: ord.labGroupId,
        subject: `⚠️ QC failed (terminal): ${ord.orderNumber}`,
        htmlBuilder: () => html,
      }).catch((err) => console.error('[labs.qc] notify failed', err)),
    );
  }
  return c.json({
    ok: true,
    labOrderId: id,
    attemptNumber: body.attemptNumber,
    qcStatus: isTerminal ? 'FAILED' : 'PENDING',
    terminal: isTerminal,
  });
});

/**
 * POST /orders/parse-barcode — utility for kit-receiving stations. Accepts
 * a barcode string (or base64-encoded bytes) and returns extracted patient
 * demographic fields.
 */
app.post('/orders/parse-barcode', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const body = (await c.req.json()) as { barcode?: string; base64?: string };
  let input: string | Uint8Array;
  if (body.base64) {
    try {
      const bin = atob(body.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      input = bytes;
    } catch {
      throw new ValidationError('invalid base64 input');
    }
  } else if (typeof body.barcode === 'string') {
    input = body.barcode;
  } else {
    throw new ValidationError('provide either `barcode` (string) or `base64` (string)');
  }
  const parsed = parseHl7Barcode(input);
  if (!parsed) {
    return c.json({ parsed: false, fields: null });
  }
  return c.json({ parsed: true, fields: parsed });
});

// ─── PDF asset endpoints ──────────────────────────────────────────────────

async function streamPdfAsset(c: any, labOrderId: string, field: keyof typeof labOrders.$inferSelect): Promise<Response> {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, labOrderId)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  const key = (ord as any)[field] as string | null;
  if (!key) throw new NotFoundError(`Asset not yet generated (field: ${String(field)})`);
  const obj = await downloadFile(c.env.R2, key);
  if (!obj) throw new NotFoundError('Asset blob missing');
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${ord.orderNumber}-${String(field).replace(/BlobKey$/, '')}.pdf"`,
    },
  });
}

app.get('/orders/:id/trf.pdf', async (c) => streamPdfAsset(c, c.req.param('id'), 'trfBlobKey'));
app.get('/orders/:id/shipping-label.pdf', async (c) => streamPdfAsset(c, c.req.param('id'), 'shippingLabelBlobKey'));
app.get('/orders/:id/return-label.pdf', async (c) => streamPdfAsset(c, c.req.param('id'), 'returnLabelBlobKey'));
app.get('/orders/:id/stickers.pdf', async (c) => streamPdfAsset(c, c.req.param('id'), 'stickersBlobKey'));
app.get('/orders/:id/consolidated.pdf', async (c) => streamPdfAsset(c, c.req.param('id'), 'consolidatedAssetsBlobKey'));

// ─── Workflow status ──────────────────────────────────────────────────────

app.get('/orders/:id/workflow', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const ord = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!ord) throw new NotFoundError('Lab order not found');
  if (user.userType === 'LAB' && user.labGroupId && ord.labGroupId !== user.labGroupId) {
    throw new ForbiddenError('Access denied');
  }
  const wfRows = await db
    .select()
    .from(workflowInstances)
    .where(
      and(
        eq(workflowInstances.entityType, 'lab_order'),
        eq(workflowInstances.entityId, id),
      ),
    )
    .orderBy(desc(workflowInstances.createdAt))
    .limit(1);
  return c.json({ data: wfRows[0] ?? null });
});

// ─── Tracking XLSX export ──────────────────────────────────────────────────

app.get('/orders.xlsx', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const db = getDb(c.env.DB);
  const condition = user.userType === 'LAB' && user.labGroupId
    ? eq(labOrders.labGroupId, user.labGroupId)
    : undefined;
  const rows = await (condition ? db.select().from(labOrders).where(condition) : db.select().from(labOrders))
    .orderBy(desc(labOrders.createdAt))
    .limit(10_000);
  const data = await Promise.all(
    rows.map(async (r) => {
      const itemRows = await db
        .select({ c: count() })
        .from(labOrderItems)
        .where(eq(labOrderItems.labOrderId, r.id));
      return {
        orderNumber: r.orderNumber,
        patientName: r.patientName,
        status: r.status,
        testCount: Number(itemRows[0]?.c ?? 0),
        trackingNumber: r.trackingNumber,
        carrier: r.carrier,
        shippedAt: r.shippedAt,
        deliveredAt: r.deliveredAt,
        createdAt: r.createdAt,
      };
    }),
  );
  const xlsx = await generateLabOrderTrackingReport(data);
  return new Response(xlsx as BodyInit, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="lab-orders.xlsx"`,
    },
  });
});

// ─── Dashboard ─────────────────────────────────────────────────────────────

app.get('/dashboard/counts', async (c) => {
  const user = c.get('user') as any;
  requireLabOrAdmin(user);
  const db = getDb(c.env.DB);
  const condition = user.userType === 'LAB' && user.labGroupId
    ? eq(labOrders.labGroupId, user.labGroupId)
    : sql`1=1`;
  const statuses = ['OPEN', 'READY_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
  const counts: Record<string, number> = {};
  for (const s of statuses) {
    const res = await db
      .select({ c: count() })
      .from(labOrders)
      .where(and(condition as any, eq(labOrders.status, s)));
    counts[s] = Number(res[0]?.c ?? 0);
  }
  const total = await db.select({ c: count() }).from(labOrders).where(condition as any);
  return c.json({ counts, total: Number(total[0]?.c ?? 0) });
});

export default app;

/**
 * /api/ehr — Multi-EHR connection management + generic ingest endpoint.
 *
 * Endpoints:
 *   GET    /connections                       — list connections (tenant-scoped)
 *   POST   /connections                       — create connection
 *   GET    /connections/:id                   — detail
 *   PATCH  /connections/:id                   — update
 *   DELETE /connections/:id                   — delete
 *   POST   /:connectionId/ingest              — receive a FHIR resource (webhook target)
 *   GET    /connections/:id/recent-logs       — recent ingest log entries
 *
 * The ingest endpoint is HMAC-verified per-connection. Successful ingest
 * creates a PENDING order in the orders table; the rest of the platform
 * (routing, pricing, encounter flow, vendor confirmation) runs unchanged.
 */
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  ehrConnections,
  ehrIngestLog,
  orders,
  EHR_VENDORS,
  EHR_AUTH_MODES,
  type EhrVendor,
  type EhrAuthMode,
} from '@curavend/db';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { mapResourceToOrder, verifyWebhookSignature, type EhrConnection } from '../services/ehrAdapter';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── GET /connections ─────────────────────────────────────────────────────
app.get(
  '/connections',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const caller = c.get('user');
    // Hospital managers see only their hospital's connections; admins see all.
    type EhrRow = typeof ehrConnections.$inferSelect;
    let rows: EhrRow[] = [];
    if (caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER') {
      rows = await db.select().from(ehrConnections).orderBy(ehrConnections.name);
    } else if (caller.hospitalId) {
      rows = await db.select().from(ehrConnections).where(eq(ehrConnections.hospitalId, caller.hospitalId)).orderBy(ehrConnections.name);
    }
    return c.json({ items: rows });
  },
);

// ─── POST /connections ────────────────────────────────────────────────────
app.post(
  '/connections',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const caller = c.get('user');
    const body = (await c.req.json()) as {
      name?: string;
      vendor?: string;
      authMode?: string;
      fhirBaseUrl?: string;
      authClientId?: string;
      authSecretEnvRef?: string;
      sharedSecretEnvRef?: string;
      apiKeyEnvRef?: string;
      webhookSecretEnvRef?: string;
      mappingProfile?: string | Record<string, any>;
      hospitalId?: string;
    };
    if (!body.name?.trim()) throw new ValidationError('name is required');
    if (!body.vendor || !EHR_VENDORS.includes(body.vendor as EhrVendor)) {
      throw new ValidationError(`vendor must be one of ${EHR_VENDORS.join(', ')}`);
    }
    if (!body.authMode || !EHR_AUTH_MODES.includes(body.authMode as EhrAuthMode)) {
      throw new ValidationError(`authMode must be one of ${EHR_AUTH_MODES.join(', ')}`);
    }

    // Tenant scoping: non-admins lock to their hospital.
    const hospitalId =
      caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER'
        ? body.hospitalId ?? caller.hospitalId
        : caller.hospitalId;
    if (!hospitalId) throw new ValidationError('hospitalId is required (or caller must have a hospital)');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const mappingJson =
      typeof body.mappingProfile === 'object' && body.mappingProfile != null
        ? JSON.stringify(body.mappingProfile)
        : (body.mappingProfile as string | undefined) ?? null;

    await db.insert(ehrConnections).values({
      id,
      hospitalId,
      name: body.name.trim(),
      vendor: body.vendor,
      authMode: body.authMode,
      fhirBaseUrl: body.fhirBaseUrl ?? null,
      authClientId: body.authClientId ?? null,
      authSecretEnvRef: body.authSecretEnvRef ?? null,
      sharedSecretEnvRef: body.sharedSecretEnvRef ?? null,
      apiKeyEnvRef: body.apiKeyEnvRef ?? null,
      webhookSecretEnvRef: body.webhookSecretEnvRef ?? null,
      mappingProfile: mappingJson,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ id, name: body.name.trim(), vendor: body.vendor }, 201);
  },
);

// ─── GET /connections/:id ─────────────────────────────────────────────────
app.get(
  '/connections/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const caller = c.get('user');
    const { id } = c.req.param();
    const [row] = await db.select().from(ehrConnections).where(eq(ehrConnections.id, id)).limit(1);
    if (!row) throw new NotFoundError('Connection not found');
    if (
      caller.userType !== 'ADMIN' &&
      caller.role !== 'ACCOUNT_MANAGER' &&
      caller.role !== 'ACCOUNT_MANAGER_USER' &&
      row.hospitalId !== caller.hospitalId
    ) {
      throw new ForbiddenError('Cross-tenant access denied');
    }
    return c.json(row);
  },
);

// ─── PATCH /connections/:id ───────────────────────────────────────────────
app.patch(
  '/connections/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const caller = c.get('user');
    const { id } = c.req.param();
    const [row] = await db.select().from(ehrConnections).where(eq(ehrConnections.id, id)).limit(1);
    if (!row) throw new NotFoundError('Connection not found');
    if (
      caller.userType !== 'ADMIN' &&
      caller.role !== 'ACCOUNT_MANAGER' &&
      caller.role !== 'ACCOUNT_MANAGER_USER' &&
      row.hospitalId !== caller.hospitalId
    ) {
      throw new ForbiddenError('Cross-tenant access denied');
    }
    const body = (await c.req.json()) as Partial<{
      name: string;
      fhirBaseUrl: string;
      authClientId: string;
      authSecretEnvRef: string;
      sharedSecretEnvRef: string;
      apiKeyEnvRef: string;
      webhookSecretEnvRef: string;
      mappingProfile: string | Record<string, any>;
      isActive: number;
    }>;
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.name != null) patch.name = body.name;
    if (body.fhirBaseUrl !== undefined) patch.fhirBaseUrl = body.fhirBaseUrl;
    if (body.authClientId !== undefined) patch.authClientId = body.authClientId;
    if (body.authSecretEnvRef !== undefined) patch.authSecretEnvRef = body.authSecretEnvRef;
    if (body.sharedSecretEnvRef !== undefined) patch.sharedSecretEnvRef = body.sharedSecretEnvRef;
    if (body.apiKeyEnvRef !== undefined) patch.apiKeyEnvRef = body.apiKeyEnvRef;
    if (body.webhookSecretEnvRef !== undefined) patch.webhookSecretEnvRef = body.webhookSecretEnvRef;
    if (body.mappingProfile !== undefined) {
      patch.mappingProfile = typeof body.mappingProfile === 'object' ? JSON.stringify(body.mappingProfile) : body.mappingProfile;
    }
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    await db.update(ehrConnections).set(patch).where(eq(ehrConnections.id, id));
    return c.json({ id, updated: true });
  },
);

// ─── DELETE /connections/:id ──────────────────────────────────────────────
app.delete(
  '/connections/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    await db.delete(ehrConnections).where(eq(ehrConnections.id, id));
    return c.json({ id, deleted: true });
  },
);

// ─── POST /:connectionId/ingest ───────────────────────────────────────────
// Public endpoint (no JWT) — HMAC-verified webhook. EHRs POST a FHIR
// resource here and Curavend creates the matching order. This is the
// endpoint Cerner/Meditech/Athena/etc. point their outbound webhooks at.
// NOTE: This route is registered separately so it bypasses the auth
// middleware. We do that by adding /api/ehr/ingest to PUBLIC_PATHS later.
app.post('/:connectionId/ingest', async (c) => {
  const db = getDb(c.env.DB);
  const { connectionId } = c.req.param();
  const rawBody = await c.req.text();
  const signature = c.req.header('x-curavend-webhook-signature') ?? null;

  const [conn] = await db.select().from(ehrConnections).where(eq(ehrConnections.id, connectionId)).limit(1);
  if (!conn) throw new NotFoundError('Connection not found');
  if (conn.isActive !== 1) throw new ForbiddenError('Connection is inactive');

  // Resolve the webhook secret (via env-var ref, if configured).
  const webhookSecret = conn.webhookSecretEnvRef ? (c.env as any)[conn.webhookSecretEnvRef] ?? null : null;
  const valid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!valid) {
    // Log the failure for ops triage.
    await db.insert(ehrIngestLog).values({
      id: crypto.randomUUID(),
      connectionId,
      resourceType: null,
      resourceId: null,
      payloadBlobKey: null,
      mappedOrderId: null,
      status: 'FAILED',
      errorMessage: 'Invalid webhook signature',
      receivedAt: new Date().toISOString(),
    });
    return c.json({ error: 'Invalid signature' }, 401);
  }

  let resource: any;
  try {
    resource = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const resourceType = resource.resourceType ?? null;
  const resourceId = resource.id ?? null;

  // Map to canonical Curavend order. Wrap in try/catch so a mapping bug
  // doesn't take down the endpoint — log + return 422.
  let canonical;
  try {
    canonical = mapResourceToOrder(conn as EhrConnection, resource);
  } catch (err: any) {
    await db.insert(ehrIngestLog).values({
      id: crypto.randomUUID(),
      connectionId,
      resourceType,
      resourceId,
      payloadBlobKey: null,
      mappedOrderId: null,
      status: 'FAILED',
      errorMessage: `Mapping error: ${err?.message ?? String(err)}`,
      receivedAt: new Date().toISOString(),
    });
    return c.json({ error: 'Mapping failed', detail: err?.message }, 422);
  }

  if (!canonical.patientName) {
    await db.insert(ehrIngestLog).values({
      id: crypto.randomUUID(),
      connectionId,
      resourceType,
      resourceId,
      payloadBlobKey: null,
      mappedOrderId: null,
      status: 'SKIPPED',
      errorMessage: 'No patient name resolved from payload',
      receivedAt: new Date().toISOString(),
    });
    return c.json({ status: 'SKIPPED', reason: 'No patient name' }, 200);
  }

  // Create the order (PENDING — vendor routing will pick it up).
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(orders).values({
    id: orderId,
    identifier: `EHR-${connectionId.slice(0, 8)}-${(resourceId ?? crypto.randomUUID().slice(0, 6)).slice(0, 12)}`,
    status: 'PENDING',
    orderSubStatus: 'NEW_ORDER',
    hospitalId: conn.hospitalId,
    patientName: canonical.patientName,
    patientDob: canonical.patientDob ?? null,
    patientGender: canonical.patientGender ?? null,
    patientPhone: canonical.patientPhone ?? null,
    patientEmail: canonical.patientEmail ?? null,
    patientStreetAddress: canonical.patientAddressLine ?? null,
    patientCity: canonical.patientCity ?? null,
    patientState: canonical.patientState ?? null,
    patientZip: canonical.patientZip ?? null,
    icd10Code: canonical.icd10Codes?.[0] ?? null,
    priority: canonical.priority ?? 'routine',
    requester: canonical.orderingPhysicianName ?? null,
    note: canonical.clinicalNote ?? null,
    epicOrderStatus: null,
    createdAt: now,
    updatedAt: now,
  } as any);

  await db.insert(ehrIngestLog).values({
    id: crypto.randomUUID(),
    connectionId,
    resourceType,
    resourceId,
    payloadBlobKey: null,
    mappedOrderId: orderId,
    status: 'PROCESSED',
    errorMessage: null,
    receivedAt: now,
  });
  await db
    .update(ehrConnections)
    .set({ lastSuccessAt: now, lastErrorAt: null, lastErrorMessage: null, updatedAt: now })
    .where(eq(ehrConnections.id, connectionId));

  return c.json({ status: 'PROCESSED', orderId });
});

// ─── GET /connections/:id/recent-logs ─────────────────────────────────────
app.get(
  '/connections/:id/recent-logs',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    const rows = await db
      .select()
      .from(ehrIngestLog)
      .where(eq(ehrIngestLog.connectionId, id))
      .orderBy(desc(ehrIngestLog.receivedAt))
      .limit(50);
    return c.json({ items: rows });
  },
);

export default app;

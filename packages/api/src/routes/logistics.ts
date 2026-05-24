/**
 * /api/logistics — shipment visibility + cold-chain temperature ingestion.
 *
 *   GET   /shipments               list active shipments (tenant-scoped)
 *   GET   /shipments/:id           single shipment + temp summary + POD URLs
 *   POST  /shipments/:id/eta       update ETA (carrier API webhook target)
 *   POST  /shipments/:id/temp      submit a temperature reading (sensor webhook)
 *   GET   /shipments/:id/temp-log  full reading history
 *
 * Temp readings auto-flag excursions vs `cold_chain_spec_min_c/_max_c` and
 * stamp `order_shipments.had_excursion` so the UI can show a quick badge.
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orderShipments, shipmentTempLogs, orders } from '@curavend/db';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

async function loadAndAuth(d1: D1Database, u: AuthUser, shipmentId: string) {
  const db = getDb(d1);
  const [s] = await db.select().from(orderShipments).where(eq(orderShipments.id, shipmentId)).limit(1);
  if (!s) throw new NotFoundError('Shipment not found');
  // Tenant via parent order.
  if (!s.orderId) return s;
  if (isAdmin(u)) return s;
  const [o] = await db
    .select({ hospitalId: orders.hospitalId, vendorId: orders.vendorId })
    .from(orders)
    .where(eq(orders.id, s.orderId))
    .limit(1);
  if (!o) return s;
  if (u.hospitalId && o.hospitalId === u.hospitalId) return s;
  if (u.vendorId && o.vendorId === u.vendorId) return s;
  throw new ForbiddenError('Shipment belongs to a different tenant');
}

app.get('/shipments', requirePermission('logistics', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  let rowsQuery: any = db
    .select({
      id: orderShipments.id,
      orderId: orderShipments.orderId,
      carrierCode: orderShipments.carrierCode,
      trackingNumber: orderShipments.trackingNumber,
      shipmentDate: orderShipments.shipmentDate,
      actualDeliveryDate: orderShipments.actualDeliveryDate,
      etaAt: orderShipments.etaAt,
      coldChainRequired: orderShipments.coldChainRequired,
      lastTempC: orderShipments.lastTempC,
      lastTempAt: orderShipments.lastTempAt,
      hadExcursion: orderShipments.hadExcursion,
      latestStatus: orderShipments.latestStatus,
      podAttachment: orderShipments.podAttachment,
      orderHospitalId: orders.hospitalId,
      orderVendorId: orders.vendorId,
    })
    .from(orderShipments)
    .leftJoin(orders, eq(orders.id, orderShipments.orderId));
  if (!isAdmin(user)) {
    if (user.hospitalId) rowsQuery = rowsQuery.where(eq(orders.hospitalId, user.hospitalId));
    else if (user.vendorId) rowsQuery = rowsQuery.where(eq(orders.vendorId, user.vendorId));
    else throw new ForbiddenError('Tenant scope required');
  }
  const rows = await rowsQuery.orderBy(desc(orderShipments.shipmentDate)).limit(500);
  return c.json({ items: rows });
});

app.get('/shipments/:id', requirePermission('logistics', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const ship = await loadAndAuth(c.env.DB, user, id);
  const recent = await db
    .select()
    .from(shipmentTempLogs)
    .where(eq(shipmentTempLogs.shipmentId, id))
    .orderBy(desc(shipmentTempLogs.readingAt))
    .limit(200);
  return c.json({ ...ship, tempReadings: recent });
});

app.post('/shipments/:id/eta', requirePermission('logistics', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await loadAndAuth(c.env.DB, user, id);
  const body = (await c.req.json()) as { etaAt?: string };
  if (!body.etaAt) throw new ValidationError('etaAt required');
  await db
    .update(orderShipments)
    .set({ etaAt: body.etaAt, updatedAt: new Date().toISOString() })
    .where(eq(orderShipments.id, id));
  return c.json({ id, etaAt: body.etaAt });
});

app.post('/shipments/:id/temp', requirePermission('logistics', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const ship = await loadAndAuth(c.env.DB, user, id);
  const body = (await c.req.json()) as {
    readingAt?: string; temperatureC?: number; humidityPct?: number;
    source?: string; deviceId?: string;
  };
  if (body.temperatureC == null) throw new ValidationError('temperatureC required');
  const readingAt = body.readingAt ?? new Date().toISOString();
  const min = ship.coldChainSpecMinC ?? null;
  const max = ship.coldChainSpecMaxC ?? null;
  const isExcursion =
    (min != null && body.temperatureC < min) ||
    (max != null && body.temperatureC > max);

  await db.insert(shipmentTempLogs).values({
    id: crypto.randomUUID(),
    shipmentId: id,
    readingAt,
    temperatureC: body.temperatureC,
    humidityPct: body.humidityPct ?? null,
    isExcursion: isExcursion ? 1 : 0,
    specMinC: min,
    specMaxC: max,
    source: body.source ?? 'CARRIER_API',
    deviceId: body.deviceId ?? null,
    createdAt: new Date().toISOString(),
  });
  // Stamp shipment with last-reading + sticky excursion flag.
  await db
    .update(orderShipments)
    .set({
      lastTempC: body.temperatureC,
      lastTempAt: readingAt,
      hadExcursion: isExcursion ? 1 : (ship.hadExcursion ?? 0),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orderShipments.id, id));
  return c.json({ id, isExcursion, readingAt });
});

app.get('/shipments/:id/temp-log', requirePermission('logistics', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  await loadAndAuth(c.env.DB, user, id);
  const rows = await db
    .select()
    .from(shipmentTempLogs)
    .where(eq(shipmentTempLogs.shipmentId, id))
    .orderBy(desc(shipmentTempLogs.readingAt))
    .limit(2000);
  return c.json({ items: rows });
});

export default app;

/**
 * Per-tenant notification preferences.
 *
 *   GET    /notification-preferences?scopeType=&scopeId=
 *   POST   /notification-preferences           — create or replace a route row
 *   PUT    /notification-preferences/:id       — toggle isActive / update customEmail
 *   DELETE /notification-preferences/:id
 */
import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  notificationPreferences,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_RECIPIENT_TYPES,
} from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertScope(user: AuthUser, scopeType: string, scopeId: string): void {
  if (user.userType === 'ADMIN') return;
  if (scopeType === 'HOSPITAL' && user.userType === 'HOSPITAL' && user.hospitalId === scopeId) return;
  if (scopeType === 'VENDOR' && user.userType === 'VENDOR' && user.vendorId === scopeId) return;
  if (scopeType === 'PROVIDER' && user.userType === 'PROVIDER' && user.providerId === scopeId) return;
  throw new ForbiddenError('You do not have access to this scope');
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { scopeType, scopeId, eventType } = c.req.query();
  if (!scopeType || !scopeId) {
    throw new ValidationError('scopeType and scopeId are required');
  }
  assertScope(user, scopeType, scopeId);

  const conditions: any[] = [
    eq(notificationPreferences.scopeType, scopeType),
    eq(notificationPreferences.scopeId, scopeId),
  ];
  if (eventType) conditions.push(eq(notificationPreferences.eventType, eventType));

  const items = await db
    .select()
    .from(notificationPreferences)
    .where(and(...conditions))
    .orderBy(desc(notificationPreferences.createdAt));
  return c.json({ items });
});

app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  for (const f of ['scopeType', 'scopeId', 'eventType', 'channel', 'recipientType']) {
    if (!body[f]) throw new ValidationError(`${f} is required`);
  }
  if (!NOTIFICATION_EVENT_TYPES.includes(body.eventType)) {
    throw new ValidationError(`eventType must be one of ${NOTIFICATION_EVENT_TYPES.join(',')}`);
  }
  if (!NOTIFICATION_CHANNELS.includes(body.channel)) {
    throw new ValidationError(`channel must be one of ${NOTIFICATION_CHANNELS.join(',')}`);
  }
  if (!NOTIFICATION_RECIPIENT_TYPES.includes(body.recipientType)) {
    throw new ValidationError(`recipientType must be one of ${NOTIFICATION_RECIPIENT_TYPES.join(',')}`);
  }
  if (body.recipientType === 'CUSTOM' && !body.customEmail && !body.customPhone && !body.customWebhookUrl) {
    throw new ValidationError('CUSTOM recipientType requires customEmail, customPhone, or customWebhookUrl');
  }
  assertScope(user, body.scopeType, body.scopeId);

  // Upsert via existing UNIQUE(scope_type, scope_id, event_type, channel, recipient_type)
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.insert(notificationPreferences).values({
      id,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      eventType: body.eventType,
      channel: body.channel,
      recipientType: body.recipientType,
      customEmail: body.customEmail ?? null,
      customPhone: body.customPhone ?? null,
      customWebhookUrl: body.customWebhookUrl ?? null,
      isActive: body.isActive === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      // Already exists — fetch it and update isActive
      const existing = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.scopeType, body.scopeType),
            eq(notificationPreferences.scopeId, body.scopeId),
            eq(notificationPreferences.eventType, body.eventType),
            eq(notificationPreferences.channel, body.channel),
            eq(notificationPreferences.recipientType, body.recipientType),
          ),
        )
        .limit(1);
      if (existing.length) {
        await db
          .update(notificationPreferences)
          .set({
            customEmail: body.customEmail ?? existing[0].customEmail,
            customPhone: body.customPhone ?? existing[0].customPhone,
            customWebhookUrl: body.customWebhookUrl ?? existing[0].customWebhookUrl,
            isActive: body.isActive === false ? 0 : 1,
            updatedAt: now,
          })
          .where(eq(notificationPreferences.id, existing[0].id));
        const updated = await db.select().from(notificationPreferences).where(eq(notificationPreferences.id, existing[0].id)).limit(1);
        return c.json(updated[0]);
      }
    }
    throw err;
  }
  const created = await db.select().from(notificationPreferences).where(eq(notificationPreferences.id, id)).limit(1);
  return c.json(created[0], 201);
});

app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Preference not found');
  assertScope(user, rows[0].scopeType, rows[0].scopeId);

  const update: any = { updatedAt: new Date().toISOString() };
  if (body.isActive !== undefined) update.isActive = body.isActive ? 1 : 0;
  if (body.customEmail !== undefined) update.customEmail = body.customEmail;
  if (body.customPhone !== undefined) update.customPhone = body.customPhone;
  if (body.customWebhookUrl !== undefined) update.customWebhookUrl = body.customWebhookUrl;

  await db.update(notificationPreferences).set(update).where(eq(notificationPreferences.id, id));
  const updated = await db.select().from(notificationPreferences).where(eq(notificationPreferences.id, id)).limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Preference not found');
  assertScope(user, rows[0].scopeType, rows[0].scopeId);
  await db.delete(notificationPreferences).where(eq(notificationPreferences.id, id));
  return c.json({ success: true });
});

export default app;

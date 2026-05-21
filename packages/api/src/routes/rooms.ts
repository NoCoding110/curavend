import { Hono } from 'hono';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { rooms, messages, users } from '@curavend/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /rooms - List rooms for current user
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { limit = '20', offset = '0' } = c.req.query();

  let conditions: any[] = [];

  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    conditions.push(eq(rooms.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(rooms.vendorId, user.vendorId));
  }

  let query = db.select().from(rooms);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await (query as any)
    .orderBy(desc(rooms.updatedAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(rooms)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return c.json({
    items: results,
    total: countResult[0]?.count || 0,
  });
});

// POST /rooms - Create a new chat room
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();

  if (!body.orderId) {
    throw new ValidationError('Order ID is required');
  }
  if (!body.hospitalId) {
    throw new ValidationError('Hospital ID is required');
  }
  if (!body.vendorId) {
    throw new ValidationError('Vendor ID is required');
  }

  // Idempotency: return existing room if one already exists for this order
  const existing = await db.select().from(rooms).where(eq(rooms.orderId, body.orderId)).limit(1);
  if (existing.length) {
    return c.json(existing[0], 200);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(rooms).values({
    id,
    orderId: body.orderId,
    hospitalId: body.hospitalId,
    vendorId: body.vendorId,
    hospitalUnreadCount: 0,
    vendorUnreadCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const result = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// GET /rooms/:id - Get single room
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, id))
    .limit(1);

  if (!room.length) {
    throw new NotFoundError('Room not found');
  }

  return c.json(room[0]);
});

// GET /rooms/:id/messages - Get messages for a room
app.get('/:id/messages', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const { limit = '50', offset = '0' } = c.req.query();

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, id))
    .limit(1);

  if (!room.length) {
    throw new NotFoundError('Room not found');
  }

  const results = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      content: messages.text,
      senderId: messages.senderUserId,
      senderName: users.name,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderUserId, users.id))
    .where(eq(messages.roomId, id))
    .orderBy(desc(messages.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: results.reverse() });
});

// POST /rooms/:id/messages - Send a message to a room
app.post('/:id/messages', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  if (!body.content) {
    throw new ValidationError('Message content is required');
  }

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, id))
    .limit(1);

  if (!room.length) {
    throw new NotFoundError('Room not found');
  }

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Use authenticated user — never trust client-provided sender identity
  const senderType: string = user.userType ?? '';

  await db.insert(messages).values({
    id: messageId,
    text: body.content,
    senderUserId: user.id,
    ownerUserId: user.id,
    receiverUserType: senderType === 'HOSPITAL' ? 'VENDOR' : 'HOSPITAL',
    roomId: id,
    createdAt: now,
  });

  // Update room updatedAt and increment unread count for the receiving party
  const currentRoom = room[0];
  const unreadUpdate: Record<string, any> = { updatedAt: now };

  if (senderType === 'HOSPITAL') {
    unreadUpdate.vendorUnreadCount = (currentRoom.vendorUnreadCount || 0) + 1;
  } else if (senderType === 'VENDOR') {
    unreadUpdate.hospitalUnreadCount = (currentRoom.hospitalUnreadCount || 0) + 1;
  }

  await db
    .update(rooms)
    .set(unreadUpdate)
    .where(eq(rooms.id, id));

  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'chat.new_message',
      payload: { roomId: id, messageId, senderUserId: user.id },
    });
  } catch (err) {
    console.warn('[rooms] failed to enqueue chat.new_message:', err);
  }

  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  return c.json(result[0], 201);
});

// WebSocket upgrade — forwards to ChatRoom Durable Object
app.get('/:id/ws', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  const stub = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName(id));
  const url = new URL(c.req.url);
  url.searchParams.set('userId', user.id);
  url.searchParams.set('userName', user.name ?? user.email);
  url.searchParams.set('roomId', id);

  return stub.fetch(new Request(url.toString(), c.req.raw));
});

// PUT /rooms/:id/read - Reset unread count for current user
app.put('/:id/read', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, id))
    .limit(1);

  if (!room.length) {
    throw new NotFoundError('Room not found');
  }

  const updateData: Record<string, any> = {};

  if (user.userType === 'HOSPITAL') {
    updateData.hospitalUnreadCount = 0;
  } else if (user.userType === 'VENDOR') {
    updateData.vendorUnreadCount = 0;
  }

  await db
    .update(rooms)
    .set(updateData)
    .where(eq(rooms.id, id));

  return c.json({ success: true });
});

// PUT /rooms/:id/archive - Archive a room
app.put('/:id/archive', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, id))
    .limit(1);

  if (!room.length) {
    throw new NotFoundError('Room not found');
  }

  await db
    .update(rooms)
    .set({ status: 'ARCHIVE' })
    .where(eq(rooms.id, id));

  return c.json({ success: true });
});

export default app;

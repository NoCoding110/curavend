import { Hono } from 'hono';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { supportTickets, supportTicketMessages } from '@curavend/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /support-tickets - List support tickets
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { status, limit = '20', offset = '0' } = c.req.query();

  const conditions: any[] = [];

  // Scope by user role: non-admin users only see their own tickets
  if (user.userType !== 'ADMIN') {
    conditions.push(eq(supportTickets.ownerId, user.id));
  }

  if (status) {
    conditions.push(eq(supportTickets.status, status));
  }

  let query = db.select().from(supportTickets);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await (query as any)
    .orderBy(desc(supportTickets.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportTickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return c.json({
    items: results,
    total: countResult[0]?.count || 0,
  });
});

// POST /support-tickets - Create a new support ticket
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.subject) {
    throw new ValidationError('Subject is required');
  }
  if (!body.description) {
    throw new ValidationError('Description is required');
  }

  const id = crypto.randomUUID();
  const ticketNumber = `TICKET-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();

  await db.insert(supportTickets).values({
    id,
    status: 'OPEN',
    ownerId: user.id,
    creatorId: user.id,
    subject: body.subject,
    number: ticketNumber,
    isRead: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Add the initial description as the first message
  await db.insert(supportTicketMessages).values({
    id: crypto.randomUUID(),
    text: body.description,
    senderUserId: user.id,
    ownerUserId: user.id,
    supportTicketId: id,
    createdAt: now,
  });

  const result = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// GET /support-tickets/:id - Get ticket with messages
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const ticket = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  if (!ticket.length) {
    throw new NotFoundError('Support ticket not found');
  }

  // Non-admin users can only see their own tickets
  if (user.userType !== 'ADMIN' && ticket[0].ownerId !== user.id) {
    throw new NotFoundError('Support ticket not found');
  }

  const ticketMessages = await db
    .select()
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.supportTicketId, id))
    .orderBy(desc(supportTicketMessages.createdAt));

  return c.json({
    ...ticket[0],
    messages: ticketMessages,
  });
});

// PUT /support-tickets/:id - Update ticket (status, assignedToId, etc.)
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Support ticket not found');
  }

  // Non-admin users can only update their own tickets
  if (user.userType !== 'ADMIN' && existing[0].ownerId !== user.id) {
    throw new NotFoundError('Support ticket not found');
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = { updatedAt: now };

  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === 'CLOSED') {
      updateData.closedAt = now;
    }
  }
  if (body.isRead !== undefined) {
    updateData.isRead = body.isRead ? 1 : 0;
  }
  if (body.subject !== undefined) {
    updateData.subject = body.subject;
  }

  await db
    .update(supportTickets)
    .set(updateData)
    .where(eq(supportTickets.id, id));

  const result = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  return c.json(result[0]);
});

// GET /support-tickets/:id/messages - Get messages for a ticket
app.get('/:id/messages', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const { limit = '50', offset = '0' } = c.req.query();

  const ticket = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  if (!ticket.length) {
    throw new NotFoundError('Support ticket not found');
  }

  // Non-admin users can only see messages for their own tickets
  if (user.userType !== 'ADMIN' && ticket[0].ownerId !== user.id) {
    throw new NotFoundError('Support ticket not found');
  }

  const results = await db
    .select()
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.supportTicketId, id))
    .orderBy(desc(supportTicketMessages.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: results });
});

// POST /support-tickets/:id/messages - Add a message to a ticket
app.post('/:id/messages', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  if (!body.content) {
    throw new ValidationError('Message content is required');
  }

  const ticket = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);

  if (!ticket.length) {
    throw new NotFoundError('Support ticket not found');
  }

  // Non-admin users can only message on their own tickets
  if (user.userType !== 'ADMIN' && ticket[0].ownerId !== user.id) {
    throw new NotFoundError('Support ticket not found');
  }

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const senderId = body.senderId || user.id;

  await db.insert(supportTicketMessages).values({
    id: messageId,
    text: body.content,
    senderUserId: senderId,
    ownerUserId: ticket[0].ownerId,
    supportTicketId: id,
    createdAt: now,
  });

  // Update ticket updatedAt
  await db
    .update(supportTickets)
    .set({ updatedAt: now })
    .where(eq(supportTickets.id, id));

  const result = await db
    .select()
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.id, messageId))
    .limit(1);

  return c.json(result[0], 201);
});

export default app;

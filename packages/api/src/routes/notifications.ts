import { Hono } from 'hono';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { notifications } from '@curavend/db';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /notifications - List notifications for current user
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { limit = '20', offset = '0' } = c.req.query();

  const results = await db
    .select()
    .from(notifications)
    .where(eq(notifications.receiverId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: results });
});

// GET /notifications/count - Unread count
app.get('/count', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.receiverId, user.id),
        eq(notifications.isRead, 0),
      ),
    );

  return c.json({ count: result[0]?.count || 0 });
});

// PUT /notifications/:id/read - Mark as read
app.put('/:id/read', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(eq(notifications.id, id));

  return c.json({ success: true });
});

// PUT /notifications/read-all - Mark all as read
app.put('/read-all', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(
      and(
        eq(notifications.receiverId, user.id),
        eq(notifications.isRead, 0),
      ),
    );

  return c.json({ success: true });
});

export default app;

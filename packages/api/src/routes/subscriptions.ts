/**
 * Subscription plans + subscriptions.
 * Stripe checkout is live when STRIPE_SECRET_KEY is set.
 * Falls back to PENDING state when key is absent (dev / staging).
 */
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ─── Plans ────────────────────────────────────────────────────────────────

app.get('/plans', async (c) => {
  const db = getDb(c.env.DB);
  const rows: any = await db.run(sql`SELECT * FROM plans ORDER BY price ASC`);
  return c.json({ items: rows.results ?? [] });
});

app.get('/plans/:id/features', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows: any = await db.run(sql`
    SELECT f.* FROM features f
    JOIN plan_features pf ON pf.feature_id = f.id
    WHERE pf.plan_id = ${id}
  `);
  return c.json({ items: rows.results ?? [] });
});

// ─── Subscriptions ─────────────────────────────────────────────────────────

// POST /subscriptions — create Stripe Checkout session or fallback PENDING
app.post('/subscriptions', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();
  if (!body.planId) throw new ValidationError('planId required');

  // Verify plan exists and get Stripe price ID
  const planRow: any = await db.run(sql`SELECT * FROM plans WHERE id = ${body.planId} LIMIT 1`);
  const plan = planRow.results?.[0];
  if (!plan) throw new NotFoundError('Plan not found');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (c.env.STRIPE_SECRET_KEY) {
    // Build Stripe Checkout session via REST API (no SDK to keep bundle small)
    const successUrl = `${c.env.FRONTEND_URL}/subscription?session_id={CHECKOUT_SESSION_ID}&status=success`;
    const cancelUrl = `${c.env.FRONTEND_URL}/subscription?status=cancelled`;

    const priceId = plan.stripe_price_id;
    if (!priceId) {
      return c.json({ error: 'Plan has no Stripe price ID configured' }, 422);
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      'metadata[userId]': user.id,
      'metadata[planId]': body.planId,
      'metadata[subscriptionId]': id,
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json() as any;
      console.error('[stripe] checkout session error:', err);
      return c.json({ error: err?.error?.message ?? 'Stripe checkout failed' }, 502);
    }

    const session = await stripeRes.json() as { id: string; url: string };

    // Record subscription in PENDING state pending webhook confirmation
    await db.run(sql`
      INSERT INTO subscriptions (id, user_id, plan_id, stripe_subscription_id, status, created_at, updated_at)
      VALUES (${id}, ${user.id}, ${body.planId}, ${session.id}, 'PENDING', ${now}, ${now})
    `);

    return c.json({ id, checkoutUrl: session.url, status: 'PENDING' }, 201);
  }

  // No Stripe key — create in PENDING state for dev/staging
  await db.run(sql`
    INSERT INTO subscriptions (id, user_id, plan_id, status, created_at, updated_at)
    VALUES (${id}, ${user.id}, ${body.planId}, 'PENDING', ${now}, ${now})
  `);
  return c.json({
    id,
    status: 'PENDING',
    checkoutUrl: null,
    warning: 'Stripe not configured — subscription created in PENDING state. Set STRIPE_SECRET_KEY to enable checkout.',
  }, 201);
});

// GET /subscriptions — list for current user
app.get('/subscriptions', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const rows: any = await db.run(
    sql`SELECT s.*, p.name as plan_name FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ${user.id} ORDER BY s.created_at DESC`,
  );
  return c.json({ items: rows.results ?? [] });
});

// GET /subscriptions/:id — get single subscription
app.get('/subscriptions/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const rows: any = await db.run(
    sql`SELECT s.*, p.name as plan_name FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.id = ${id} LIMIT 1`,
  );
  const sub = rows.results?.[0];
  if (!sub) throw new NotFoundError('Subscription not found');
  if (sub.user_id !== user.id && user.userType !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return c.json(sub);
});

// DELETE /subscriptions/:id — cancel subscription
app.delete('/subscriptions/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows: any = await db.run(sql`SELECT * FROM subscriptions WHERE id = ${id} LIMIT 1`);
  const sub = rows.results?.[0];
  if (!sub) throw new NotFoundError('Subscription not found');
  if (sub.user_id !== user.id && user.userType !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403);

  if (c.env.STRIPE_SECRET_KEY && sub.stripe_subscription_id && !sub.stripe_subscription_id.startsWith('cs_')) {
    // Cancel on Stripe
    await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` },
    });
  }

  const now = new Date().toISOString();
  await db.run(sql`UPDATE subscriptions SET status = 'CANCELLED', updated_at = ${now} WHERE id = ${id}`);
  return c.json({ success: true });
});

// GET /payment-history
app.get('/payment-history', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const rows: any = await db.run(
    sql`SELECT * FROM payment_history WHERE user_id = ${user.id} ORDER BY created_at DESC`,
  );
  return c.json({ items: rows.results ?? [] });
});

export default app;

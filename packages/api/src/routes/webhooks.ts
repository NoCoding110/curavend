/**
 * External webhook handlers — Stripe events.
 * Mounted on public path — no auth middleware.
 * Stripe signature verification is enforced when STRIPE_WEBHOOK_SECRET is set.
 */
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { notificationDeliveryLog, unsubscribes } from '@curavend/db';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env }>();

/**
 * Verify Stripe webhook signature using the Web Crypto API
 * (Cloudflare Workers do not have Node.js crypto).
 */
async function verifyStripeSignature(
  body: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  // sigHeader format: "t=<timestamp>,v1=<sig1>,v1=<sig2>..."
  const parts = sigHeader.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Parts = parts.filter((p) => p.startsWith('v1='));
  if (!tPart || !v1Parts.length) return false;

  const timestamp = tPart.slice(2);
  const signedPayload = `${timestamp}.${body}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return v1Parts.some((p) => p.slice(3) === computed);
}

app.post('/stripe', async (c) => {
  const rawBody = await c.req.text();
  const sigHeader = c.req.header('stripe-signature') ?? '';

  if (c.env.STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(rawBody, sigHeader, c.env.STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.warn('[stripe webhook] Invalid signature');
      return c.json({ error: 'Invalid signature' }, 400);
    }
  } else {
    console.log('[stripe webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
  }

  let event: { type: string; data: { object: any } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  console.log(`[stripe webhook] Received event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const invoiceType = session.metadata?.invoiceType;

      // ── VENDOR INVOICE PAYMENT FLOW ───────────────────────────────────
      if (invoiceType === 'vendor_invoice') {
        const invoiceId = session.metadata?.invoiceId;
        if (invoiceId) {
          const amountPaid = (session.amount_total ?? 0) / 100;
          await db.run(sql`
            UPDATE invoices
            SET status = 'INVOICE_PAID',
                payment_date = ${now},
                payment_amount_paid = ${String(amountPaid)},
                stripe_payment_intent_id = ${session.payment_intent ?? null},
                stripe_checkout_session_id = ${session.id},
                payment_reference = ${session.payment_intent ?? session.id},
                updated_at = ${now}
            WHERE id = ${invoiceId}
          `);
          // Fire downstream event for paid-receipt email + audit
          try {
            await c.env.EVENTS_QUEUE.send({
              type: 'invoice.paid',
              payload: { invoiceId, stripeSessionId: session.id, amountPaid },
            });
          } catch (err) {
            console.warn('[stripe webhook] failed to enqueue invoice.paid:', err);
          }
        } else {
          console.warn('[stripe webhook] vendor_invoice session missing metadata.invoiceId');
        }
        break;
      }

      // ── SUBSCRIPTION FLOW (existing) ──────────────────────────────────
      const subscriptionId = session.metadata?.subscriptionId;
      const stripeSubId = session.subscription;

      if (subscriptionId) {
        await db.run(sql`
          UPDATE subscriptions
          SET status = 'ACTIVE', stripe_subscription_id = ${stripeSubId ?? session.id}, updated_at = ${now}
          WHERE id = ${subscriptionId}
        `);
      }

      if (session.amount_total && session.customer_email) {
        const userId = session.metadata?.userId;
        if (userId) {
          await db.run(sql`
            INSERT INTO payment_history (id, user_id, stripe_payment_id, amount, currency, status, created_at)
            VALUES (${crypto.randomUUID()}, ${userId}, ${session.payment_intent ?? session.id}, ${String(session.amount_total / 100)}, ${session.currency?.toUpperCase() ?? 'USD'}, 'SUCCEEDED', ${now})
          `);
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const status = sub.status === 'active' ? 'ACTIVE'
        : sub.status === 'past_due' ? 'PAST_DUE'
        : sub.status === 'canceled' ? 'CANCELLED'
        : sub.status === 'unpaid' ? 'UNPAID'
        : 'PENDING';

      await db.run(sql`
        UPDATE subscriptions
        SET status = ${status}, updated_at = ${now}
        WHERE stripe_subscription_id = ${sub.id}
      `);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await db.run(sql`
        UPDATE subscriptions
        SET status = 'CANCELLED', updated_at = ${now}
        WHERE stripe_subscription_id = ${sub.id}
      `);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const userId: any = await db.run(sql`
        SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ${invoice.subscription} LIMIT 1
      `);
      const uid = userId.results?.[0]?.user_id;
      if (uid) {
        await db.run(sql`
          INSERT INTO payment_history (id, user_id, stripe_payment_id, amount, currency, status, created_at)
          VALUES (${crypto.randomUUID()}, ${uid}, ${invoice.payment_intent ?? invoice.id}, ${String(invoice.amount_paid / 100)}, ${invoice.currency?.toUpperCase() ?? 'USD'}, 'SUCCEEDED', ${now})
        `);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await db.run(sql`
        UPDATE subscriptions
        SET status = 'PAST_DUE', updated_at = ${now}
        WHERE stripe_subscription_id = ${invoice.subscription}
      `);
      break;
    }

    default:
      console.log(`[stripe webhook] Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});

// ─── Svix signature verification ──────────────────────────────────────────
// Resend uses Svix to sign webhooks. The signing protocol:
//   svix-id        — unique message ID
//   svix-timestamp — seconds-since-epoch when Resend signed
//   svix-signature — "v1,<base64sig> v1,<base64sig>" (multiple sigs possible
//                    during key rotation)
//   signing input  — `${id}.${timestamp}.${rawBody}`
//   secret format  — "whsec_<base64-of-32-bytes>" — must base64-decode before HMAC
// We accept the message if ANY v1 signature matches and the timestamp is
// within ±5 minutes of now (replay protection).
async function verifySvixSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  secretWithPrefix: string,
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(headers.timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 5 * 60) {
    console.warn('[svix] timestamp outside ±5min tolerance');
    return false;
  }
  // Strip "whsec_" prefix and base64-decode to get raw HMAC key
  const rawSecret = secretWithPrefix.startsWith('whsec_')
    ? secretWithPrefix.slice('whsec_'.length)
    : secretWithPrefix;
  let keyBytes: Uint8Array;
  try {
    const bin = atob(rawSecret);
    keyBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) keyBytes[i] = bin.charCodeAt(i);
  } catch {
    console.warn('[svix] secret could not be base64-decoded');
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signingInput = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  // Convert to base64 for comparison
  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // Header may carry multiple signatures (key rotation): "v1,sig1 v1,sig2"
  const sigs = headers.signature
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3));
  return sigs.some((s) => s === computedB64);
}

// ─── POST /webhooks/resend — Resend delivery / bounce / complaint events ──
// Hard bounces + complaints are auto-added to `unsubscribes` to protect
// sender reputation. Signature verification follows the Svix protocol
// (HMAC-SHA256 over `${id}.${timestamp}.${body}`). Configure the webhook
// in the Resend dashboard pointing to:
//   https://curavend-api.metabilityllc1.workers.dev/api/webhooks/resend
// and set the signing secret via:
//   wrangler secret put RESEND_WEBHOOK_SECRET
// (paste the "whsec_..." value from the Resend dashboard).
app.post('/resend', async (c) => {
  const rawBody = await c.req.text();
  const expectedSecret = (c.env as any).RESEND_WEBHOOK_SECRET;
  if (expectedSecret) {
    const valid = await verifySvixSignature(rawBody, {
      id: c.req.header('svix-id') ?? '',
      timestamp: c.req.header('svix-timestamp') ?? '',
      signature: c.req.header('svix-signature') ?? '',
    }, expectedSecret);
    if (!valid) {
      console.warn('[resend webhook] invalid signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }
  } else {
    console.log('[resend webhook] RESEND_WEBHOOK_SECRET not set — skipping signature verification (dev only)');
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const type: string = event.type ?? '';
  const data = event.data ?? {};
  const messageId: string | null = data.email_id ?? data.id ?? null;
  const recipient: string | null = (data.to ?? [])[0] ?? data.email ?? null;
  const reason: string | null = data.reason ?? data.bounce_reason ?? null;
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  // Update the delivery log for this message
  if (messageId) {
    let status: string | null = null;
    if (type.endsWith('.delivered')) status = 'DELIVERED';
    else if (type.endsWith('.bounced')) status = 'BOUNCED';
    else if (type.endsWith('.complained')) status = 'COMPLAINED';
    else if (type.endsWith('.opened')) status = 'OPENED';
    else if (type.endsWith('.clicked')) status = 'CLICKED';
    else if (type.endsWith('.failed') || type.endsWith('.delivery_delayed')) status = 'FAILED';

    if (status) {
      try {
        await db
          .update(notificationDeliveryLog)
          .set({
            deliveryStatus: status,
            statusReason: reason,
            deliveredAt: status === 'DELIVERED' ? now : null,
          })
          .where(eq(notificationDeliveryLog.externalMessageId, messageId));
      } catch (err) {
        console.warn('[resend webhook] log update failed:', err);
      }
    }
  }

  // Hard bounce or complaint → add to unsubscribes
  if (recipient && (type.endsWith('.bounced') || type.endsWith('.complained'))) {
    try {
      await db
        .insert(unsubscribes)
        .values({
          email: recipient.toLowerCase(),
          reason: reason ?? type,
          source: type.endsWith('.bounced') ? 'BOUNCE' : 'COMPLAINT',
        });
    } catch (err: any) {
      if (!String(err?.message ?? '').includes('UNIQUE')) {
        console.warn('[resend webhook] unsubscribes insert failed:', err);
      }
    }
  }

  return c.json({ received: true });
});

// ─── GET /unsubscribe?token=... — public unsubscribe link target ──────────
app.get('/unsubscribe', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.html(unsubscribeHtml('Missing token. Please use the link from your email.'));
  }
  // Token format: base64url(JSON: { email, ts }) with HMAC suffix
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    return c.html(unsubscribeHtml('Invalid token.'));
  }
  let parsed: { email?: string; ts?: number } = {};
  try {
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    parsed = JSON.parse(json);
  } catch {
    return c.html(unsubscribeHtml('Invalid token.'));
  }
  if (!parsed.email) {
    return c.html(unsubscribeHtml('Invalid token.'));
  }
  // Verify HMAC (uses JWT_SECRET as a convenient signing key)
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(c.env.JWT_SECRET ?? 'curavend-fallback-key'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const computed = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const computedHex = Array.from(new Uint8Array(computed)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (computedHex !== sig) {
    return c.html(unsubscribeHtml('Invalid or expired token.'));
  }

  const db = getDb(c.env.DB);
  try {
    await db.insert(unsubscribes).values({
      email: parsed.email.toLowerCase(),
      source: 'USER_LINK',
    });
  } catch (err: any) {
    if (!String(err?.message ?? '').includes('UNIQUE')) {
      console.warn('[unsubscribe] insert failed:', err);
      return c.html(unsubscribeHtml('Something went wrong. Please try again.'));
    }
    // Already unsubscribed — that's fine
  }
  return c.html(unsubscribeHtml(`You've been unsubscribed: ${parsed.email}.`));
});

function unsubscribeHtml(message: string): string {
  return `<!DOCTYPE html><html><head><title>Unsubscribe</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:80px auto;padding:24px;background:#f5f6f8;color:#222;text-align:center;}
    .card{background:#fff;padding:32px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);}
    h1{font-size:24px;color:#1677ff;margin-bottom:16px;}p{font-size:15px;line-height:1.5;}</style>
  </head><body>
    <div class="card">
      <h1>Curavend</h1>
      <p>${message.replace(/</g, '&lt;')}</p>
      <p style="margin-top:24px;font-size:12px;color:#888;">You can always opt back in by emailing support@curavend.com.</p>
    </div>
  </body></html>`;
}

export default app;

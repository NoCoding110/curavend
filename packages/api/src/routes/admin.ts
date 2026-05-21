/**
 * Admin routes — user approvals and platform stats.
 */
import { Hono } from 'hono';
import { eq, sql, desc, like, or } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users, orders, vendors, hospitals, providers, phiAccessLog, phiConsentLog, fileAccessLog } from '@curavend/db';
import { and, gte, lte } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { EmailService } from '../services/emailService';
import { NotificationService } from '../services/notificationService';
import { screenOig } from '../cron/oigScreeningRefresh';
import { handleOrderSlaMonitor } from '../cron/orderSlaMonitor';
import { handleKitLetterSync } from '../cron/kitLetterSync';
import { sweepExpiredEventWaits } from '../services/workflowService';
import { encrypt as fernetEncrypt, decryptToString as fernetDecrypt, generateKey as fernetGenerateKey } from '../services/fernetCipher';
import { parseHl7Barcode } from '../lib/hl7BarcodeParser';
import { signHmacWebhook } from '../middleware/hmacAuth';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// List pending user approvals
app.get('/pending-users', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(users).where(eq(users.approvalStatus, 'PENDING'));
  return c.json({ items: rows, total: rows.length });
});

// Approve a user
app.put('/users/:id/approve', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('User not found');
  const u = rows[0];

  await db
    .update(users)
    .set({ approvalStatus: 'APPROVED', userStatus: 'ACTIVE', updatedAt: new Date().toISOString() })
    .where(eq(users.id, id));

  try {
    const svc = new NotificationService(c.env.DB);
    await svc.createNotification({
      receiverId: u.id,
      message: 'Your account has been approved — you can now log in',
      redirectTo: 'NO_REDIRECT',
    });
    if (u.email && c.env.RESEND_API_KEY) {
      const es = new EmailService(c.env.RESEND_API_KEY);
      await es.sendEmail({
        to: u.email,
        subject: 'Curavend: Your account has been approved',
        html: `<p>Welcome to Curavend, ${u.name ?? ''}. Your account is approved — you can now sign in at <a href="https://curavend-web.pages.dev">Curavend</a>.</p>`,
      });
    }
  } catch (err) {
    console.warn('[admin] approve notify failed:', err);
  }

  return c.json({ success: true });
});

// Reject a user
app.put('/users/:id/reject', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const { reason } = await c.req.json().catch(() => ({ reason: null }));
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('User not found');
  const u = rows[0];

  await db
    .update(users)
    .set({ approvalStatus: 'REJECTED', userStatus: 'INACTIVE', updatedAt: new Date().toISOString() })
    .where(eq(users.id, id));

  if (u.email && c.env.RESEND_API_KEY) {
    try {
      const es = new EmailService(c.env.RESEND_API_KEY);
      await es.sendEmail({
        to: u.email,
        subject: 'Curavend: Account application update',
        html: `<p>Your Curavend account application was not approved at this time.${reason ? `<br>Reason: ${reason}` : ''}</p>`,
      });
    } catch { /* empty */ }
  }

  return c.json({ success: true });
});

// Platform stats
app.get('/stats', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);

  const usersByType: any = await db.run(sql`
    SELECT user_type, COUNT(*) as count FROM users GROUP BY user_type
  `);
  const ordersByStatus: any = await db.run(sql`
    SELECT status, COUNT(*) as count FROM orders GROUP BY status
  `);
  const pendingUsers: any = await db.run(sql`
    SELECT COUNT(*) as count FROM users WHERE approval_status = 'PENDING'
  `);
  const totalVendors: any = await db.run(sql`SELECT COUNT(*) as count FROM vendors`);
  const totalHospitals: any = await db.run(sql`SELECT COUNT(*) as count FROM hospitals`);
  const totalProviders: any = await db.run(sql`SELECT COUNT(*) as count FROM providers`);

  return c.json({
    usersByType: usersByType.results ?? [],
    ordersByStatus: ordersByStatus.results ?? [],
    pendingUsers: pendingUsers.results?.[0]?.count ?? 0,
    totalVendors: totalVendors.results?.[0]?.count ?? 0,
    totalHospitals: totalHospitals.results?.[0]?.count ?? 0,
    totalProviders: totalProviders.results?.[0]?.count ?? 0,
  });
});

// ─── GET /admin/phi-access-log ─────────────────────────────────────────────
// HIPAA §164.312(b) compliance: view the PHI access audit trail.
// Restricted to ACCOUNT_MANAGER (platform admin) only.
app.get('/phi-access-log', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { userId, resourceType, startDate, endDate, limit = '100', offset = '0' } = c.req.query();

  const rows = await db
    .select()
    .from(phiAccessLog)
    .orderBy(desc(phiAccessLog.accessedAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: rows, total: rows.length });
});

// ─── GET /admin/file-access-log ────────────────────────────────────────────
// HIPAA §164.312(b) — file-layer audit trail.
// Filters: userId, fileKind, orderId, hospitalId, vendorId, fromDate, toDate.
app.get('/file-access-log', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const {
    userId,
    fileKind,
    orderId,
    hospitalId,
    vendorId,
    fromDate,
    toDate,
    limit = '100',
    offset = '0',
  } = c.req.query();

  const filters: any[] = [];
  if (userId) filters.push(eq(fileAccessLog.userId, userId));
  if (fileKind) filters.push(eq(fileAccessLog.fileKind, fileKind));
  if (orderId) filters.push(eq(fileAccessLog.orderId, orderId));
  if (hospitalId) filters.push(eq(fileAccessLog.hospitalId, hospitalId));
  if (vendorId) filters.push(eq(fileAccessLog.vendorId, vendorId));
  if (fromDate) filters.push(gte(fileAccessLog.accessedAt, fromDate));
  if (toDate) filters.push(lte(fileAccessLog.accessedAt, toDate));

  const where = filters.length ? and(...filters) : undefined;

  const rowsQuery = db
    .select()
    .from(fileAccessLog)
    .orderBy(desc(fileAccessLog.accessedAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const rows = await (where ? rowsQuery.where(where) : rowsQuery);

  return c.json({ items: rows, total: rows.length });
});

// ─── GET /admin/phi-consent-log ────────────────────────────────────────────
app.get('/phi-consent-log', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { limit = '100', offset = '0' } = c.req.query();

  const rows = await db
    .select()
    .from(phiConsentLog)
    .orderBy(desc(phiConsentLog.acknowledgedAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: rows, total: rows.length });
});

// ─── OIG Exclusion List ──────────────────────────────────────────────────

// GET /admin/oig/count — returns the number of records in the local LEIE copy
app.get('/oig/count', rbac('ACCOUNT_MANAGER'), async (c) => {
  const result: any = await c.env.DB.prepare('SELECT COUNT(*) as count FROM oig_exclusion_list').first();
  return c.json({ count: result?.count ?? 0 });
});

// GET /admin/oig/search?q=<name|npi|ein> — search the local LEIE for admin review
app.get('/oig/search', rbac('ACCOUNT_MANAGER'), async (c) => {
  const { q = '', limit = '50' } = c.req.query();
  if (!q || q.length < 2) throw new ValidationError('Search query must be at least 2 characters');
  const lq = q.toLowerCase();
  const stmt = await c.env.DB.prepare(
    `SELECT * FROM oig_exclusion_list
     WHERE lower(last_name) LIKE ? OR lower(first_name) LIKE ? OR lower(business_name) LIKE ? OR npi = ? OR ein = ?
     LIMIT ?`,
  )
    .bind(`%${lq}%`, `%${lq}%`, `%${lq}%`, q, q, parseInt(limit))
    .all();
  return c.json({ items: stmt.results ?? [], total: (stmt.results ?? []).length });
});

// POST /admin/oig/screen — screen a single entity on-demand
app.post('/oig/screen', rbac('ACCOUNT_MANAGER'), async (c) => {
  const body = await c.req.json();
  const match = await screenOig(c.env, {
    npi: body.npi,
    ein: body.ein,
    lastName: body.lastName,
    businessName: body.businessName,
  });
  return c.json({ excluded: !!match, match: match ?? null });
});

// GET /admin/oig/last-refresh — returns timestamp of last refresh from KV
app.get('/oig/last-refresh', rbac('ACCOUNT_MANAGER'), async (c) => {
  const ts = await c.env.KV.get('oig:last_refresh');
  return c.json({ lastRefresh: ts ?? null });
});

// POST /admin/oig/refresh — manually trigger a LEIE refresh (async via queue or inline for dev)
app.post('/oig/refresh', rbac('ACCOUNT_MANAGER'), async (c) => {
  const { handleOigRefresh } = await import('../cron/oigScreeningRefresh');
  // Run async — respond immediately
  c.executionCtx.waitUntil(
    handleOigRefresh(c.env).then(async () => {
      await c.env.KV.put('oig:last_refresh', new Date().toISOString());
    }),
  );
  return c.json({ message: 'OIG LEIE refresh triggered in background' });
});

// ─── State Rate Schedule ───────────────────────────────────────────────────

// GET /admin/state-rates?state=CA&hcpc=L1234
app.get('/state-rates', async (c) => {
  const { state, hcpc, limit = '200', offset = '0' } = c.req.query();
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (state) { where += ' AND state_code = ?'; params.push(state); }
  if (hcpc) { where += ' AND hcpc_code = ?'; params.push(hcpc); }
  where += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
  const stmt = await c.env.DB.prepare(`SELECT * FROM state_rate_schedule_items ${where}`)
    .bind(...params)
    .all();
  return c.json({ items: stmt.results ?? [] });
});

// POST /admin/state-rates — bulk upsert state rate items (JSON array)
app.post('/state-rates', rbac('ACCOUNT_MANAGER'), async (c) => {
  const body = await c.req.json();
  const items: any[] = Array.isArray(body.items) ? body.items : [body];
  if (!items.length) throw new ValidationError('items array required');
  const now = new Date().toISOString();
  let count = 0;
  for (const item of items) {
    if (!item.stateCode || !item.hcpcCode || item.rate == null) continue;
    await c.env.DB.prepare(
      `INSERT INTO state_rate_schedule_items (id, state_code, hcpc_code, description, rate, rate_type, effective_date, expiry_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(), item.stateCode, item.hcpcCode,
        item.description ?? null, item.rate, item.rateType ?? null,
        item.effectiveDate ?? null, item.expiryDate ?? null, now, now,
      )
      .run();
    count++;
  }
  return c.json({ inserted: count }, 201);
});

// DELETE /admin/state-rates — clear all state rates (admin reset)
app.delete('/state-rates', rbac('ACCOUNT_MANAGER'), async (c) => {
  const { state } = c.req.query();
  if (state) {
    await c.env.DB.prepare('DELETE FROM state_rate_schedule_items WHERE state_code = ?').bind(state).run();
  } else {
    await c.env.DB.prepare('DELETE FROM state_rate_schedule_items').run();
  }
  return c.json({ success: true });
});

// ─── Admin: Medicare / Inventory bulk upload ─────────────────────────────

// POST /admin/upload-medicare — CSV upload for medicare fee schedule items
// Expects multipart form with field "file" (CSV) and optional "scheduleId"
app.post('/upload-medicare', rbac('ACCOUNT_MANAGER'), async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new ValidationError('file field required (CSV)');
  const text = await file.text();
  const lines = text.split('\n');
  if (lines.length < 2) throw new ValidationError('CSV appears empty');

  // Create a new medicare fee schedule record
  const scheduleId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO medicare_fee_schedules (id, start_date, end_date, created_at, updated_at) VALUES (?,?,?,?,?)`,
  )
    .bind(scheduleId, now.slice(0, 10), '', now, now)
    .run();

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toUpperCase());
  let inserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (cols[idx] ?? '').trim().replace(/^"|"$/g, '') : '';
    };
    const hcpc = get('HCPC') || get('HCPC_CODE') || get('CODE');
    const desc = get('DESCRIPTION') || get('DESC');
    const rate = parseFloat(get('RATE') || get('NON_RURAL_RATE') || get('FEE') || '0') || 0;
    if (!hcpc) continue;
    await c.env.DB.prepare(
      `INSERT INTO medicare_fee_schedule_items (id, fee_schedule_id, hcpc_code, description, floor, ceiling, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
      .bind(crypto.randomUUID(), scheduleId, hcpc, desc || null, rate, rate, now)
      .run();
    inserted++;
  }
  return c.json({ scheduleId, inserted }, 201);
});

// ─── Manual cron triggers (admin-only, for testing/recovery) ────────────────

/**
 * POST /api/admin/cron/run-sla-monitor — fire the daily order SLA monitor on
 * demand. Returns the per-event breach counts. Useful for testing without
 * waiting for 08:00 UTC and for recovering from a missed scheduled run.
 */
app.post('/cron/run-sla-monitor', rbac('ACCOUNT_MANAGER'), async (c) => {
  const report = await handleOrderSlaMonitor(c.env);
  return c.json({ success: report.errors.length === 0, report });
});

/**
 * POST /admin/cron/run-kit-letter-sync — manually trigger the kit-letter
 * sync cron. Body: `{ dryRun?: boolean }`.
 */
/**
 * POST /admin/cron/run-event-wait-sweep — manually trigger the workflow
 * event-wait timeout sweep. Used for smoke-testing the sweep without
 * waiting for the 15-min cron tick.
 */
app.post('/cron/run-event-wait-sweep', rbac('ACCOUNT_MANAGER'), async (c) => {
  const result = await sweepExpiredEventWaits(c.env);
  return c.json({ success: true, result });
});

app.post('/cron/run-kit-letter-sync', rbac('ACCOUNT_MANAGER'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body?.dryRun) {
    const { syncKitLetters } = await import('../services/kitLetterSyncService');
    const report = await syncKitLetters(c.env, { dryRun: true });
    return c.json({ success: report.errors.length === 0, report, dryRun: true });
  }
  const report = await handleKitLetterSync(c.env);
  return c.json({ success: report.errors.length === 0, report });
});

// ─── Athome parity test utilities ─────────────────────────────────────────

/**
 * POST /admin/utils/fernet-roundtrip — encrypt + decrypt a plaintext using
 * the configured FERNET_KEY (or a one-shot key generated on the fly).
 */
app.post('/utils/fernet-roundtrip', rbac('ACCOUNT_MANAGER'), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    plaintext?: string;
    key?: string;
  };
  if (!body.plaintext) throw new ValidationError('plaintext is required');
  const key = body.key ?? c.env.FERNET_KEY ?? fernetGenerateKey();
  const token = await fernetEncrypt(body.plaintext, key);
  const decrypted = await fernetDecrypt(token, key);
  const tokenBin = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
  return c.json({
    ok: true,
    token,
    decrypted,
    versionByteHex: '0x' + tokenBin.charCodeAt(0).toString(16),
    keyUsed: body.key ? 'caller-supplied' : c.env.FERNET_KEY ? 'env' : 'generated',
  });
});

/**
 * POST /admin/utils/hl7-parse — parse an HL7 barcode segment and return
 * extracted patient address fields.
 */
app.post('/utils/hl7-parse', rbac('ACCOUNT_MANAGER'), async (c) => {
  const body = (await c.req.json()) as { barcode: string };
  if (!body.barcode) throw new ValidationError('barcode is required');
  const parsed = parseHl7Barcode(body.barcode);
  return c.json({ parsed: parsed !== null, fields: parsed });
});

/**
 * POST /admin/utils/hmac-sign — compute the headers a caller would need
 * to authenticate against an HMAC-protected webhook. For testing only.
 */
app.post('/utils/hmac-sign', rbac('ACCOUNT_MANAGER'), async (c) => {
  const body = (await c.req.json()) as { body: string; secretEnv?: keyof Env };
  if (typeof body.body !== 'string') throw new ValidationError('body (string) is required');
  const secretEnv = body.secretEnv ?? 'EXTERNAL_FULFILLMENT_HMAC_SECRET';
  const secret = (c.env as any)[secretEnv] as string | undefined;
  if (!secret) throw new ValidationError(`secret ${String(secretEnv)} not configured in env`);
  const { signature, timestamp } = await signHmacWebhook(secret, body.body);
  return c.json({
    headers: {
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': String(timestamp),
    },
  });
});

export default app;

import { Hono } from 'hono';
import { eq, desc, asc, and, sql, gte, lte } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { invoices, invoiceItems, vendors, hospitals } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import type { Env } from '../lib/env';
import { logPhiAccess } from '../services/phiAuditService';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ── Tenant access guard ────────────────────────────────────────────────────
function assertInvoiceAccess(user: any, inv: { hospitalId?: string | null; vendorId?: string | null; providerId?: string | null; superVendorId?: string | null }): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'HOSPITAL') {
    if (inv.hospitalId !== user.hospitalId) throw new ForbiddenError('Access denied');
    return;
  }
  if (user.userType === 'VENDOR') {
    if (inv.vendorId !== user.vendorId) throw new ForbiddenError('Access denied');
    return;
  }
  if (user.providerId && inv.providerId !== user.providerId) {
    throw new ForbiddenError('Access denied');
  }
  if (user.superVendorId && inv.superVendorId !== user.superVendorId) {
    throw new ForbiddenError('Access denied');
  }
}

// GET /invoices - List invoices with joined vendor/hospital names
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const {
    status, vendorId, hospitalId, search,
    limit = '20', offset = '0',
    sortBy, sortOrder,
  } = c.req.query();

  let conditions: any[] = [];

  // ADMIN sees all; others scoped
  if (user.userType !== 'ADMIN') {
    if (user.userType === 'HOSPITAL') {
      conditions.push(eq(invoices.hospitalId, user.hospitalId));
    } else if (user.userType === 'VENDOR') {
      conditions.push(eq(invoices.vendorId, user.vendorId));
    } else {
      if (user.providerId) conditions.push(eq(invoices.providerId, user.providerId));
      if (user.superVendorId) conditions.push(eq(invoices.superVendorId, user.superVendorId));
    }
  }
  if (status) {
    conditions.push(eq(invoices.status, status));
  } else if (user.userType === 'HOSPITAL') {
    // INVOICE_GENERATED is a vendor-internal draft state — hide from the
    // hospital's default list. Hospital can still see it by explicitly
    // filtering by status.
    conditions.push(sql`${invoices.status} != 'INVOICE_GENERATED'`);
  }
  if (vendorId) conditions.push(eq(invoices.vendorId, vendorId));
  if (hospitalId) conditions.push(eq(invoices.hospitalId, hospitalId));
  if (search) conditions.push(sql`${invoices.number} LIKE ${`%${search}%`}`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const INVOICE_SORT: Record<string, any> = {
    number: invoices.number,
    total: invoices.total,
    status: invoices.status,
    dueDate: invoices.dueDate,
    createdAt: invoices.createdAt,
  };
  const sortCol = (sortBy && INVOICE_SORT[sortBy]) || invoices.createdAt;
  const orderFn = sortOrder === 'asc' ? asc : desc;

  const results = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      orderId: invoices.orderId,
      status: invoices.status,
      total: invoices.total,
      dueDate: invoices.dueDate,
      hospitalId: invoices.hospitalId,
      vendorId: invoices.vendorId,
      hospitalName: hospitals.name,
      vendorName: vendors.name,
      createdAt: invoices.createdAt,
      updatedAt: invoices.updatedAt,
    })
    .from(invoices)
    .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
    .leftJoin(hospitals, eq(invoices.hospitalId, hospitals.id))
    .where(whereClause)
    .orderBy(orderFn(sortCol))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(whereClause);

  return c.json({ items: results, total: countResult[0]?.count || 0 });
});

// CSV export — MUST be before /:id so Hono doesn't match "export.csv" as :id
app.get('/export.csv', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { vendorId, status, startDate, endDate } = c.req.query();

  const conditions: any[] = [];

  if (user.userType !== 'ADMIN') {
    if (user.userType === 'HOSPITAL') {
      conditions.push(eq(invoices.hospitalId, user.hospitalId));
    } else if (user.userType === 'VENDOR') {
      conditions.push(eq(invoices.vendorId, user.vendorId));
    } else {
      if (user.providerId) conditions.push(eq(invoices.providerId, user.providerId));
      if (user.superVendorId) conditions.push(eq(invoices.superVendorId, user.superVendorId));
    }
  } else {
    if (vendorId) conditions.push(eq(invoices.vendorId, vendorId));
  }

  if (status) conditions.push(eq(invoices.status, status));
  if (startDate) conditions.push(gte(invoices.createdAt, startDate));
  if (endDate) conditions.push(lte(invoices.createdAt, endDate));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(invoices)
    .where(whereClause)
    .orderBy(desc(invoices.createdAt));

  const header = ['Invoice Number', 'Order ID', 'Status', 'Total', 'Date', 'Due Date', 'Payee', 'Paid Amount', 'Payment Date'];
  const lines = [header.join(',')];
  for (const inv of rows) {
    lines.push(
      [
        csvEscape(inv.number),
        csvEscape(inv.orderId),
        csvEscape(inv.status),
        inv.total ?? 0,
        csvEscape(inv.date ?? inv.createdAt),
        csvEscape(inv.dueDate),
        csvEscape(inv.paymentPayeeName),
        inv.paymentAmountPaid ?? '',
        csvEscape(inv.paymentDate),
      ].join(','),
    );
  }
  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="invoices.csv"',
    },
  });
});

// CSV import payment details — also before /:id
app.post('/import-payments', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();
  const csvText: string = body.csv ?? '';
  if (!csvText) throw new ValidationError('csv body field required');

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return c.json({ processed: 0, failed: 0, errors: [] });

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const results: { invoiceNumber: string; success: boolean; error?: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const num = cols[idx('invoicenumber')] ?? cols[idx('invoice number')];
    if (!num) {
      results.push({ invoiceNumber: '(missing)', success: false, error: 'no invoice number' });
      continue;
    }
    const payee = cols[idx('payeename')] ?? cols[idx('payee')] ?? '';
    const amount = parseFloat(cols[idx('amountpaid')] ?? cols[idx('amount')] ?? '0');
    const date = cols[idx('paymentdate')] ?? cols[idx('date')] ?? new Date().toISOString();
    const ref = cols[idx('reference')] ?? '';

    try {
      await db.run(sql`
        UPDATE invoices SET
          status = 'INVOICE_PAID',
          payment_payee_name = ${payee},
          payment_amount_paid = ${String(amount)},
          payment_date = ${date},
          payment_reference = ${ref},
          updated_at = ${new Date().toISOString()}
        WHERE number = ${num}
      `);
      results.push({ invoiceNumber: num, success: true });
    } catch (err: any) {
      results.push({ invoiceNumber: num, success: false, error: err.message ?? String(err) });
    }
  }

  return c.json({
    processed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});

// GET /invoices/:id with joined names + items
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const result = await db
    .select({
      invoice: invoices,
      vendorName: vendors.name,
      hospitalName: hospitals.name,
    })
    .from(invoices)
    .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
    .leftJoin(hospitals, eq(invoices.hospitalId, hospitals.id))
    .where(eq(invoices.id, id))
    .limit(1);

  if (!result.length) throw new NotFoundError('Invoice not found');

  const { invoice, vendorName, hospitalName } = result[0];
  assertInvoiceAccess(user, invoice);

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));

  await logPhiAccess(c.env, {
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    resourceType: 'INVOICE',
    resourceId: id,
    action: 'VIEW',
    ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  });

  return c.json({ ...invoice, vendorName, hospitalName, items });
});

// PUT /invoices/:id - Update invoice
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Invoice not found');
  assertInvoiceAccess(user, existing[0]);

  await db.update(invoices).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(invoices.id, id));

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(result[0]);
});

// PUT /invoices/:id/confirm-spend
app.put('/:id/confirm-spend', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Invoice not found');
  assertInvoiceAccess(user, existing[0]);
  if (existing[0].status !== 'ORDER_COMPLETED') {
    throw new ValidationError('Invoice must be in ORDER_COMPLETED status');
  }

  const now = new Date().toISOString();

  // Update invoice items with spend amounts
  if (body.items?.length) {
    for (const item of body.items) {
      if (item.id) {
        await db.update(invoiceItems).set({ spend: item.spend, unitPrice: item.unitPrice }).where(eq(invoiceItems.id, item.id));
      }
    }
  }

  const total = body.items?.reduce((sum: number, item: any) => sum + (item.spend || 0), 0) || 0;

  await db.update(invoices).set({
    status: 'SPEND_CONFIRMED',
    total,
    updatedAt: now,
  }).where(eq(invoices.id, id));

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(result[0]);
});

// PUT /invoices/:id/generate
app.put('/:id/generate', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Invoice not found');
  assertInvoiceAccess(user, existing[0]);

  await db.update(invoices).set({
    status: 'INVOICE_GENERATED',
    updatedAt: new Date().toISOString(),
  }).where(eq(invoices.id, id));

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(result[0]);
});

// PUT /invoices/:id/send
app.put('/:id/send', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const chkSend = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!chkSend.length) throw new NotFoundError('Invoice not found');
  assertInvoiceAccess(user, chkSend[0]);

  await db.update(invoices).set({
    status: 'INVOICE_SENT',
    updatedAt: new Date().toISOString(),
  }).where(eq(invoices.id, id));

  try {
    await c.env.EVENTS_QUEUE.send({ type: 'invoice.sent', payload: { invoiceId: id } });
  } catch { /* empty */ }

  // GL hook (gap 6): post INVOICE_APPROVE on first send. We treat
  // INVOICE_SENT as the approval boundary because the existing flow has no
  // explicit /approve endpoint — sending an invoice means it's been vetted.
  try {
    const inv = chkSend[0] as any;
    const total = Number(inv.totalAmount ?? inv.invoiceTotalAmount ?? 0);
    if (total > 0 && inv.hospitalId) {
      const { postInvoiceApprove } = await import('../services/glService');
      await postInvoiceApprove(c.env.DB, {
        hospitalId: inv.hospitalId,
        invoiceId: id,
        departmentId: inv.departmentId ?? null,
        amountUsd: total,
        memo: `Invoice ${inv.invoiceNumber ?? id.slice(0, 8)} sent / approved`,
        postedByUserId: user.id,
      });
    }
  } catch (err) {
    console.error('[invoice-send] GL post failed', err);
  }

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(result[0]);
});

// POST /invoices/:id/checkout-session — create Stripe Checkout Session for vendor invoice payment
app.post('/:id/checkout-session', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Invoice not found');
  assertInvoiceAccess(user, rows[0]);
  const inv = rows[0];

  if (inv.status === 'INVOICE_PAID') {
    throw new ValidationError('Invoice is already paid');
  }
  const amountCents = inv.grandTotalCents ?? Math.round(((inv.total as number | null) ?? 0) * 100);
  if (!amountCents || amountCents <= 0) {
    throw new ValidationError('Invoice total must be positive to create a checkout session');
  }
  if (!c.env.STRIPE_SECRET_KEY) {
    throw new ValidationError('Stripe is not configured on this Worker');
  }

  // Look up hospital + vendor names for the Checkout description
  const [hospitalRow, vendorRow] = await Promise.all([
    db.select({ name: hospitals.name, email: hospitals.email }).from(hospitals).where(eq(hospitals.id, inv.hospitalId)).limit(1),
    inv.vendorId
      ? db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, inv.vendorId)).limit(1)
      : Promise.resolve([]),
  ]);
  const description = `${vendorRow[0]?.name ?? 'Vendor'} invoice ${inv.number}`;

  // Build the Checkout session via Stripe REST API
  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('success_url', `${c.env.FRONTEND_URL ?? ''}/billing-orders/${id}?paid=1`);
  form.append('cancel_url', `${c.env.FRONTEND_URL ?? ''}/billing-orders/${id}?cancelled=1`);
  form.append('client_reference_id', id);
  form.append('metadata[invoiceType]', 'vendor_invoice');
  form.append('metadata[invoiceId]', id);
  form.append('metadata[hospitalId]', inv.hospitalId);
  if (inv.vendorId) form.append('metadata[vendorId]', inv.vendorId);
  if (hospitalRow[0]?.email) form.append('customer_email', hospitalRow[0].email);
  form.append('line_items[0][price_data][currency]', (inv.currencyCode ?? 'USD').toLowerCase());
  form.append('line_items[0][price_data][unit_amount]', String(amountCents));
  form.append('line_items[0][price_data][product_data][name]', description);
  form.append('line_items[0][price_data][product_data][description]', `Order invoice — total ${(amountCents / 100).toFixed(2)} ${inv.currencyCode ?? 'USD'}`);
  form.append('line_items[0][quantity]', '1');

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const session: any = await resp.json();
  if (!resp.ok) {
    console.warn('[invoices] Stripe Checkout create failed:', session);
    throw new ValidationError(`Stripe Checkout failed: ${session?.error?.message ?? 'unknown'}`);
  }

  // Stamp the session id on the invoice for audit
  await db
    .update(invoices)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date().toISOString() })
    .where(eq(invoices.id, id));

  return c.json({ id: session.id, url: session.url, expires_at: session.expires_at });
});

// PUT /invoices/:id/mark-paid
app.put('/:id/mark-paid', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const chkPaid = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!chkPaid.length) throw new NotFoundError('Invoice not found');
  assertInvoiceAccess(user, chkPaid[0]);

  await db.update(invoices).set({
    status: 'INVOICE_PAID',
    paymentPayeeName: body.payeeName,
    paymentAmountPaid: body.amountPaid?.toString(),
    paymentDate: body.paymentDate,
    paymentReference: body.reference,
    updatedAt: new Date().toISOString(),
  }).where(eq(invoices.id, id));

  try {
    await c.env.EVENTS_QUEUE.send({ type: 'invoice.paid', payload: { invoiceId: id } });
  } catch { /* empty */ }

  // GL hook (gap 6): post INVOICE_PAY when invoice is marked paid.
  try {
    const inv = chkPaid[0] as any;
    const amount = Number(body.amountPaid ?? inv.totalAmount ?? 0);
    if (amount > 0 && inv.hospitalId) {
      const { postInvoicePay } = await import('../services/glService');
      await postInvoicePay(c.env.DB, {
        hospitalId: inv.hospitalId,
        invoiceId: id,
        amountUsd: amount,
        memo: `Invoice ${inv.invoiceNumber ?? id.slice(0, 8)} paid`,
        postedByUserId: user.id,
      });
    }
  } catch (err) {
    console.error('[invoice-mark-paid] GL post failed', err);
  }

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return c.json(result[0]);
});

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export default app;

import { Hono } from 'hono';
import { eq, and, sql, gte, lte, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orders,
  invoices,
  invoiceItems,
  orderItems,
  hospitals,
  vendors,
  users,
  hospitalVendors,
} from '@curavend/db';
import type { Env } from '../lib/env';
import {
  generateOrderTrackingReport,
  generateInvoiceReport,
  generateSpendReport,
  XLSX_CONTENT_TYPE,
} from '../services/xlsxService';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Helper to build common date + role scoping conditions for invoices
function buildInvoiceConditions(
  user: any,
  startDate?: string,
  endDate?: string,
  hospitalId?: string,
  vendorId?: string,
) {
  const conditions: any[] = [];

  // Role scoping
  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    conditions.push(eq(invoices.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(invoices.vendorId, user.vendorId));
  } else {
    // ADMIN-level: apply optional filters from query params
    if (hospitalId) conditions.push(eq(invoices.hospitalId, hospitalId));
    if (vendorId) conditions.push(eq(invoices.vendorId, vendorId));
  }

  if (startDate) conditions.push(gte(invoices.createdAt, startDate));
  if (endDate) conditions.push(lte(invoices.createdAt, endDate));

  return conditions;
}

// Helper to build common date + role scoping conditions for orders
function buildOrderConditions(
  user: any,
  startDate?: string,
  endDate?: string,
  hospitalId?: string,
  vendorId?: string,
  providerId?: string,
) {
  const conditions: any[] = [];

  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    conditions.push(eq(orders.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(orders.vendorId, user.vendorId));
  } else {
    if (hospitalId) conditions.push(eq(orders.hospitalId, hospitalId));
    if (vendorId) conditions.push(eq(orders.vendorId, vendorId));
    if (providerId) conditions.push(eq(orders.providerId, providerId));
  }

  if (startDate) conditions.push(gte(orders.createdAt, startDate));
  if (endDate) conditions.push(lte(orders.createdAt, endDate));

  return conditions;
}

// GET /reporting/spend-by-vendor
// Group invoices by vendorId, SUM(total), COUNT(*). Join vendor name.
app.get('/spend-by-vendor', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId, vendorId } = c.req.query();

  const conditions = buildInvoiceConditions(user, startDate, endDate, hospitalId, vendorId);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      vendorId: invoices.vendorId,
      vendorName: vendors.name,
      totalSpend: sql<number>`SUM(${invoices.total})`,
      invoiceCount: sql<number>`COUNT(*)`,
    })
    .from(invoices)
    .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(whereClause)
    .groupBy(invoices.vendorId)
    .orderBy(desc(sql`SUM(${invoices.total})`));

  return c.json({ items: results });
});

// GET /reporting/spend-by-hcpc
// Group invoiceItems by HCPC code, SUM(spend), COUNT(*). Top 10.
app.get('/spend-by-hcpc', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId, vendorId } = c.req.query();

  // Build invoice-level scoping subquery conditions
  const invoiceConditions = buildInvoiceConditions(user, startDate, endDate, hospitalId, vendorId);
  const invoiceWhere = invoiceConditions.length > 0 ? and(...invoiceConditions) : undefined;

  const results = await db
    .select({
      code: invoiceItems.code,
      totalSpend: sql<number>`SUM(${invoiceItems.spend})`,
      usageCount: sql<number>`COUNT(*)`,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(invoiceWhere)
    .groupBy(invoiceItems.code)
    .orderBy(desc(sql`SUM(${invoiceItems.spend})`))
    .limit(10);

  return c.json({ items: results });
});

// GET /reporting/spend-by-month
// Group invoices by month (YYYY-MM), SUM(total). Last 12 months.
app.get('/spend-by-month', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { hospitalId, vendorId } = c.req.query();

  // Compute start of 12 months ago
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const startDate = twelveMonthsAgo.toISOString().slice(0, 10);

  const conditions = buildInvoiceConditions(user, startDate, undefined, hospitalId, vendorId);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${invoices.createdAt})`,
      totalSpend: sql<number>`SUM(${invoices.total})`,
      invoiceCount: sql<number>`COUNT(*)`,
    })
    .from(invoices)
    .where(whereClause)
    .groupBy(sql`strftime('%Y-%m', ${invoices.createdAt})`)
    .orderBy(sql`strftime('%Y-%m', ${invoices.createdAt})`);

  return c.json({ items: results });
});

// GET /reporting/orders-by-status
// GROUP BY orders.status, COUNT(*). Filter by date range and user scope.
app.get('/orders-by-status', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId, vendorId, providerId } = c.req.query();

  const conditions = buildOrderConditions(user, startDate, endDate, hospitalId, vendorId, providerId);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      status: orders.status,
      orderSubStatus: orders.orderSubStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(whereClause)
    .groupBy(orders.status, orders.orderSubStatus)
    .orderBy(orders.status);

  return c.json({ items: results });
});

// GET /reporting/orders-by-vendor
// GROUP BY orders.vendorId, COUNT(*), with vendor name. Filter by date range.
app.get('/orders-by-vendor', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId, vendorId, providerId } = c.req.query();

  const conditions = buildOrderConditions(user, startDate, endDate, hospitalId, vendorId, providerId);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      vendorId: orders.vendorId,
      vendorName: vendors.name,
      orderCount: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .where(whereClause)
    .groupBy(orders.vendorId)
    .orderBy(desc(sql`COUNT(*)`));

  return c.json({ items: results });
});

// GET /reporting/vendor-kpis
// For a specific vendor: order counts by status, avg completion time.
app.get('/vendor-kpis', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { vendorId, startDate, endDate } = c.req.query();

  // Resolve the target vendor ID
  const targetVendorId = vendorId || (user.userType === 'VENDOR' ? user.vendorId : null);

  if (!targetVendorId) {
    return c.json({ error: 'vendorId is required' }, 400);
  }

  const conditions: any[] = [eq(orders.vendorId, targetVendorId)];
  if (startDate) conditions.push(gte(orders.createdAt, startDate));
  if (endDate) conditions.push(lte(orders.createdAt, endDate));
  const whereClause = and(...conditions);

  // Count orders by status
  const statusCounts = await db
    .select({
      status: orders.status,
      orderSubStatus: orders.orderSubStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(whereClause)
    .groupBy(orders.status, orders.orderSubStatus);

  // Total orders
  const totalResult = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(orders)
    .where(whereClause);

  // Avg time from creation to ORDER_COMPLETED (in seconds via julianday diff * 86400)
  // Only for completed orders that have a timestamp in their history
  const completedOrders = await db
    .select({
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.vendorId, targetVendorId),
        eq(orders.orderSubStatus, 'ORDER_COMPLETED'),
        startDate ? gte(orders.createdAt, startDate) : undefined,
        endDate ? lte(orders.createdAt, endDate) : undefined,
      ),
    );

  let avgCompletionSeconds: number | null = null;
  if (completedOrders.length > 0) {
    const totalSeconds = completedOrders.reduce((sum, order) => {
      const created = new Date(order.createdAt).getTime();
      const updated = new Date(order.updatedAt).getTime();
      return sum + (updated - created) / 1000;
    }, 0);
    avgCompletionSeconds = Math.round(totalSeconds / completedOrders.length);
  }

  return c.json({
    vendorId: targetVendorId,
    totalOrders: totalResult[0]?.total || 0,
    statusBreakdown: statusCounts,
    avgCompletionSeconds,
  });
});

// GET /reporting/executive-summary
// High-level totals: orders, spend, active vendors/hospitals, this month stats.
app.get('/executive-summary', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  // Determine scope conditions
  const orderScope: any[] = [];
  const invoiceScope: any[] = [];

  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    orderScope.push(eq(orders.hospitalId, user.hospitalId));
    invoiceScope.push(eq(invoices.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    orderScope.push(eq(orders.vendorId, user.vendorId));
    invoiceScope.push(eq(invoices.vendorId, user.vendorId));
  }

  const orderWhere = orderScope.length > 0 ? and(...orderScope) : undefined;
  const invoiceWhere = invoiceScope.length > 0 ? and(...invoiceScope) : undefined;

  // This month boundaries
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = now.toISOString();

  // Total orders
  const [totalOrdersResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(orderWhere);

  // Total spend (sum of all invoice totals)
  const [totalSpendResult] = await db
    .select({ total: sql<number>`SUM(${invoices.total})` })
    .from(invoices)
    .where(invoiceWhere);

  // Active vendors / hospitals — varies by role
  let activeVendors = 0;
  let activeHospitals = 0;

  if (user.userType === 'ADMIN') {
    const [vendorCountResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(vendors);
    activeVendors = vendorCountResult?.count || 0;

    const [hospitalCountResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(hospitals);
    activeHospitals = hospitalCountResult?.count || 0;
  } else if (user.userType === 'HOSPITAL' && user.hospitalId) {
    // Count vendors actively linked to this hospital
    const [hvCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(hospitalVendors)
      .where(eq(hospitalVendors.hospitalId, user.hospitalId));
    activeVendors = hvCount?.count || 0;
    // activeHospitals not meaningful for a hospital user — leave 0
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    // Count hospitals this vendor is linked to
    const [hvCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(hospitalVendors)
      .where(eq(hospitalVendors.vendorId, user.vendorId));
    activeHospitals = hvCount?.count || 0;
    activeVendors = 1; // they are a single vendor
  }

  // Orders this month
  const thisMonthOrderConditions = [
    ...orderScope,
    gte(orders.createdAt, monthStart),
    lte(orders.createdAt, monthEnd),
  ];
  const [ordersThisMonthResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(...thisMonthOrderConditions));

  // Spend this month
  const thisMonthInvoiceConditions = [
    ...invoiceScope,
    gte(invoices.createdAt, monthStart),
    lte(invoices.createdAt, monthEnd),
  ];
  const [spendThisMonthResult] = await db
    .select({ total: sql<number>`SUM(${invoices.total})` })
    .from(invoices)
    .where(and(...thisMonthInvoiceConditions));

  return c.json({
    totalOrders: totalOrdersResult?.count || 0,
    totalSpend: totalSpendResult?.total || 0,
    activeVendors,
    activeHospitals,
    ordersThisMonth: ordersThisMonthResult?.count || 0,
    spendThisMonth: spendThisMonthResult?.total || 0,
  });
});

// ---------------------------------------------------------------------------
// Additional report types (Phase 3)
// ---------------------------------------------------------------------------

app.get('/unbilled-transactions', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT o.id, o.identifier, o.patient_name, o.status, o.updated_at
    FROM orders o
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE o.status = 'COMPLETED' AND i.id IS NULL
    ORDER BY o.updated_at DESC
    LIMIT 200
  `));
  return c.json({ items: raw.results ?? [] });
});

app.get('/orders-modified', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT vendor_id, COUNT(*) as count FROM orders
    WHERE order_sub_status = 'ORDER_REQUESTED_FOR_MODIFY' GROUP BY vendor_id
  `));
  return c.json({ items: raw.results ?? [] });
});

app.get('/orders-cancelled', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT vendor_id, COUNT(*) as count FROM orders
    WHERE status = 'CANCELLED' GROUP BY vendor_id
  `));
  return c.json({ items: raw.results ?? [] });
});

app.get('/vendor-scorecard', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT v.id as vendor_id, v.name as vendor_name,
      COUNT(o.id) as total_orders,
      SUM(CASE WHEN o.status='COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN o.status='CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN o.order_sub_status='ORDER_REQUESTED_FOR_MODIFY' THEN 1 ELSE 0 END) as modified
    FROM vendors v LEFT JOIN orders o ON o.vendor_id = v.id
    GROUP BY v.id, v.name
  `));
  return c.json({ items: raw.results ?? [] });
});

app.get('/compliance/users', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT id, email, name, role, user_type, user_status, approval_status, mfa_enabled, has_agreed_to_phi_access, last_logged_in_at
    FROM users ORDER BY email
  `));
  return c.json({ items: raw.results ?? [] });
});

app.get('/compliance/credentials', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT id, name, accreditation_expiry_date, state_level_license_expiry_date, liability_insurance_expiry_date
    FROM vendors
  `));
  return c.json({ items: raw.results ?? [] });
});

app.get('/compliance/network-access', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    SELECT email, name, last_logged_in_at, current_logged_in_at FROM users
    WHERE last_logged_in_at IS NOT NULL ORDER BY last_logged_in_at DESC LIMIT 100
  `));
  return c.json({ items: raw.results ?? [] });
});

// Generic CSV export
app.get('/:reportType/csv', async (c) => {
  const db = getDb(c.env.DB);
  const { reportType } = c.req.param();
  let query = '';
  switch (reportType) {
    case 'spend-by-vendor':
      query = `SELECT v.name as vendor_name, COUNT(i.id) as invoice_count, SUM(i.total) as total_spend FROM invoices i JOIN vendors v ON v.id = i.vendor_id GROUP BY v.id, v.name ORDER BY total_spend DESC`;
      break;
    case 'unbilled':
      query = `SELECT o.identifier, o.patient_name, o.status, o.updated_at FROM orders o LEFT JOIN invoices i ON i.order_id = o.id WHERE o.status = 'COMPLETED' AND i.id IS NULL`;
      break;
    case 'compliance-users':
      query = `SELECT email, name, role, user_type, user_status, approval_status, mfa_enabled FROM users`;
      break;
    default:
      return c.json({ error: `Unknown report type: ${reportType}` }, 400);
  }
  const raw: any = await db.run(sql.raw(query));
  const rows = raw.results ?? [];
  if (!rows.length) return new Response('No data', { status: 204 });
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(
      headers
        .map((h) => {
          const v = row[h];
          if (v == null) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    );
  }
  return new Response(csvLines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${reportType}.csv"`,
    },
  });
});

// ─── XLSX exports ──────────────────────────────────────────────────────────

app.get('/orders.xlsx', async (c) => {
  const user = c.get('user') as any;
  const db = getDb(c.env.DB);
  const conditions: any[] = [];
  if (user.userType === 'HOSPITAL' && user.hospitalId) conditions.push(eq(orders.hospitalId, user.hospitalId));
  if (user.userType === 'VENDOR' && user.vendorId) conditions.push(eq(orders.vendorId, user.vendorId));
  if (user.userType === 'PROVIDER' && user.providerId) conditions.push(eq(orders.providerId, user.providerId));
  const rows = await db
    .select({
      orderId: orders.id,
      identifier: orders.identifier,
      patientName: orders.patientName,
      status: orders.status,
      subStatus: orders.orderSubStatus,
      vendorName: vendors.name,
      hospitalName: hospitals.name,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .leftJoin(hospitals, eq(orders.hospitalId, hospitals.id))
    .where(conditions.length ? and(...conditions) : sql`1=1`)
    .orderBy(desc(orders.createdAt))
    .limit(10_000);
  const xlsx = await generateOrderTrackingReport(rows as any[]);
  return new Response(xlsx as BodyInit, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="orders.xlsx"`,
    },
  });
});

app.get('/invoices.xlsx', async (c) => {
  const user = c.get('user') as any;
  const db = getDb(c.env.DB);
  const conditions: any[] = [];
  if (user.userType === 'HOSPITAL' && user.hospitalId) conditions.push(eq(invoices.hospitalId, user.hospitalId));
  if (user.userType === 'VENDOR' && user.vendorId) conditions.push(eq(invoices.vendorId, user.vendorId));
  const rows = await db
    .select({
      invoiceNumber: invoices.number,
      status: invoices.status,
      hospitalName: hospitals.name,
      vendorName: vendors.name,
      totalAmount: invoices.total,
      issuedAt: invoices.date,
      dueDate: invoices.dueDate,
      paidAt: invoices.paymentDate,
    })
    .from(invoices)
    .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
    .leftJoin(hospitals, eq(invoices.hospitalId, hospitals.id))
    .where(conditions.length ? and(...conditions) : sql`1=1`)
    .limit(10_000);
  const xlsx = await generateInvoiceReport(rows as any[]);
  return new Response(xlsx as BodyInit, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="invoices.xlsx"`,
    },
  });
});

app.get('/spend.xlsx', async (c) => {
  const user = c.get('user') as any;
  const groupBy = (c.req.query('groupBy') ?? 'vendor') as 'vendor' | 'hcpc' | 'month';
  const db = getDb(c.env.DB);
  const conditions: any[] = [];
  if (user.userType === 'HOSPITAL' && user.hospitalId) conditions.push(eq(invoices.hospitalId, user.hospitalId));
  if (user.userType === 'VENDOR' && user.vendorId) conditions.push(eq(invoices.vendorId, user.vendorId));
  let rows: { groupKey: string; totalAmount: number; orderCount: number }[] = [];
  if (groupBy === 'vendor') {
    const res = await db
      .select({
        groupKey: vendors.name,
        totalAmount: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
        orderCount: sql<number>`COUNT(${invoices.id})`,
      })
      .from(invoices)
      .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
      .where(conditions.length ? and(...conditions) : sql`1=1`)
      .groupBy(vendors.name);
    rows = res.map((r) => ({ groupKey: r.groupKey ?? 'Unknown', totalAmount: Number(r.totalAmount), orderCount: Number(r.orderCount) }));
  } else if (groupBy === 'month') {
    const res = await db
      .select({
        groupKey: sql<string>`substr(${invoices.date}, 1, 7)`,
        totalAmount: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
        orderCount: sql<number>`COUNT(${invoices.id})`,
      })
      .from(invoices)
      .where(conditions.length ? and(...conditions) : sql`1=1`)
      .groupBy(sql`substr(${invoices.date}, 1, 7)`);
    rows = res.map((r) => ({ groupKey: r.groupKey ?? 'Unknown', totalAmount: Number(r.totalAmount), orderCount: Number(r.orderCount) }));
  } else {
    rows = [{ groupKey: 'HCPC breakdown unavailable in this view', totalAmount: 0, orderCount: 0 }];
  }
  const xlsx = await generateSpendReport(rows, groupBy);
  return new Response(xlsx as BodyInit, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="spend-by-${groupBy}.xlsx"`,
    },
  });
});

export default app;

import { Hono } from 'hono';
import { eq, and, sql, gte, lte, desc, inArray } from 'drizzle-orm';
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
  hospitalFacilities,
  hospitalDepartments,
  contracts,
  contractItems,
  gpoContractItems,
} from '@curavend/db';
import type { Env } from '../lib/env';
import {
  generateOrderTrackingReport,
  generateInvoiceReport,
  generateSpendReport,
  XLSX_CONTENT_TYPE,
} from '../services/xlsxService';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

/**
 * Resolve the super-vendor's sub-vendor IDs from the DB once per request.
 * Returns [] if the user is not SUPER_VENDOR or has no sub-vendors.
 */
async function resolveSuperVendorIds(db: any, user: any): Promise<string[]> {
  if (user.userType !== 'SUPER_VENDOR' || !user.superVendorId) return [];
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.superVendorId, user.superVendorId));
  return rows.map((r: any) => r.id);
}

// Helper to build common date + role scoping conditions for invoices.
// subVendorIds: pre-resolved sub-vendor IDs for SUPER_VENDOR users.
function buildInvoiceConditions(
  user: any,
  startDate?: string,
  endDate?: string,
  hospitalId?: string,
  vendorId?: string,
  subVendorIds?: string[],
) {
  const conditions: any[] = [];

  // Role scoping
  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    conditions.push(eq(invoices.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(invoices.vendorId, user.vendorId));
  } else if (user.userType === 'SUPER_VENDOR') {
    // Super-vendor sees invoices for their sub-vendors only
    if (subVendorIds && subVendorIds.length > 0) {
      conditions.push(inArray(invoices.vendorId, subVendorIds));
    } else {
      // No sub-vendors → return nothing (handled by caller early-returning [])
      conditions.push(sql`1 = 0`);
    }
  } else if (user.userType === 'PROVIDER' && user.providerId) {
    conditions.push(eq(invoices.providerId, user.providerId));
  } else {
    // ADMIN-level: apply optional filters from query params
    if (hospitalId) conditions.push(eq(invoices.hospitalId, hospitalId));
    if (vendorId) conditions.push(eq(invoices.vendorId, vendorId));
  }

  if (startDate) conditions.push(gte(invoices.createdAt, startDate));
  if (endDate) conditions.push(lte(invoices.createdAt, endDate));

  return conditions;
}

// Helper to build common date + role scoping conditions for orders.
// subVendorIds: pre-resolved sub-vendor IDs for SUPER_VENDOR users.
function buildOrderConditions(
  user: any,
  startDate?: string,
  endDate?: string,
  hospitalId?: string,
  vendorId?: string,
  providerId?: string,
  subVendorIds?: string[],
) {
  const conditions: any[] = [];

  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    conditions.push(eq(orders.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(orders.vendorId, user.vendorId));
  } else if (user.userType === 'SUPER_VENDOR') {
    if (subVendorIds && subVendorIds.length > 0) {
      conditions.push(inArray(orders.vendorId, subVendorIds));
    } else {
      conditions.push(sql`1 = 0`);
    }
  } else if (user.userType === 'PROVIDER' && user.providerId) {
    conditions.push(eq(orders.providerId, user.providerId));
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

  const svIds = await resolveSuperVendorIds(db, user);
  if (user.userType === 'SUPER_VENDOR' && svIds.length === 0) return c.json({ items: [] });
  const conditions = buildInvoiceConditions(user, startDate, endDate, hospitalId, vendorId, svIds);
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

  const svIds = await resolveSuperVendorIds(db, user);
  if (user.userType === 'SUPER_VENDOR' && svIds.length === 0) return c.json({ items: [] });
  // Build invoice-level scoping subquery conditions
  const invoiceConditions = buildInvoiceConditions(user, startDate, endDate, hospitalId, vendorId, svIds);
  const invoiceWhere = invoiceConditions.length > 0 ? and(...invoiceConditions) : undefined;

  const results = await db
    .select({
      code: invoiceItems.code,
      // lineTotalCents is the authoritative field; fall back to legacy spend * 100 if cents is 0
      totalSpend: sql<number>`ROUND(SUM(
        CASE WHEN ${invoiceItems.lineTotalCents} != 0
          THEN ${invoiceItems.lineTotalCents} / 100.0
          ELSE COALESCE(${invoiceItems.spend}, 0)
        END
      ), 2)`,
      usageCount: sql<number>`COUNT(*)`,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(invoiceWhere)
    .groupBy(invoiceItems.code)
    .orderBy(desc(sql`SUM(
      CASE WHEN ${invoiceItems.lineTotalCents} != 0
        THEN ${invoiceItems.lineTotalCents} / 100.0
        ELSE COALESCE(${invoiceItems.spend}, 0)
      END
    )`))
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

  const svIds = await resolveSuperVendorIds(db, user);
  if (user.userType === 'SUPER_VENDOR' && svIds.length === 0) return c.json({ items: [] });
  const conditions = buildInvoiceConditions(user, startDate, undefined, hospitalId, vendorId, svIds);
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

  const svIds = await resolveSuperVendorIds(db, user);
  if (user.userType === 'SUPER_VENDOR' && svIds.length === 0) return c.json({ items: [] });
  const conditions = buildOrderConditions(user, startDate, endDate, hospitalId, vendorId, providerId, svIds);
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

  const svIds = await resolveSuperVendorIds(db, user);
  if (user.userType === 'SUPER_VENDOR' && svIds.length === 0) return c.json({ items: [] });
  const conditions = buildOrderConditions(user, startDate, endDate, hospitalId, vendorId, providerId, svIds);
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
  let targetVendorId = vendorId || (user.userType === 'VENDOR' ? user.vendorId : null);

  // For SUPER_VENDOR: if no vendorId supplied, default to the first sub-vendor.
  // Also validate that a supplied vendorId actually belongs to the SV's network.
  if (user.userType === 'SUPER_VENDOR' && user.superVendorId) {
    const subVendors = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.superVendorId, user.superVendorId));
    const subIds = subVendors.map((v: any) => v.id);
    if (subIds.length === 0) {
      return c.json({ vendorId: null, totalOrders: 0, statusBreakdown: [], avgCompletionSeconds: null, subVendors: [] });
    }
    if (!targetVendorId) {
      targetVendorId = subIds[0];
    } else if (!subIds.includes(targetVendorId)) {
      return c.json({ error: 'vendorId not in your network' }, 403);
    }
  }

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

/**
 * Expanded vendor scorecard — surfaces the operational metrics that
 * matter when buyers compare vendor performance:
 *   - total_orders, completed, cancelled, modified  (baseline)
 *   - on_time_pct        — % of orders delivered within 48h of vendor assignment
 *   - response_time_avg  — avg hours from NEW_ORDER -> VENDOR_CONFIRMED_RECEIPT
 *   - qc_pass_pct        — lab-order QC pass rate (PASSED / (PASSED+FAILED))
 *   - contract_compliance_pct — % of order-items priced via active contract
 *   - sla_breach_count   — count of SLA-breach notifications fanned out about this vendor's orders
 *
 * Implementation note: order_history is the source-of-truth for status
 * transition timestamps (orders has no direct `delivered_at` / `confirmed_at`
 * columns). We pull min(created_at) per (order_id, status) to get the
 * timestamps cheaply.
 */
app.get('/vendor-scorecard', async (c) => {
  const db = getDb(c.env.DB);
  const raw: any = await db.run(sql.raw(`
    WITH delivery_metrics AS (
      SELECT
        o.vendor_id,
        o.id as order_id,
        s.shipment_date as assigned_at,
        s.shipment_date as confirmed_at,
        s.actual_delivery_date as delivered_at,
        -- Response time = hours from order creation to first shipment
        -- (proxy for time-to-fulfillment because we don't have a structured
        -- status-transition log to read VENDOR_CONFIRMED_RECEIPT timestamps from).
        CASE
          WHEN s.shipment_date IS NOT NULL THEN
            (julianday(s.shipment_date) - julianday(o.created_at)) * 24.0
          ELSE NULL
        END as response_hours,
        -- "On time" = delivered within 48h of shipment.
        CASE
          WHEN s.actual_delivery_date IS NOT NULL AND s.shipment_date IS NOT NULL THEN
            CASE WHEN (julianday(s.actual_delivery_date) - julianday(s.shipment_date)) * 24.0 <= 48 THEN 1 ELSE 0 END
          ELSE NULL
        END as on_time
      FROM orders o
      LEFT JOIN order_shipments s ON s.order_id = o.id AND s.shipment_sequence = 1
      WHERE o.vendor_id IS NOT NULL
    ),
    item_compliance AS (
      SELECT o.vendor_id, COUNT(oi.id) AS total_items,
        SUM(CASE WHEN oi.price_source = 'CONTRACT' THEN 1 ELSE 0 END) AS contract_items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.vendor_id IS NOT NULL
      GROUP BY o.vendor_id
    ),
    lab_qc AS (
      SELECT lo.external_vendor_name as vendor_label,
        SUM(CASE WHEN lo.qc_status = 'PASSED' THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN lo.qc_status IN ('PASSED','FAILED') THEN 1 ELSE 0 END) AS evaluated
      FROM lab_orders lo
      GROUP BY lo.external_vendor_name
    ),
    sla_breaches AS (
      SELECT ndl.related_entity_id AS order_id, COUNT(*) AS breach_count
      FROM notification_delivery_log ndl
      WHERE ndl.event_type LIKE '%_SLA' OR ndl.event_type LIKE '%_OVERDUE'
      GROUP BY ndl.related_entity_id
    ),
    sla_per_vendor AS (
      SELECT o.vendor_id, COUNT(*) AS sla_breach_count
      FROM sla_breaches sb
      JOIN orders o ON o.id = sb.order_id
      WHERE o.vendor_id IS NOT NULL
      GROUP BY o.vendor_id
    )
    SELECT
      v.id as vendor_id,
      v.name as vendor_name,
      COUNT(DISTINCT o.id) as total_orders,
      SUM(CASE WHEN o.status='COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN o.status='CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN o.order_sub_status='ORDER_REQUESTED_FOR_MODIFY' THEN 1 ELSE 0 END) as modified,
      -- Aggregates over delivery_metrics
      (SELECT ROUND(AVG(response_hours), 2) FROM delivery_metrics dm WHERE dm.vendor_id = v.id AND response_hours IS NOT NULL) as avg_response_hours,
      (SELECT ROUND(100.0 * AVG(on_time), 1) FROM delivery_metrics dm WHERE dm.vendor_id = v.id AND on_time IS NOT NULL) as on_time_pct,
      -- Compliance
      (SELECT ROUND(100.0 * contract_items / NULLIF(total_items, 0), 1) FROM item_compliance ic WHERE ic.vendor_id = v.id) as contract_compliance_pct,
      -- Lab QC (joined by vendor name as a soft link)
      (SELECT ROUND(100.0 * passed / NULLIF(evaluated, 0), 1) FROM lab_qc lq WHERE lq.vendor_label = v.name) as qc_pass_pct,
      -- SLA breaches
      COALESCE((SELECT sla_breach_count FROM sla_per_vendor spv WHERE spv.vendor_id = v.id), 0) as sla_breach_count
    FROM vendors v
    LEFT JOIN orders o ON o.vendor_id = v.id
    GROUP BY v.id, v.name
    ORDER BY total_orders DESC
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

// ─── GET /spend-by-physician ───────────────────────────────────────────────
// Sum invoice totals grouped by orders.physician_id (joined to users for name).
// Hospital users see only their own hospital; admins can scope by hospitalId.
app.get('/spend-by-physician', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId } = c.req.query();

  const scopeHospitalId =
    user.userType === 'HOSPITAL' && user.hospitalId
      ? user.hospitalId
      : hospitalId || null;

  const conditions: string[] = [`o.physician_id IS NOT NULL`];
  if (scopeHospitalId) {
    conditions.push(`o.hospital_id = '${scopeHospitalId.replace(/'/g, "''")}'`);
  }
  if (startDate) conditions.push(`inv.created_at >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate) conditions.push(`inv.created_at <= '${endDate.replace(/'/g, "''")}'`);
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const result = await (db as any).run(sql.raw(`
    SELECT
      o.physician_id AS physician_id,
      COALESCE(u.name, u.email, o.physician_id) AS physician_name,
      COUNT(DISTINCT inv.id) AS invoice_count,
      COUNT(DISTINCT o.id) AS order_count,
      SUM(COALESCE(inv.total, 0)) AS total_spend
    FROM orders o
    INNER JOIN invoices inv ON inv.order_id = o.id
    LEFT JOIN users u ON u.id = o.physician_id
    ${whereClause}
    GROUP BY o.physician_id
    ORDER BY total_spend DESC
    LIMIT 200
  `));
  return c.json({ items: result.results ?? [] });
});

// ─── GET /spend-by-facility ────────────────────────────────────────────────
// Sum invoice line totals grouped by hospital_facilities (joined via orders.facility_id).
// Hospital users see their own; admins can filter by hospitalId.
app.get('/spend-by-facility', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId } = c.req.query();

  const scopeHospitalId =
    user.userType === 'HOSPITAL' && user.hospitalId
      ? user.hospitalId
      : hospitalId || null;

  // Build subquery using raw SQL for clarity given the join chain
  const dateFilter = [] as string[];
  if (startDate) dateFilter.push(`inv.created_at >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate) dateFilter.push(`inv.created_at <= '${endDate.replace(/'/g, "''")}'`);
  const hospitalFilter = scopeHospitalId ? `AND inv.hospital_id = '${scopeHospitalId.replace(/'/g, "''")}'` : '';
  const dateClause = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : '';

  const result = await (db as any).run(sql.raw(`
    SELECT
      COALESCE(f.id, 'unassigned') AS facility_id,
      COALESCE(f.name, 'Unassigned') AS facility_name,
      COALESCE(f.city, '') AS city,
      COALESCE(f.state, '') AS state,
      COUNT(DISTINCT inv.id) AS invoice_count,
      COUNT(DISTINCT inv.order_id) AS order_count,
      SUM(COALESCE(ii.line_total_cents, ii.spend * 100, 0)) / 100.0 AS total_spend_usd
    FROM invoices inv
    LEFT JOIN orders o ON o.id = inv.order_id
    LEFT JOIN hospital_facilities f ON f.id = o.facility_id
    LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
    WHERE 1 = 1 ${hospitalFilter} ${dateClause}
    GROUP BY COALESCE(f.id, 'unassigned')
    ORDER BY total_spend_usd DESC
  `));
  return c.json({ items: result.results ?? [] });
});

// ─── GET /spend-by-department ──────────────────────────────────────────────
app.get('/spend-by-department', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId, facilityId } = c.req.query();
  const scopeHospitalId =
    user.userType === 'HOSPITAL' && user.hospitalId
      ? user.hospitalId
      : hospitalId || null;

  const dateFilter = [] as string[];
  if (startDate) dateFilter.push(`inv.created_at >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate) dateFilter.push(`inv.created_at <= '${endDate.replace(/'/g, "''")}'`);
  const hospitalFilter = scopeHospitalId ? `AND inv.hospital_id = '${scopeHospitalId.replace(/'/g, "''")}'` : '';
  const facilityFilter = facilityId ? `AND o.facility_id = '${facilityId.replace(/'/g, "''")}'` : '';
  const dateClause = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : '';

  const result = await (db as any).run(sql.raw(`
    SELECT
      COALESCE(d.id, 'unassigned') AS department_id,
      COALESCE(d.name, 'Unassigned') AS department_name,
      COUNT(DISTINCT inv.id) AS invoice_count,
      SUM(COALESCE(ii.line_total_cents, ii.spend * 100, 0)) / 100.0 AS total_spend_usd
    FROM invoices inv
    LEFT JOIN orders o ON o.id = inv.order_id
    LEFT JOIN hospital_departments d ON d.id = o.department_id
    LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
    WHERE 1 = 1 ${hospitalFilter} ${facilityFilter} ${dateClause}
    GROUP BY COALESCE(d.id, 'unassigned')
    ORDER BY total_spend_usd DESC
  `));
  return c.json({ items: result.results ?? [] });
});

// ─── GET /multi-site-rollup ────────────────────────────────────────────────
// Cross-facility scorecard: rollup of orders, invoices, on-time %, exception count.
// Powers the multi-site spend dashboard. ADMIN: see all hospitals. HOSPITAL: own only.
app.get('/multi-site-rollup', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId } = c.req.query();
  const scopeHospitalId =
    user.userType === 'HOSPITAL' && user.hospitalId
      ? user.hospitalId
      : hospitalId || null;
  const hospitalFilter = scopeHospitalId ? `AND inv.hospital_id = '${scopeHospitalId.replace(/'/g, "''")}'` : '';
  const dateFilter = [] as string[];
  if (startDate) dateFilter.push(`inv.created_at >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate) dateFilter.push(`inv.created_at <= '${endDate.replace(/'/g, "''")}'`);
  const dateClause = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : '';

  const result = await (db as any).run(sql.raw(`
    WITH facility_spend AS (
      SELECT
        COALESCE(f.id, 'unassigned') AS facility_id,
        COALESCE(f.name, 'Unassigned') AS facility_name,
        h.id AS hospital_id,
        h.name AS hospital_name,
        COUNT(DISTINCT inv.id) AS invoice_count,
        COUNT(DISTINCT inv.order_id) AS order_count,
        SUM(COALESCE(ii.line_total_cents, ii.spend * 100, 0)) / 100.0 AS total_spend_usd
      FROM invoices inv
      LEFT JOIN orders o ON o.id = inv.order_id
      LEFT JOIN hospital_facilities f ON f.id = o.facility_id
      LEFT JOIN hospitals h ON h.id = inv.hospital_id
      LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
      WHERE 1 = 1 ${hospitalFilter} ${dateClause}
      GROUP BY COALESCE(f.id, 'unassigned'), h.id
    ),
    facility_exceptions AS (
      SELECT
        COALESCE(o.facility_id, 'unassigned') AS facility_id,
        COUNT(*) AS exception_count
      FROM three_way_matches twm
      LEFT JOIN invoices inv ON inv.id = twm.invoice_id
      LEFT JOIN orders o ON o.id = inv.order_id
      WHERE twm.match_status != 'PERFECT' ${hospitalFilter}
      GROUP BY COALESCE(o.facility_id, 'unassigned')
    )
    SELECT
      fs.facility_id,
      fs.facility_name,
      fs.hospital_id,
      fs.hospital_name,
      fs.invoice_count,
      fs.order_count,
      fs.total_spend_usd,
      COALESCE(fe.exception_count, 0) AS exception_count
    FROM facility_spend fs
    LEFT JOIN facility_exceptions fe ON fe.facility_id = fs.facility_id
    ORDER BY fs.total_spend_usd DESC
  `));
  return c.json({ items: result.results ?? [] });
});

// ─── GET /contract-leakage ─────────────────────────────────────────────────
// For each invoice line within the period, look up the "best available" price
// from contracts → GPO → fee schedule → Medicare. If invoice price > best price
// beyond 2%, flag as leakage. Returns dollar savings missed.
//
// Limitation: this is a SQL-only first pass; the full pricing cascade lives in
// contractPricing.ts. Here we compare invoice unit price to the lowest active
// contract or GPO rate per HCPC for the hospital.
app.get('/contract-leakage', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { startDate, endDate, hospitalId } = c.req.query();

  const isAdminUser =
    user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
  const scopeHospitalId =
    user.userType === 'HOSPITAL' && user.hospitalId
      ? user.hospitalId
      : hospitalId || null;
  // Hospital users must always have a hospital context. Admins may omit hospitalId
  // to get a platform-wide aggregate view (used by the dashboard widget).
  if (!scopeHospitalId && !isAdminUser) {
    return c.json({ error: 'Hospital context missing' }, 400);
  }

  const dateFilter = [] as string[];
  if (startDate) dateFilter.push(`inv.created_at >= '${startDate}'`);
  if (endDate) dateFilter.push(`inv.created_at <= '${endDate}'`);
  const dateClause = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : '';

  // Hospital-scoping clauses — empty string = platform-wide (admin aggregate).
  const esc = (s: string) => s.replace(/'/g, "''");
  const contractHospCond = scopeHospitalId ? `AND c.hospital_id = '${esc(scopeHospitalId)}'` : '';
  const gpoHospCond      = scopeHospitalId ? `AND h.id = '${esc(scopeHospitalId)}'` : '';
  const invoiceHospCond  = scopeHospitalId ? `AND inv.hospital_id = '${esc(scopeHospitalId)}'` : '';

  // Build a per-HCPC "best price" map: lowest rate across active contracts + active GPO items.
  // SQLite has no FULL OUTER JOIN, so we UNION ALL the two sources and take MIN per HCPC.
  const bestPrices = await (db as any).run(sql.raw(`
    SELECT hcpc, MIN(best) AS best_price_usd
    FROM (
      -- contract_items uses hcpc_code + negotiated_rate (not code/unit_price).
      SELECT ci.hcpc_code AS hcpc, ci.negotiated_rate AS best
      FROM contract_items ci
      LEFT JOIN contracts c ON c.id = ci.contract_id
      WHERE c.status = 'ACTIVE'
        ${contractHospCond}
        AND ci.hcpc_code IS NOT NULL
        AND ci.negotiated_rate IS NOT NULL
      UNION ALL
      SELECT gci.hcpc_code AS hcpc, gci.rate_usd AS best
      FROM gpo_contract_items gci
      JOIN hospitals h ON h.gpo_organization_id = gci.gpo_organization_id
      WHERE gci.is_active = 1
        ${gpoHospCond}
    ) AS combined
    GROUP BY hcpc
  `));
  const priceMap = new Map<string, number>();
  for (const row of bestPrices.results ?? []) {
    if (row.hcpc && row.best_price_usd != null) {
      priceMap.set(String(row.hcpc), Number(row.best_price_usd));
    }
  }

  // Pull invoice lines for the period
  const lines = await (db as any).run(sql.raw(`
    SELECT
      ii.id,
      ii.invoice_id,
      ii.code AS hcpc,
      ii.description,
      ii.quantity,
      ii.unit_price,
      ii.unit_price_cents,
      ii.line_total_cents,
      inv.number AS invoice_number,
      inv.vendor_id,
      v.name AS vendor_name
    FROM invoice_items ii
    JOIN invoices inv ON inv.id = ii.invoice_id
    LEFT JOIN vendors v ON v.id = inv.vendor_id
    WHERE 1=1 ${invoiceHospCond} ${dateClause}
  `));

  const leaks: any[] = [];
  let totalLeakageUsd = 0;
  for (const ln of lines.results ?? []) {
    const hcpc = String(ln.hcpc ?? '');
    if (!hcpc) continue;
    const best = priceMap.get(hcpc);
    if (best == null) continue;
    const unit = ln.unit_price_cents ? ln.unit_price_cents / 100 : Number(ln.unit_price ?? 0);
    if (unit <= best * 1.02) continue; // within tolerance
    const qty = Number(ln.quantity ?? 0);
    const leakPerUnit = unit - best;
    const leakTotal = leakPerUnit * qty;
    totalLeakageUsd += leakTotal;
    leaks.push({
      invoiceItemId: ln.id,
      invoiceId: ln.invoice_id,
      invoiceNumber: ln.invoice_number,
      hcpc,
      description: ln.description,
      vendorName: ln.vendor_name,
      quantity: qty,
      invoiceUnitPriceUsd: unit,
      bestAvailablePriceUsd: best,
      leakPerUnitUsd: leakPerUnit,
      leakTotalUsd: leakTotal,
      leakPct: (leakPerUnit / best) * 100,
    });
  }
  // Sort biggest leaks first
  leaks.sort((a, b) => b.leakTotalUsd - a.leakTotalUsd);
  return c.json({
    totalLeakageUsd: Math.round(totalLeakageUsd * 100) / 100,
    leakCount: leaks.length,
    items: leaks.slice(0, 200),
  });
});

export default app;

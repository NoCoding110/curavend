import { Hono } from 'hono';
import { eq, like, desc, asc, and, sql, or } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orders, orderItems, orderHistory, vendors, hospitals, hospitalFacilities, hospitalDepartments, users } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import { InvoiceService } from '../services/invoiceService';
import { logPhiAccess } from '../services/phiAuditService';
import { getContractRatesBulk } from '../lib/contractPricing';
import { mintOrderNumber } from '../lib/sequenceMinter';
import { customerPurchaseOrders, orderContacts, vendorItemSkus, orderStickers, fileAccessLog } from '@curavend/db';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

const SORT_COLUMNS: Record<string, any> = {
  identifier: orders.identifier,
  status: orders.status,
  orderSubStatus: orders.orderSubStatus,
  priority: orders.priority,
  createdAt: orders.createdAt,
  vendorName: vendors.name,
  hospitalName: hospitals.name,
};

// ── Tenant access guard ────────────────────────────────────────────────────
// Mirrors the list-level scoping so a user can only read/mutate orders that
// belong to their own hospital, vendor, provider, or super-vendor tenant.
// Also enforces HIPAA PHI consent for any read of patient data.
export function assertOrderAccess(user: any, order: { hospitalId?: string | null; vendorId?: string | null; providerId?: string | null; superVendorId?: string | null }, requirePhi = false): void {
  // PHI consent gate — enforced on reads (GET), not on status mutations
  if (requirePhi && !user.hasAgreedToPHIAccess) {
    throw new ForbiddenError('PHI access requires acknowledgment of the PHI consent terms. Please complete consent before accessing patient records.');
  }
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'HOSPITAL') {
    if (order.hospitalId !== user.hospitalId) throw new ForbiddenError('Access denied');
    return; // hospital users only scoped by hospitalId
  }
  if (user.userType === 'VENDOR') {
    if (order.vendorId !== user.vendorId) throw new ForbiddenError('Access denied');
    return; // vendor users only scoped by vendorId
  }
  // Provider / SuperVendor users
  if (user.providerId && order.providerId !== user.providerId) {
    throw new ForbiddenError('Access denied');
  }
  if (user.superVendorId && order.superVendorId !== user.superVendorId) {
    throw new ForbiddenError('Access denied');
  }
}

// GET /orders - List orders with filters
app.get('/', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const {
    status,
    orderSubStatus,
    search,
    vendorId,
    hospitalId,
    facilityId,
    departmentId,
    physicianId,
    limit = '20',
    offset = '0',
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = c.req.query();

  let conditions: any[] = [];

  // Scope based on user role — ADMIN sees all orders
  if (user.userType !== 'ADMIN') {
    if (user.userType === 'HOSPITAL') {
      // Hospital users see all orders for their hospital only
      conditions.push(eq(orders.hospitalId, user.hospitalId));
    } else if (user.userType === 'VENDOR') {
      // Vendor users see all orders assigned to their vendor only
      conditions.push(eq(orders.vendorId, user.vendorId));
    } else {
      // Provider / SuperVendor users scope by their entity
      if (user.providerId) conditions.push(eq(orders.providerId, user.providerId));
      if (user.superVendorId) conditions.push(eq(orders.superVendorId, user.superVendorId));
    }
  }

  // Filters
  if (status) conditions.push(eq(orders.status, status));
  if (orderSubStatus) conditions.push(eq(orders.orderSubStatus, orderSubStatus));
  if (vendorId) conditions.push(eq(orders.vendorId, vendorId));
  if (hospitalId) conditions.push(eq(orders.hospitalId, hospitalId));
  if (facilityId) conditions.push(eq(orders.facilityId, facilityId));
  if (departmentId) conditions.push(eq(orders.departmentId, departmentId));
  if (physicianId) conditions.push(eq(orders.physicianId, physicianId));
  if (search) {
    conditions.push(
      or(
        like(orders.patientName, `%${search}%`),
        like(orders.identifier, `%${search}%`),
        like(orders.patientLastName, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const sortCol = SORT_COLUMNS[sortBy] || orders.createdAt;
  const orderFn = sortOrder === 'asc' ? asc : desc;

  const results = await db
    .select({
      id: orders.id,
      identifier: orders.identifier,
      patientName: orders.patientName,
      patientLastName: orders.patientLastName,
      status: orders.status,
      orderSubStatus: orders.orderSubStatus,
      priority: orders.priority,
      hospitalId: orders.hospitalId,
      vendorId: orders.vendorId,
      providerId: orders.providerId,
      superVendorId: orders.superVendorId,
      facilityId: orders.facilityId,
      departmentId: orders.departmentId,
      physicianId: orders.physicianId,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      vendorName: vendors.name,
      hospitalName: hospitals.name,
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .leftJoin(hospitals, eq(orders.hospitalId, hospitals.id))
    .where(whereClause)
    .orderBy(orderFn(sortCol))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(whereClause);

  return c.json({
    items: results,
    total: countResult[0]?.count || 0,
  });
});

// GET /orders/:id - Get order detail with items, history, and joined vendor/hospital names
app.get('/:id', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const result = await db
    .select({
      order: orders,
      vendorName: vendors.name,
      vendorContact: vendors.contact,
      hospitalName: hospitals.name,
      hospitalContact: hospitals.contact,
      facilityName: hospitalFacilities.name,
      facilityNumber: hospitalFacilities.number,
      departmentName: hospitalDepartments.name,
      departmentNumber: hospitalDepartments.number,
      physicianName: users.name,
      physicianNpi: users.npiNumber,
      physicianSpecialty: users.specialty,
    })
    .from(orders)
    .leftJoin(vendors, eq(orders.vendorId, vendors.id))
    .leftJoin(hospitals, eq(orders.hospitalId, hospitals.id))
    .leftJoin(hospitalFacilities, eq(orders.facilityId, hospitalFacilities.id))
    .leftJoin(hospitalDepartments, eq(orders.departmentId, hospitalDepartments.id))
    .leftJoin(users, eq(orders.physicianId, users.id))
    .where(eq(orders.id, id))
    .limit(1);

  if (!result.length) {
    throw new NotFoundError('Order not found');
  }

  const { order, vendorName, vendorContact, hospitalName, hospitalContact, facilityName, facilityNumber, departmentName, departmentNumber, physicianName, physicianNpi, physicianSpecialty } = result[0];

  assertOrderAccess(user, order, true); // requirePhi=true for reads

  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select().from(orderHistory).where(eq(orderHistory.orderId, id)).orderBy(desc(orderHistory.createdAt)),
  ]);

  // HIPAA §164.312(b) — log every PHI access (awaited for reliability in Workers)
  await logPhiAccess(c.env, {
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    resourceType: 'ORDER',
    resourceId: id,
    action: 'VIEW',
    ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  });

  return c.json({
    ...order,
    vendor: order.vendorId ? { id: order.vendorId, name: vendorName, contact: vendorContact } : null,
    hospital: order.hospitalId ? { id: order.hospitalId, name: hospitalName, contact: hospitalContact } : null,
    facilityDetail: order.facilityId ? { id: order.facilityId, name: facilityName, number: facilityNumber } : null,
    departmentDetail: order.departmentId ? { id: order.departmentId, name: departmentName, number: departmentNumber } : null,
    physicianDetail: order.physicianId ? { id: order.physicianId, name: physicianName, npiNumber: physicianNpi, specialty: physicianSpecialty } : null,
    orderItems: items,
    orderHistory: history,
  });
});

// POST /orders - Create order
app.post('/', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.hospitalId) {
    throw new ValidationError('Hospital ID is required');
  }

  // ── SKU MOQ / pack-multiple / max-qty validation ──────────────────────
  if (body.vendorId && Array.isArray(body.orderItems) && body.orderItems.length) {
    const itemCodesForValidation = body.orderItems
      .map((it: any) => it.code)
      .filter((c: any) => typeof c === 'string' && c.length > 0);
    if (itemCodesForValidation.length) {
      const skusForValidation = await db
        .select({
          hcpcCode: vendorItemSkus.hcpcCode,
          minimumOrderQuantity: vendorItemSkus.minimumOrderQuantity,
          maximumOrderQuantity: vendorItemSkus.maximumOrderQuantity,
          packMultiple: vendorItemSkus.packMultiple,
        })
        .from(vendorItemSkus)
        .where(
          and(
            eq(vendorItemSkus.vendorId, body.vendorId),
            // Some D1 envs prefer one-at-a-time; we keep it simple via OR
          ),
        );
      const skuByCode = new Map(skusForValidation.map((s) => [s.hcpcCode, s]));
      const violations: Array<{ code: string; reason: string }> = [];
      for (const item of body.orderItems) {
        const sku = skuByCode.get(item.code);
        if (!sku) continue;
        const qty = Number(item.quantity ?? 1);
        if (qty < (sku.minimumOrderQuantity ?? 1)) {
          violations.push({ code: item.code, reason: `quantity ${qty} below minimum ${sku.minimumOrderQuantity}` });
        }
        if (sku.maximumOrderQuantity != null && qty > sku.maximumOrderQuantity) {
          violations.push({ code: item.code, reason: `quantity ${qty} exceeds maximum ${sku.maximumOrderQuantity}` });
        }
        if (sku.packMultiple && sku.packMultiple > 1 && qty % sku.packMultiple !== 0) {
          violations.push({ code: item.code, reason: `quantity ${qty} must be multiple of pack-size ${sku.packMultiple}` });
        }
      }
      if (violations.length) {
        throw new ValidationError(`SKU constraint violations: ${JSON.stringify(violations)}`);
      }
    }
  }

  // ── Customer PO validation (if attached) ──────────────────────────────
  let customerPurchaseOrderId: string | null = body.customerPurchaseOrderId ?? null;
  if (customerPurchaseOrderId) {
    const poRow = await db
      .select()
      .from(customerPurchaseOrders)
      .where(eq(customerPurchaseOrders.id, customerPurchaseOrderId))
      .limit(1);
    if (!poRow.length) throw new ValidationError('Customer PO not found');
    const po = poRow[0];
    if (po.hospitalId !== body.hospitalId) {
      throw new ValidationError('Customer PO belongs to a different hospital');
    }
    if (po.status !== 'OPEN') {
      throw new ValidationError(`Customer PO is ${po.status}; cannot place orders against it`);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (po.expiresAt && po.expiresAt < today) {
      throw new ValidationError(`Customer PO expired on ${po.expiresAt}`);
    }
    // Validate authorized amount headroom
    if (po.authorizedAmount != null) {
      const orderItemSum = (body.orderItems ?? []).reduce(
        (s: number, it: any) => s + (Number(it.unitPrice ?? 0) * Number(it.quantity ?? 1)),
        0,
      );
      const remaining = po.authorizedAmount - (po.spentAmount ?? 0);
      if (orderItemSum > remaining) {
        throw new ValidationError(
          `Order total ($${orderItemSum.toFixed(2)}) exceeds remaining PO authorization ($${remaining.toFixed(2)})`,
        );
      }
    }
  }

  // Split-order branch — when the routing preview determined multiple vendors
  // are needed, the client submits `splits: [{ vendorId, orderItems }]`. We
  // create a no-items "parent" order and one child order per vendor, linked
  // by `parent_order_id`. See migration 0008.
  if (Array.isArray(body.splits) && body.splits.length > 1) {
    const parentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const parentNumber = await mintOrderNumber(c.env.DB, body.hospitalId);
    await db.insert(orders).values({
      id: parentId,
      identifier: `${parentNumber}-P`,
      customerPurchaseOrderId,
      status: 'IN_PROGRESS',
      orderSubStatus: 'VENDOR_ASSIGNED',
      hospitalId: body.hospitalId,
      vendorId: null,
      parentOrderId: null,
      providerId: body.providerId || null,
      superVendorId: body.superVendorId || null,
      patientName: body.patientName,
      patientLastName: body.patientLastName,
      patientGender: body.patientGender,
      patientBirthDate: body.patientBirthDate,
      patientEmail: body.patientEmail,
      patientPhone: body.patientPhone || null,
      patientAddress: body.patientAddress || null,
      diagnosis: body.diagnosis ?? null,
      icd10: body.icd10,
      extremity: body.extremity,
      facilityId: body.facilityId || null,
      departmentId: body.departmentId || null,
      physicianId: body.physicianId || null,
      insurance: body.insurance,
      insuranceId: body.insuranceId,
      authProvider: body.authProvider,
      refProvider: body.refProvider,
      signDateTime: body.signDateTime || now,
      comment: body.comment,
      priority: body.priority || 'routine',
      changedByUserId: user.id,
      orderSubStatusHistory: JSON.stringify([
        { status: 'NEW_ORDER', timestamp: now },
        { status: 'VENDOR_ASSIGNED', timestamp: now },
      ]),
      createdAt: now,
      updatedAt: now,
    });

    const childIds: string[] = [];
    for (const split of body.splits) {
      if (!split?.vendorId) {
        throw new ValidationError('Each split must have a vendorId');
      }
      const childId = crypto.randomUUID();
      childIds.push(childId);
      await db.insert(orders).values({
        id: childId,
        identifier: `${parentNumber}-${childIds.length}`,
        customerPurchaseOrderId,
        status: 'IN_PROGRESS',
        orderSubStatus: 'VENDOR_ASSIGNED',
        hospitalId: body.hospitalId,
        vendorId: split.vendorId,
        parentOrderId: parentId,
        providerId: body.providerId || null,
        superVendorId: body.superVendorId || null,
        patientName: body.patientName,
        patientLastName: body.patientLastName,
        patientGender: body.patientGender,
        patientBirthDate: body.patientBirthDate,
        patientEmail: body.patientEmail,
        patientPhone: body.patientPhone || null,
        patientAddress: body.patientAddress || null,
        diagnosis: body.diagnosis ?? null,
        icd10: body.icd10,
        extremity: body.extremity,
        facilityId: body.facilityId || null,
        departmentId: body.departmentId || null,
        physicianId: body.physicianId || null,
        insurance: body.insurance,
        insuranceId: body.insuranceId,
        authProvider: body.authProvider,
        refProvider: body.refProvider,
        signDateTime: body.signDateTime || now,
        comment: body.comment,
        priority: body.priority || 'routine',
        changedByUserId: user.id,
        orderSubStatusHistory: JSON.stringify([
          { status: 'NEW_ORDER', timestamp: now },
          { status: 'VENDOR_ASSIGNED', timestamp: now },
        ]),
        createdAt: now,
        updatedAt: now,
      });
      // Child order items — apply contract pricing (CONTRACT > MEDICARE > MANUAL)
      if (Array.isArray(split.orderItems) && split.orderItems.length) {
        const childCodes: string[] = split.orderItems
          .map((it: any) => it.code ?? it.hcpcCode)
          .filter((c: any) => typeof c === 'string' && c.length > 0);
        const splitRates = body.hospitalId && split.vendorId
          ? await getContractRatesBulk(c.env.DB, body.hospitalId, split.vendorId, childCodes)
          : new Map();

        for (const item of split.orderItems) {
          const hcpc = item.code ?? item.hcpcCode ?? null;
          let unitPrice: number | null = null;
          let medicareFee: number | null = null;
          let priceSource: 'CONTRACT' | 'MEDICARE' | 'MANUAL' = 'MANUAL';
          let sourceContractId: string | null = null;
          if (hcpc) {
            const feeRaw: any = await db.run(sql`
              SELECT non_rural_rate FROM medicare_fee_schedule_items WHERE hcpc_code = ${hcpc} LIMIT 1
            `);
            const feeRow = feeRaw.results?.[0] ?? feeRaw[0];
            medicareFee = feeRow?.non_rural_rate ?? null;
            const contractMatch = splitRates.get(hcpc);
            if (contractMatch) {
              unitPrice = contractMatch.rate;
              priceSource = 'CONTRACT';
              sourceContractId = contractMatch.contractId;
            } else if (medicareFee != null) {
              unitPrice = medicareFee;
              priceSource = 'MEDICARE';
            }
          }
          const itemId = crypto.randomUUID();
          await db.run(sql`
            INSERT INTO order_items
              (id, order_id, code, quantity, description, section, item_type,
               hcpc_code, medicare_fee, unit_price, is_bundle, added_by,
               price_source, contract_id, created_at)
            VALUES
              (${itemId}, ${childId}, ${hcpc ?? ''}, ${item.quantity ?? 1}, ${item.description ?? null},
               'ASSESSMENT', 'NON_LOT',
               ${hcpc}, ${medicareFee}, ${unitPrice}, 0, 'HOSPITAL',
               ${priceSource}, ${sourceContractId}, ${now})
          `);
        }
      }
      await db.insert(orderHistory).values({
        id: crypto.randomUUID(),
        orderId: childId,
        description: 'Order created via multi-vendor split',
        changedByUserId: user.id,
        createdAt: now,
      });
      try {
        await c.env.EVENTS_QUEUE.send({
          type: 'order.created',
          payload: { orderId: childId },
        });
      } catch (err) {
        console.warn('[orders] failed to enqueue child order.created event:', err);
      }
    }

    const parent = await db
      .select()
      .from(orders)
      .where(eq(orders.id, parentId))
      .limit(1);
    return c.json({ parent: { ...parent[0], isParent: true }, childIds, splitCount: childIds.length }, 201);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialSubStatus = body.vendorId ? 'VENDOR_ASSIGNED' : 'NEW_ORDER';
  const initialStatus = body.vendorId ? 'IN_PROGRESS' : 'PENDING';

  // Backfill diagnosis from icd10 code description when not explicitly provided
  let diagnosisText: string | null = body.diagnosis ?? null;
  if ((!diagnosisText || !diagnosisText.trim()) && body.icd10) {
    const icdRaw: any = await db.run(sql`
      SELECT description FROM icd10_codes WHERE code = ${body.icd10} LIMIT 1
    `);
    const icdRow = icdRaw.results?.[0];
    if (icdRow?.description) diagnosisText = icdRow.description;
  }

  // Resolve FK IDs to denormalized text fields
  let facilityId = body.facilityId || null;
  let departmentId = body.departmentId || null;
  let physicianId = body.physicianId || null;
  let facilityName = body.facility || null;
  let facilityNum = body.facilityNumber || null;
  let departmentName = body.department || null;
  let departmentNum = body.departmentNumber || null;
  let refProvider = body.refProvider || null;

  // Auto-set physician if the creating user is a PHYSICIAN
  if (!physicianId && user.role === 'PHYSICIAN') {
    physicianId = user.id;
  }

  if (facilityId) {
    const fac = await db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, facilityId)).limit(1);
    if (fac.length) { facilityName = fac[0].name; facilityNum = fac[0].number ?? null; }
  }
  if (departmentId) {
    const dept = await db.select().from(hospitalDepartments).where(eq(hospitalDepartments.id, departmentId)).limit(1);
    if (dept.length) { departmentName = dept[0].name; departmentNum = dept[0].number ?? null; }
  }
  if (physicianId) {
    const phys = await db.select().from(users).where(eq(users.id, physicianId)).limit(1);
    if (phys.length) refProvider = phys[0].name ?? refProvider;
  }

  // Create order
  await db.insert(orders).values({
    id,
    identifier: await mintOrderNumber(c.env.DB, body.hospitalId),
    customerPurchaseOrderId,
    status: initialStatus,
    orderSubStatus: initialSubStatus,
    hospitalId: body.hospitalId,
    vendorId: body.vendorId || null,
    providerId: body.providerId || null,
    superVendorId: body.superVendorId || null,
    patientName: body.patientName,
    patientLastName: body.patientLastName,
    patientGender: body.patientGender,
    patientBirthDate: body.patientBirthDate,
    patientEmail: body.patientEmail,
    patientPhone: body.patientPhone || null,
    patientAddress: body.patientAddress || null,
    diagnosis: diagnosisText,
    icd10: body.icd10,
    extremity: body.extremity,
    department: departmentName,
    departmentNumber: departmentNum,
    facility: facilityName,
    facilityNumber: facilityNum,
    facilityId,
    departmentId,
    physicianId,
    insurance: body.insurance,
    insuranceId: body.insuranceId,
    authProvider: body.authProvider,
    refProvider,
    signDateTime: body.signDateTime || now,
    comment: body.comment,
    priority: body.priority || 'routine',
    changedByUserId: user.id,
    orderSubStatusHistory: JSON.stringify(
      body.vendorId
        ? [{ status: 'NEW_ORDER', timestamp: now }, { status: 'VENDOR_ASSIGNED', timestamp: now }]
        : [{ status: 'NEW_ORDER', timestamp: now }]
    ),
    createdAt: now,
    updatedAt: now,
  });

  // Create order items — hospital-requested items land in the ASSESSMENT
  // section. Price-source priority: CONTRACT > FEE_SCHEDULE > MEDICARE > MANUAL.
  // We bulk-fetch contract rates once for the (hospital, vendor) pair to avoid
  // an N+1 query, then apply per-item with Medicare fallback.
  if (body.orderItems?.length) {
    const itemCodes: string[] = (body.orderItems as any[])
      .map((it) => it.code)
      .filter((c) => typeof c === 'string' && c.length > 0);
    const contractRates = body.hospitalId && body.vendorId
      ? await getContractRatesBulk(c.env.DB, body.hospitalId, body.vendorId, itemCodes)
      : new Map();

    for (const item of body.orderItems) {
      const hcpc = item.code ?? null;
      let unitPrice: number | null = null;
      let medicareFee: number | null = null;
      let priceSource: 'CONTRACT' | 'MEDICARE' | 'MANUAL' = 'MANUAL';
      let sourceContractId: string | null = null;

      if (hcpc) {
        // Always fetch Medicare fee for reference (denormalized into row).
        const feeRaw: any = await db.run(sql`
          SELECT non_rural_rate FROM medicare_fee_schedule_items WHERE hcpc_code = ${hcpc} LIMIT 1
        `);
        const feeRow = feeRaw.results?.[0] ?? feeRaw[0];
        medicareFee = feeRow?.non_rural_rate ?? null;

        // Priority 1: contract rate
        const contractMatch = contractRates.get(hcpc);
        if (contractMatch) {
          unitPrice = contractMatch.rate;
          priceSource = 'CONTRACT';
          sourceContractId = contractMatch.contractId;
        } else if (medicareFee != null) {
          // Priority 3: Medicare (FEE_SCHEDULE path goes through hospital_vendors
          // and is applied at invoice generation — orders fall through to Medicare
          // for now if no contract exists)
          unitPrice = medicareFee;
          priceSource = 'MEDICARE';
        }
      }

      const itemId = crypto.randomUUID();
      await db.run(sql`
        INSERT INTO order_items
          (id, order_id, code, quantity, description, section, item_type,
           hcpc_code, medicare_fee, unit_price, is_bundle, added_by,
           price_source, contract_id, created_at)
        VALUES
          (${itemId}, ${id}, ${hcpc ?? ''}, ${item.quantity ?? 1}, ${item.description ?? null},
           'ASSESSMENT', 'NON_LOT',
           ${hcpc}, ${medicareFee}, ${unitPrice}, 0, 'HOSPITAL',
           ${priceSource}, ${sourceContractId}, ${now})
      `);
    }
  }

  // ── Persist orderer + contact records (1:N table) ────────────────────
  const contactRoles: Array<{ role: string; body: any }> = [
    { role: 'ORDERER', body: body.orderer },
    { role: 'SHIP_TO', body: body.shipToContact },
    { role: 'BILL_TO', body: body.billToContact },
    { role: 'CLINICAL', body: body.clinicalContact },
  ];
  for (const { role, body: contact } of contactRoles) {
    if (contact && typeof contact === 'object' && (contact.name || contact.email || contact.phone)) {
      try {
        await db.insert(orderContacts).values({
          orderId: id,
          role,
          name: contact.name ?? null,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          title: contact.title ?? null,
          notes: contact.notes ?? null,
          isPrimary: contact.isPrimary ? 1 : 0,
        });
      } catch (err) {
        console.warn(`[orders] failed to insert ${role} contact:`, err);
      }
    }
  }

  // ── Update customer PO spentAmount if attached ───────────────────────
  if (customerPurchaseOrderId) {
    try {
      // Recompute order spend from inserted line items
      const itemsSum: any = await db.run(sql`
        SELECT COALESCE(SUM(unit_price * quantity), 0) AS spend FROM order_items WHERE order_id = ${id}
      `);
      const itemsSpend = Number(itemsSum.results?.[0]?.spend ?? 0);
      if (itemsSpend > 0) {
        await db.run(sql`
          UPDATE customer_purchase_orders
          SET spent_amount = spent_amount + ${itemsSpend},
              updated_at = ${now}
          WHERE id = ${customerPurchaseOrderId}
        `);
        // Auto-mark EXHAUSTED if fully consumed
        await db.run(sql`
          UPDATE customer_purchase_orders
          SET status = 'EXHAUSTED'
          WHERE id = ${customerPurchaseOrderId}
            AND authorized_amount IS NOT NULL
            AND spent_amount >= authorized_amount
            AND status = 'OPEN'
        `);
      }
    } catch (err) {
      console.warn('[orders] failed to update PO spent_amount:', err);
    }
  }

  // Create initial order history
  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: body.vendorId ? 'Order created and vendor assigned' : 'Order created',
    changedByUserId: user.id,
    createdAt: now,
  });

  // Enqueue order created event
  try {
    await c.env.EVENTS_QUEUE.send({ type: 'order.created', payload: { orderId: id } });
  } catch (err) {
    console.warn('[orders] failed to enqueue order.created event:', err);
  }

  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// PUT /orders/:id - Update order
app.put('/:id', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Order not found');
  }

  assertOrderAccess(user, existing[0]);

  await db
    .update(orders)
    .set({
      ...body,
      changedByUserId: user.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orders.id, id));

  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return c.json(result[0]);
});

// PUT /orders/:id/status - Update order status (state machine)
app.put('/:id/status', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const { orderSubStatus: newSubStatus, reason } = await c.req.json();

  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Order not found');
  }

  const order = existing[0];
  assertOrderAccess(user, order);
  const now = new Date().toISOString();

  // Determine parent status from sub-status
  let newStatus = order.status;
  if (['VENDOR_ASSIGNED', 'VENDOR_CONFIRMED', 'VENDOR_CONFIRMED_RECEIPT', 'DISPENSED', 'ORDER_REQUESTED_FOR_MODIFY', 'PATIENT_VISITED_AND_ASSESSED', 'DELIVERED', 'SPEND_CONFIRMED', 'PROOF_UPLOADED'].includes(newSubStatus)) {
    newStatus = 'IN_PROGRESS';
  } else if (['ORDER_COMPLETED', 'COMPLETED'].includes(newSubStatus)) {
    newStatus = 'COMPLETED';
  } else if (['VENDOR_DECLINED', 'FACILITY_CANCELLED', 'CANCELLED'].includes(newSubStatus)) {
    newStatus = 'CANCELLED';
  }

  // Update status history
  let statusHistory = [];
  try {
    statusHistory = JSON.parse(order.orderSubStatusHistory || '[]');
  } catch { /* empty */ }
  statusHistory.push({ status: newSubStatus, timestamp: now });

  const updateData: any = {
    status: newStatus,
    orderSubStatus: newSubStatus,
    orderSubStatusHistory: JSON.stringify(statusHistory),
    changedByUserId: user.id,
    updatedAt: now,
  };

  if (['VENDOR_DECLINED', 'CANCELLED', 'FACILITY_CANCELLED'].includes(newSubStatus) && reason) {
    updateData.declineReason = reason;
  }
  if (newSubStatus === 'ORDER_REQUESTED_FOR_MODIFY' && reason) {
    updateData.modifyReason = reason;
  }

  await db.update(orders).set(updateData).where(eq(orders.id, id));

  // Auto-create invoice when order completes
  if (newSubStatus === 'ORDER_COMPLETED') {
    const invoiceService = new InvoiceService(c.env.DB);
    await invoiceService.createInvoiceForOrder({
      id: order.id,
      hospitalId: order.hospitalId!,
      vendorId: order.vendorId,
      providerId: order.providerId,
      superVendorId: order.superVendorId,
      identifier: order.identifier ?? order.id,
    });
  }

  // Add history entry
  const statusLabels: Record<string, string> = {
    VENDOR_ASSIGNED: 'Vendor assigned to order',
    VENDOR_CONFIRMED: 'Vendor confirmed receipt',
    VENDOR_CONFIRMED_RECEIPT: 'Vendor confirmed receipt',
    VENDOR_DECLINED: `Vendor declined order${reason ? ': ' + reason : ''}`,
    DISPENSED: 'Order dispensed',
    FACILITY_CANCELLED: 'Order cancelled by facility',
    CANCELLED: `Order cancelled${reason ? ': ' + reason : ''}`,
    ORDER_REQUESTED_FOR_MODIFY: `Modification requested${reason ? ': ' + reason : ''}`,
    PATIENT_VISITED_AND_ASSESSED: 'Patient visited and assessed',
    DELIVERED: 'Order delivered',
    SPEND_CONFIRMED: 'Spend confirmed by hospital',
    PROOF_UPLOADED: 'Proof of delivery uploaded',
    ORDER_COMPLETED: 'Order completed',
    COMPLETED: 'Order completed',
  };

  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: statusLabels[newSubStatus] || `Status changed to ${newSubStatus}`,
    changedByUserId: user.id,
    createdAt: now,
  });

  // Enqueue status change event (and invoice.created if just completed)
  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'order.status_changed',
      payload: {
        orderId: id,
        newStatus,
        newSubStatus,
        oldStatus: order.orderSubStatus,
        changedByUserId: user.id,
      },
    });
  } catch (err) {
    console.warn('[orders] failed to enqueue order.status_changed event:', err);
  }

  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return c.json(result[0]);
});

// PUT /orders/:id/assign-vendor - Assign vendor to order
app.put('/:id/assign-vendor', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const { vendorId } = await c.req.json();

  if (!vendorId) {
    throw new ValidationError('Vendor ID is required');
  }

  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Order not found');
  }

  assertOrderAccess(user, existing[0]);

  if (existing[0].orderSubStatus !== 'NEW_ORDER') {
    throw new ValidationError('Order can only be assigned when in NEW_ORDER status');
  }

  const now = new Date().toISOString();
  let statusHistory = [];
  try {
    statusHistory = JSON.parse(existing[0].orderSubStatusHistory || '[]');
  } catch { /* empty */ }
  statusHistory.push({ status: 'VENDOR_ASSIGNED', timestamp: now });

  await db
    .update(orders)
    .set({
      vendorId,
      status: 'IN_PROGRESS',
      orderSubStatus: 'VENDOR_ASSIGNED',
      orderSubStatusHistory: JSON.stringify(statusHistory),
      changedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(orders.id, id));

  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: 'Vendor assigned to order',
    changedByUserId: user.id,
    createdAt: now,
  });

  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'order.status_changed',
      payload: {
        orderId: id,
        newStatus: 'IN_PROGRESS',
        newSubStatus: 'VENDOR_ASSIGNED',
        oldStatus: 'NEW_ORDER',
        changedByUserId: user.id,
      },
    });
  } catch (err) {
    console.warn('[orders] failed to enqueue vendor assigned event:', err);
  }

  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  return c.json(result[0]);
});

// PUT /orders/:id/benefit-verification — Phase 6
app.put('/:id/benefit-verification', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();

  const chk = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!chk.length) throw new NotFoundError('Order not found');
  assertOrderAccess(user, chk[0]);

  await db.run(sql`
    UPDATE orders SET
      benefit_verification_status = ${body.status ?? 'VERIFIED'},
      benefit_verification_note = ${body.note ?? null},
      changed_by_user_id = ${user.id},
      updated_at = ${now}
    WHERE id = ${id}
  `);

  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: `Benefit verification: ${body.status ?? 'VERIFIED'}${body.note ? ` — ${body.note}` : ''}`,
    changedByUserId: user.id,
    createdAt: now,
  });

  return c.json({ success: true });
});

// PUT /orders/:id/authorization — Phase 6
app.put('/:id/authorization', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();

  const chk2 = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!chk2.length) throw new NotFoundError('Order not found');
  assertOrderAccess(user, chk2[0]);

  await db.run(sql`
    UPDATE orders SET
      authorization_number = ${body.authorizationNumber ?? null},
      authorization_l_codes = ${JSON.stringify(body.lCodes ?? [])},
      changed_by_user_id = ${user.id},
      updated_at = ${now}
    WHERE id = ${id}
  `);

  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: `Authorization recorded: ${body.authorizationNumber ?? 'N/A'}`,
    changedByUserId: user.id,
    createdAt: now,
  });

  return c.json({ success: true });
});

// POST /orders/:id/follow-up — multi-visit support (Phase 6)
app.post('/:id/follow-up', requirePermission('orders', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id: parentId } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();

  const parent = await db.select().from(orders).where(eq(orders.id, parentId)).limit(1);
  if (!parent.length) throw new NotFoundError('Parent order not found');
  assertOrderAccess(user, parent[0]);
  const p: any = parent[0];

  const id = crypto.randomUUID();
  const visitNumRaw: any = await db.run(
    sql`SELECT COALESCE(MAX(visit_number), 1) + 1 as n FROM orders WHERE parent_order_id = ${parentId}`,
  );
  const visitNum = visitNumRaw.results?.[0]?.n ?? 2;

  await db.insert(orders).values({
    id,
    identifier: `${p.identifier}-V${visitNum}`,
    status: 'PENDING',
    orderSubStatus: 'NEW_ORDER',
    hospitalId: p.hospitalId,
    vendorId: p.vendorId,
    providerId: p.providerId,
    superVendorId: p.superVendorId,
    patientName: p.patientName,
    patientLastName: p.patientLastName,
    patientGender: p.patientGender,
    patientBirthDate: p.patientBirthDate,
    diagnosis: body.diagnosis ?? p.diagnosis,
    icd10: body.icd10 ?? p.icd10,
    extremity: p.extremity,
    department: p.department,
    priority: body.priority ?? 'routine',
    changedByUserId: user.id,
    orderSubStatusHistory: JSON.stringify([{ status: 'NEW_ORDER', timestamp: now }]),
    signDateTime: now,
    createdAt: now,
    updatedAt: now,
  });

  // set parent linkage + visit number
  await db.run(sql`UPDATE orders SET parent_order_id = ${parentId}, visit_number = ${visitNum} WHERE id = ${id}`);

  return c.json({ id, visitNumber: visitNum }, 201);
});

// DELETE /orders/:id - Soft-delete order (cancel)
app.delete('/:id', requirePermission('orders', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Order not found');

  const order = existing[0];
  assertOrderAccess(user, order);

  if (order.status === 'COMPLETED') {
    throw new ValidationError('Completed orders cannot be cancelled');
  }

  const now = new Date().toISOString();
  let history: any[] = [];
  try {
    history = JSON.parse(order.orderSubStatusHistory || '[]');
  } catch { /* empty */ }
  history.push({ status: 'FACILITY_CANCELLED', timestamp: now });

  await db
    .update(orders)
    .set({
      status: 'CANCELLED',
      orderSubStatus: 'FACILITY_CANCELLED',
      orderSubStatusHistory: JSON.stringify(history),
      changedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(orders.id, id));

  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: 'Order cancelled',
    changedByUserId: user.id,
    createdAt: now,
  });

  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'order.status_changed',
      payload: {
        orderId: id,
        newStatus: 'CANCELLED',
        newSubStatus: 'FACILITY_CANCELLED',
        oldStatus: order.orderSubStatus,
        changedByUserId: user.id,
      },
    });
  } catch { /* empty */ }

  return c.json({ success: true });
});

// ─── Medzah parity additions ───────────────────────────────────────────────

// POST /orders/bulk-update-status — update many orders' status in one call.
app.post('/bulk-update-status', requirePermission('orders', 'WRITE'), async (c) => {
  const user = c.get('user') as any;
  const body = (await c.req.json()) as {
    updates: Array<{ orderId: string; status?: string; subStatus?: string }>;
  };
  if (!body || !Array.isArray(body.updates)) {
    throw new ValidationError('updates array required');
  }
  if (body.updates.length === 0 || body.updates.length > 100) {
    throw new ValidationError('updates length must be 1..100');
  }
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();
  const results: Array<{ orderId: string; ok: boolean; error?: string }> = [];
  for (const u of body.updates) {
    try {
      const existing = await db
        .select()
        .from(orders)
        .where(eq(orders.id, u.orderId))
        .limit(1);
      const ord = existing[0];
      if (!ord) {
        results.push({ orderId: u.orderId, ok: false, error: 'not_found' });
        continue;
      }
      assertOrderAccess(user, ord);
      const set: Record<string, any> = { updatedAt: now };
      if (u.status) set.status = u.status;
      if (u.subStatus) set.orderSubStatus = u.subStatus;
      await db.update(orders).set(set).where(eq(orders.id, u.orderId));
      await db.insert(orderHistory).values({
        id: crypto.randomUUID(),
        orderId: u.orderId,
        description: `Bulk update → status=${u.status ?? '(unchanged)'}, subStatus=${u.subStatus ?? '(unchanged)'}`,
        changedByUserId: user.id,
        createdAt: now,
      });
      results.push({ orderId: u.orderId, ok: true });
    } catch (err) {
      results.push({ orderId: u.orderId, ok: false, error: (err as Error).message });
    }
  }
  return c.json({ updated: results.filter((r) => r.ok).length, results });
});

// POST /orders/:id/send-for-approval — explicit state transition.
app.post('/:id/send-for-approval', requirePermission('orders', 'WRITE'), async (c) => {
  const user = c.get('user') as any;
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = existing[0];
  if (!order) throw new NotFoundError('Order not found');
  assertOrderAccess(user, order);
  const now = new Date().toISOString();
  const newSubStatus = order.orderSubStatus === 'ORDER_REQUESTED_FOR_MODIFY'
    ? 'NEW_ORDER'
    : 'NEW_ORDER';
  await db.update(orders).set({ orderSubStatus: newSubStatus, updatedAt: now }).where(eq(orders.id, id));
  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: `Sent for approval (${newSubStatus})`,
    changedByUserId: user.id,
    createdAt: now,
  });
  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'order.status_changed',
      payload: { orderId: id, newSubStatus, oldStatus: order.orderSubStatus, changedByUserId: user.id },
    });
  } catch { /* empty */ }
  return c.json({ success: true, orderId: id, newSubStatus });
});

// POST /orders/:id/reject — reject with structured reason.
app.post('/:id/reject', requirePermission('orders', 'WRITE'), async (c) => {
  const user = c.get('user') as any;
  const id = c.req.param('id');
  const body = (await c.req.json()) as { reason?: string };
  if (!body?.reason || body.reason.trim().length < 3) {
    throw new ValidationError('reason is required (min 3 chars)');
  }
  const db = getDb(c.env.DB);
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = existing[0];
  if (!order) throw new NotFoundError('Order not found');
  assertOrderAccess(user, order);
  const targetSubStatus = user.userType === 'VENDOR' ? 'VENDOR_DECLINED' : 'FACILITY_CANCELLED';
  const now = new Date().toISOString();
  await db
    .update(orders)
    .set({
      orderSubStatus: targetSubStatus,
      status: targetSubStatus === 'FACILITY_CANCELLED' ? 'CANCELLED' : order.status,
      updatedAt: now,
    })
    .where(eq(orders.id, id));
  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: `Rejected: ${body.reason.trim()}`,
    changedByUserId: user.id,
    createdAt: now,
  });
  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'order.status_changed',
      payload: {
        orderId: id,
        newSubStatus: targetSubStatus,
        oldStatus: order.orderSubStatus,
        changedByUserId: user.id,
        rejectionReason: body.reason.trim(),
      },
    });
  } catch { /* empty */ }
  return c.json({ success: true, orderId: id, newSubStatus: targetSubStatus });
});

// POST /orders/:id/sticker-info — attach sticker/barcode info to an order.
app.post('/:id/sticker-info', requirePermission('orders', 'WRITE'), async (c) => {
  const user = c.get('user') as any;
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    stickerType: 'PATIENT' | 'SPECIMEN' | 'KIT' | 'SHIPPING';
    barcodeValue: string;
    barcodeFormat?: string;
    printableLines?: string[];
    metadata?: Record<string, unknown>;
  };
  if (!body?.stickerType || !body?.barcodeValue) {
    throw new ValidationError('stickerType and barcodeValue are required');
  }
  const db = getDb(c.env.DB);
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = existing[0];
  if (!order) throw new NotFoundError('Order not found');
  assertOrderAccess(user, order);
  const stickerId = crypto.randomUUID();
  await db.insert(orderStickers).values({
    id: stickerId,
    orderId: id,
    labOrderId: null,
    stickerType: body.stickerType,
    barcodeValue: body.barcodeValue,
    barcodeFormat: body.barcodeFormat ?? 'code128',
    printableLines: body.printableLines ? JSON.stringify(body.printableLines) : null,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null,
  });
  return c.json({ success: true, stickerId });
});

// POST /orders/:id/log-access — manually record an asset-access event.
app.post('/:id/log-access', async (c) => {
  const user = c.get('user') as any;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { accessType?: string; fileKey?: string; details?: string };
  const db = getDb(c.env.DB);
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = existing[0];
  if (!order) throw new NotFoundError('Order not found');
  assertOrderAccess(user, order, true);
  await db.insert(fileAccessLog).values({
    id: crypto.randomUUID(),
    userId: user.id,
    userEmail: user.email ?? null,
    userType: user.userType ?? null,
    fileKey: body.fileKey ?? `order:${id}`,
    fileKind: body.accessType ?? 'MANUAL_LOG',
    orderId: id,
    hospitalId: order.hospitalId ?? null,
    vendorId: order.vendorId ?? null,
    bytesServed: null,
    httpStatus: 200,
    ipAddress: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
    accessedAt: new Date().toISOString(),
  });
  return c.json({ success: true });
});

export default app;

/**
 * Public catalog browse endpoint — returns SKUs joined with their group
 * metadata and the resolved price for the caller's hospital.
 *
 * GET /catalog?q=&vendorId=&groupId=&hcpcCode=&limit=&offset=
 *
 * Price source priority: CONTRACT → FEE_SCHEDULE → MEDICARE → listPrice
 *
 * Scoped: hospital users see SKUs from vendors they have an APPROVED
 * hospital_vendors relationship with; vendors see their own SKUs; admins
 * see everything.
 */
import { Hono } from 'hono';
import { eq, and, like, or, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorItemSkus,
  skuGroups,
  hospitalVendors,
  vendors,
} from '@curavend/db';
import { ForbiddenError } from '../lib/errors';
import { resolvePricesBulk } from '../lib/priceResolver';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const {
    q,
    vendorId,
    groupId,
    hcpcCode,
    limit = '50',
    offset = '0',
  } = c.req.query();

  // Determine vendor scope
  let allowedVendorIds: string[] | null = null;
  if (user.userType === 'ADMIN') {
    allowedVendorIds = null; // unrestricted
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    allowedVendorIds = [user.vendorId];
  } else if (user.userType === 'HOSPITAL' && user.hospitalId) {
    // Hospitals see SKUs from vendors they have an APPROVED relationship with
    const hv = await db
      .select({ vendorId: hospitalVendors.vendorId })
      .from(hospitalVendors)
      .where(eq(hospitalVendors.hospitalId, user.hospitalId));
    allowedVendorIds = hv.map((r) => r.vendorId).filter((v): v is string => !!v);
    if (allowedVendorIds.length === 0) {
      return c.json({ items: [], total: 0 });
    }
  } else {
    return c.json({ items: [], total: 0 });
  }

  const conditions: any[] = [eq(vendorItemSkus.isActive, 1)];
  if (vendorId) conditions.push(eq(vendorItemSkus.vendorId, vendorId));
  if (groupId) conditions.push(eq(vendorItemSkus.groupId, groupId));
  if (hcpcCode) conditions.push(eq(vendorItemSkus.hcpcCode, hcpcCode));
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        like(vendorItemSkus.hcpcCode, pattern),
        like(vendorItemSkus.description, pattern),
        like(vendorItemSkus.tagline, pattern),
        like(vendorItemSkus.manufacturerName, pattern),
      ),
    );
  }
  if (allowedVendorIds) {
    conditions.push(inArray(vendorItemSkus.vendorId, allowedVendorIds));
  }

  const where = and(...conditions);

  // Fetch SKUs + group + vendor
  const rows = await db
    .select({
      // SKU
      id: vendorItemSkus.id,
      vendorId: vendorItemSkus.vendorId,
      hcpcCode: vendorItemSkus.hcpcCode,
      vendorSku: vendorItemSkus.vendorSku,
      description: vendorItemSkus.description,
      manufacturerName: vendorItemSkus.manufacturerName,
      manufacturerItemNumber: vendorItemSkus.manufacturerItemNumber,
      unitsPerPack: vendorItemSkus.unitsPerPack,
      packsPerCase: vendorItemSkus.packsPerCase,
      unitOfMeasurement: vendorItemSkus.unitOfMeasurement,
      listPriceCents: vendorItemSkus.listPriceCents,
      currencyCode: vendorItemSkus.currencyCode,
      minimumOrderQuantity: vendorItemSkus.minimumOrderQuantity,
      maximumOrderQuantity: vendorItemSkus.maximumOrderQuantity,
      packMultiple: vendorItemSkus.packMultiple,
      tagline: vendorItemSkus.tagline,
      longDescription: vendorItemSkus.longDescription,
      imageUrl: vendorItemSkus.imageUrl,
      datasheetUrl: vendorItemSkus.datasheetUrl,
      groupId: vendorItemSkus.groupId,
      variantAttributes: vendorItemSkus.variantAttributes,
      // Group
      groupName: skuGroups.groupName,
      groupCoverImageUrl: skuGroups.coverImageUrl,
      groupDatasheetUrl: skuGroups.datasheetUrl,
      // Vendor
      vendorName: vendors.name,
    })
    .from(vendorItemSkus)
    .leftJoin(skuGroups, eq(vendorItemSkus.groupId, skuGroups.id))
    .leftJoin(vendors, eq(vendorItemSkus.vendorId, vendors.id))
    .where(where)
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(vendorItemSkus)
    .where(where);
  const total = countRow[0]?.count ?? 0;

  // Resolve hospital-specific price per row when hospital user
  let enriched = rows.map((r) => ({
    ...r,
    resolvedPriceCents: r.listPriceCents,
    priceSource: 'LIST' as string,
    contractId: null as string | null,
  }));
  if (user.userType === 'HOSPITAL' && user.hospitalId && rows.length) {
    // Full pricing cascade per vendor using resolvePricesBulk
    const byVendor = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byVendor.get(r.vendorId) ?? [];
      list.push(r);
      byVendor.set(r.vendorId, list);
    }
    for (const [vid, list] of byVendor.entries()) {
      const codes = Array.from(new Set(list.map((r) => r.hcpcCode).filter((c): c is string => !!c)));
      const priceMap = await resolvePricesBulk(c.env.DB, {
        hospitalId: user.hospitalId,
        vendorId: vid,
        codes,
      });
      for (const r of list) {
        const resolved = r.hcpcCode ? priceMap.get(r.hcpcCode) : undefined;
        if (resolved && resolved.priceSource !== 'MANUAL' && resolved.unitPrice != null) {
          const idx = enriched.findIndex((e) => e.id === r.id);
          if (idx >= 0) {
            enriched[idx] = {
              ...enriched[idx],
              resolvedPriceCents: Math.round(resolved.unitPrice * 100),
              priceSource: resolved.priceSource,
              contractId: resolved.contractId,
            };
          }
        }
      }
    }
  }

  return c.json({ items: enriched, total });
});

export default app;

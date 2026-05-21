/**
 * Vendor coverage — read-side aggregations for hospital users.
 *
 * Answers "which of my preferred vendors have a branch that serves which of
 * my facilities?" Reuses the matching helpers from `lib/vendorRouting.ts`
 * so the UI advertises exactly what the routing engine consumes.
 *
 * Three query shapes (hospital-scoped via auth ctx):
 *   GET /api/vendor-coverage?facilityId=&vendorId=  → narrow (Add-modal)
 *   GET /api/vendor-coverage?facilityId=            → all linked vendors for facility
 *   GET /api/vendor-coverage                        → full facility×vendor matrix
 *
 * Phase A multi-category extension (additive, opt-in via ?byCategory=1):
 *   - Matrix mode: response gains `categories: ItemCategory[]` and
 *     `categoryCoverage[facilityId][category].rankedVendors[]`.
 *   - Facility-scoped mode: response is shaped as
 *     { facility, categories, categoryCoverage: { [facilityId]: {...} } }.
 *   - Narrow mode is unchanged for back-compat with the Step-2 inline pill.
 *
 * Vendor users get 403. Admins may pass ?hospitalId= to scope explicitly.
 */

import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  hospitalVendors,
  hospitalFacilities,
  vendors,
  vendorLocations,
  vendorItemSkus,
} from '@curavend/db';
import { ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';
import {
  parseJsonArray,
  categoryMatches,
  locationServesFacility,
  ITEM_CATEGORIES,
  type ItemCategory,
} from '../lib/vendorRouting';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

interface CoverageLocation {
  id: string;
  name: string;
  locationType: string;
  city: string | null;
  state: string | null;
  capabilities: string[];
  serviceStates: string[];
  maxDeliveryHours: number | null;
  isPrimary: boolean;
  servesFacility: boolean;
  reason: 'state-match' | 'zip-prefix-match' | 'out-of-region' | 'no-facility-state';
}

interface CoverageVendor {
  vendorId: string;
  vendorName: string | null;
  locations: CoverageLocation[];
  summary: {
    branchesTotal: number;
    branchesServing: number;
    bestSlaHours: number | null;
    capabilityUnion: string[];
  };
}

interface MatrixCellSummary {
  branchesTotal: number;
  branchesServing: number;
  bestSlaHours: number | null;
  capabilityUnion: string[];
}

// ─────────────────── Phase A: per-category types ──────────────────────────

interface RankedServingLocation {
  id: string;
  name: string;
  locationType: string;
  city: string | null;
  state: string | null;
  capabilities: string[];
  maxDeliveryHours: number | null;
  isPrimary: boolean;
}

export interface RankedVendorCell {
  vendorId: string;
  vendorName: string | null;
  /** hospital_vendors.priority (lower = preferred). */
  priority: number;
  branchesTotal: number;
  branchesServing: number;
  bestSlaHours: number | null;
  capabilityUnion: string[];
  /** True if a hospital_vendors row pins this vendor specifically to this facility. */
  isFacilityScoped: boolean;
  servingLocations: RankedServingLocation[];
  /** Phase C — true when this vendor has at least one active SKU row (any HCPC). */
  hasSkuMapping?: boolean;
  /** Phase C — count of active SKU rows for this vendor (any HCPC). */
  skuCount?: number;
}

export interface CategoryCell {
  rankedVendors: RankedVendorCell[];
  gapReason?: 'no-vendor-for-category' | 'no-location-serves-state';
}

// ─────────────────── JSON parse memo ──────────────────────────

interface ParsedLocation {
  raw: typeof vendorLocations.$inferSelect;
  capabilities: string[];
  serviceStatesUpper: string[];
  servicePrefixes: string[];
}

function parseLocation(loc: typeof vendorLocations.$inferSelect): ParsedLocation {
  return {
    raw: loc,
    capabilities: parseJsonArray(loc.capabilities),
    serviceStatesUpper: parseJsonArray(loc.serviceStates).map((s) => s.toUpperCase()),
    servicePrefixes: parseJsonArray(loc.serviceZipPrefixes),
  };
}

function evaluateLocation(
  parsed: ParsedLocation,
  facilityState: string | null,
  facilityZip: string | null,
): CoverageLocation {
  const { raw, capabilities, serviceStatesUpper, servicePrefixes } = parsed;

  let servesFacility = false;
  let reason: CoverageLocation['reason'] = 'out-of-region';

  if (!facilityState) {
    servesFacility = true;
    reason = 'no-facility-state';
  } else if (serviceStatesUpper.includes(facilityState.toUpperCase())) {
    servesFacility = true;
    reason = 'state-match';
  } else if (facilityZip && servicePrefixes.length > 0) {
    const prefix = facilityZip.substring(0, 3);
    if (servicePrefixes.includes(prefix)) {
      servesFacility = true;
      reason = 'zip-prefix-match';
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    locationType: raw.locationType,
    city: raw.city,
    state: raw.state,
    capabilities,
    serviceStates: serviceStatesUpper,
    maxDeliveryHours: raw.maxDeliveryHours ?? null,
    isPrimary: raw.isPrimary === 1,
    servesFacility,
    reason,
  };
}

function buildSummary(locations: CoverageLocation[]): MatrixCellSummary {
  const serving = locations.filter((l) => l.servesFacility);
  const slaCandidates = serving
    .map((l) => l.maxDeliveryHours)
    .filter((h): h is number => typeof h === 'number');
  const bestSla = slaCandidates.length ? Math.min(...slaCandidates) : null;
  const capUnion = new Set<string>();
  for (const l of serving) for (const c of l.capabilities) capUnion.add(c);
  return {
    branchesTotal: locations.length,
    branchesServing: serving.length,
    bestSlaHours: bestSla,
    capabilityUnion: Array.from(capUnion),
  };
}

/**
 * For one (facility, category) pair, walk all hospital_vendors rows for this
 * hospital that (a) match the category and (b) are scoped to this facility
 * or hospital-wide. For each unique vendor, collect locations that serve the
 * facility, then build a RankedVendorCell. Returns vendors sorted by priority.
 */
function buildCategoryCell(opts: {
  facility: typeof hospitalFacilities.$inferSelect;
  category: ItemCategory;
  hvRows: Array<typeof hospitalVendors.$inferSelect>;
  parsedLocsByVendor: Record<string, ParsedLocation[]>;
  vendorNameById: Record<string, string | null>;
  /** Phase C: per-vendor SKU count (active only). */
  skuCountByVendor?: Record<string, number>;
}): CategoryCell {
  const { facility, category, hvRows, parsedLocsByVendor, vendorNameById, skuCountByVendor } = opts;
  const facilityState = (facility.state || '').toUpperCase() || null;
  const facilityZip = facility.zip || null;

  // hospital_vendors rows that apply to this facility (specific match OR null)
  // AND match the category.
  const applicableHv = hvRows.filter((hv) => {
    if (hv.facilityId != null && hv.facilityId !== facility.id) return false;
    const cats = parseJsonArray(hv.itemCategories);
    return categoryMatches(category, cats.length ? cats : null);
  });

  if (applicableHv.length === 0) {
    return { rankedVendors: [], gapReason: 'no-vendor-for-category' };
  }

  // Reduce to one preference row per vendor — keep the row with the LOWEST
  // priority (lower = more preferred). Facility-scoped rows usually carry
  // a lower priority and so naturally win ties.
  const bestHvByVendor = new Map<string, typeof hospitalVendors.$inferSelect>();
  for (const hv of applicableHv) {
    const existing = bestHvByVendor.get(hv.vendorId);
    const incomingPriority = hv.priority ?? 100;
    const existingPriority = existing?.priority ?? 100;
    if (!existing || incomingPriority < existingPriority) {
      bestHvByVendor.set(hv.vendorId, hv);
    }
  }

  const cells: RankedVendorCell[] = [];

  for (const [vendorId, hv] of bestHvByVendor) {
    const parsedLocs = parsedLocsByVendor[vendorId] || [];
    const evaluated = parsedLocs.map((p) =>
      evaluateLocation(p, facilityState, facilityZip),
    );
    const serving = evaluated.filter((l) => l.servesFacility);

    const slaCandidates = serving
      .map((l) => l.maxDeliveryHours)
      .filter((h): h is number => typeof h === 'number');
    const bestSla = slaCandidates.length ? Math.min(...slaCandidates) : null;

    const capUnion = new Set<string>();
    for (const l of serving) for (const c of l.capabilities) capUnion.add(c);

    const skuCount = skuCountByVendor?.[vendorId] ?? 0;
    cells.push({
      vendorId,
      vendorName: vendorNameById[vendorId] ?? null,
      priority: hv.priority ?? 100,
      branchesTotal: evaluated.length,
      branchesServing: serving.length,
      bestSlaHours: bestSla,
      capabilityUnion: Array.from(capUnion),
      isFacilityScoped: hv.facilityId === facility.id,
      servingLocations: serving.map((l) => ({
        id: l.id,
        name: l.name,
        locationType: l.locationType,
        city: l.city,
        state: l.state,
        capabilities: l.capabilities,
        maxDeliveryHours: l.maxDeliveryHours,
        isPrimary: l.isPrimary,
      })),
      hasSkuMapping: skuCount > 0,
      skuCount,
    });
  }

  // Rank: priority asc, then prefer those with serving branches, then SLA.
  cells.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if ((b.branchesServing > 0 ? 1 : 0) !== (a.branchesServing > 0 ? 1 : 0)) {
      return (b.branchesServing > 0 ? 1 : 0) - (a.branchesServing > 0 ? 1 : 0);
    }
    const aSla = a.bestSlaHours ?? Infinity;
    const bSla = b.bestSlaHours ?? Infinity;
    return aSla - bSla;
  });

  // Filter to only vendors that actually serve this facility's state.
  const ranked = cells.filter((c) => c.branchesServing > 0);
  if (ranked.length === 0) {
    return { rankedVendors: [], gapReason: 'no-location-serves-state' };
  }
  return { rankedVendors: ranked };
}

/**
 * Resolve which hospitalId to use for this request.
 *  - VENDOR users              → 403
 *  - HOSPITAL / PROVIDER users → their own hospitalId from JWT (override ignored)
 *  - ADMIN users               → optional ?hospitalId= override; else 400
 */
function resolveHospitalId(c: any): string {
  const user = c.get('user');
  if (user.userType === 'VENDOR') {
    throw new ForbiddenError('Vendor users cannot access vendor coverage');
  }
  // Hospital users and provider-role users who carry a hospitalId
  if (user.hospitalId) {
    return user.hospitalId;
  }
  // ADMIN or other types without a hospitalId: require explicit param
  const overrideId = c.req.query('hospitalId');
  if (!overrideId) {
    throw new ValidationError('hospitalId query parameter required');
  }
  return overrideId;
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = resolveHospitalId(c);
  const facilityId = c.req.query('facilityId');
  const vendorId = c.req.query('vendorId');
  const activeOnly = c.req.query('activeOnly') !== '0'; // default on
  const byCategory =
    c.req.query('byCategory') === '1' || c.req.query('byCategory') === 'true';

  // 1. All hospital_vendors rows for this hospital
  const hvRows = await db
    .select()
    .from(hospitalVendors)
    .where(eq(hospitalVendors.hospitalId, hospitalId));

  if (hvRows.length === 0) {
    if (facilityId) return c.json([]);
    if (byCategory) {
      return c.json({
        facilities: [],
        vendors: [],
        cells: {},
        categories: ITEM_CATEGORIES,
        categoryCoverage: {},
      });
    }
    return c.json({ facilities: [], vendors: [], cells: {} });
  }

  // Distinct linked vendorIds (optionally filtered to one)
  let linkedVendorIds = Array.from(new Set(hvRows.map((r) => r.vendorId)));
  if (vendorId) {
    if (!linkedVendorIds.includes(vendorId)) {
      throw new ForbiddenError('Vendor is not linked to your hospital');
    }
    linkedVendorIds = [vendorId];
  }

  // 2. Vendors + locations
  const [vendorRows, locationRowsRaw] = await Promise.all([
    db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(inArray(vendors.id, linkedVendorIds)),
    db
      .select()
      .from(vendorLocations)
      .where(inArray(vendorLocations.vendorId, linkedVendorIds)),
  ]);

  const locationRows = activeOnly
    ? locationRowsRaw.filter((l) => l.isActive === 1)
    : locationRowsRaw;

  const vendorNameById: Record<string, string | null> = {};
  for (const v of vendorRows) vendorNameById[v.id] = v.name;

  // Pre-parse location JSON columns ONCE per location (reused across every
  // facility × category cell). Critical for matrix performance.
  const parsedLocsByVendor: Record<string, ParsedLocation[]> = {};
  for (const loc of locationRows) {
    (parsedLocsByVendor[loc.vendorId] ||= []).push(parseLocation(loc));
  }

  // Phase C: per-vendor active SKU count (only loaded when byCategory mode
  // is active; matrix view is the only consumer).
  let skuCountByVendor: Record<string, number> | undefined;
  if (byCategory && linkedVendorIds.length > 0) {
    const skuRows = await db
      .select({
        vendorId: vendorItemSkus.vendorId,
        count: sql<number>`count(*)`,
      })
      .from(vendorItemSkus)
      .where(
        and(
          inArray(vendorItemSkus.vendorId, linkedVendorIds),
          eq(vendorItemSkus.isActive, 1),
        ),
      )
      .groupBy(vendorItemSkus.vendorId);
    skuCountByVendor = {};
    for (const r of skuRows) {
      skuCountByVendor[r.vendorId] = Number(r.count);
    }
  }

  // Legacy helper for back-compat shape
  const locationsByVendor: Record<string, typeof locationRows> = {};
  for (const loc of locationRows) {
    (locationsByVendor[loc.vendorId] ||= []).push(loc);
  }

  // ---------- Mode A: facility-scoped ----------
  if (facilityId) {
    const facilityRows = await db
      .select()
      .from(hospitalFacilities)
      .where(eq(hospitalFacilities.id, facilityId))
      .limit(1);
    if (!facilityRows.length) throw new NotFoundError('Facility not found');
    const facility = facilityRows[0];
    if (facility.hospitalId !== hospitalId) {
      throw new ForbiddenError('Facility does not belong to your hospital');
    }
    const facilityState = (facility.state || '').toUpperCase() || null;
    const facilityZip = facility.zip || null;

    // Mode A.narrow (?vendorId=) is unchanged — back-compat for Step-2 pill
    if (vendorId) {
      const result: CoverageVendor[] = linkedVendorIds.map((vid) => {
        const parsedList = parsedLocsByVendor[vid] || [];
        const locs = parsedList.map((p) =>
          evaluateLocation(p, facilityState, facilityZip),
        );
        return {
          vendorId: vid,
          vendorName: vendorNameById[vid] ?? null,
          locations: locs,
          summary: buildSummary(locs),
        };
      });
      return c.json(result);
    }

    // Phase A: per-category breakdown for this one facility
    if (byCategory) {
      const categoryCoverage: Record<string, Record<string, CategoryCell>> = {};
      categoryCoverage[facility.id] = {};
      for (const category of ITEM_CATEGORIES) {
        categoryCoverage[facility.id][category] = buildCategoryCell({
          facility,
          category,
          hvRows,
          parsedLocsByVendor,
          vendorNameById,
          skuCountByVendor,
        });
      }
      return c.json({
        facility: {
          id: facility.id,
          name: facility.name,
          city: facility.city,
          state: facility.state,
          zip: facility.zip,
        },
        categories: ITEM_CATEGORIES,
        categoryCoverage,
      });
    }

    // Default facility-scoped shape (back-compat)
    const result: CoverageVendor[] = linkedVendorIds.map((vid) => {
      const parsedList = parsedLocsByVendor[vid] || [];
      const locs = parsedList.map((p) =>
        evaluateLocation(p, facilityState, facilityZip),
      );
      return {
        vendorId: vid,
        vendorName: vendorNameById[vid] ?? null,
        locations: locs,
        summary: buildSummary(locs),
      };
    });
    return c.json(result);
  }

  // ---------- Mode B: full hospital matrix ----------
  const facilityRows = await db
    .select()
    .from(hospitalFacilities)
    .where(eq(hospitalFacilities.hospitalId, hospitalId));

  // Always compute the legacy `cells` shape (back-compat).
  const cells: Record<string, Record<string, MatrixCellSummary>> = {};
  for (const f of facilityRows) {
    const fState = (f.state || '').toUpperCase() || null;
    const fZip = f.zip || null;
    cells[f.id] = {};
    for (const vid of linkedVendorIds) {
      const parsedList = parsedLocsByVendor[vid] || [];
      const locs = parsedList.map((p) => evaluateLocation(p, fState, fZip));
      cells[f.id][vid] = buildSummary(locs);
    }
  }

  const baseResponse = {
    facilities: facilityRows.map((f) => ({
      id: f.id,
      name: f.name,
      city: f.city,
      state: f.state,
      zip: f.zip,
    })),
    vendors: linkedVendorIds.map((vid) => ({
      id: vid,
      name: vendorNameById[vid] ?? null,
    })),
    cells,
  };

  if (!byCategory) return c.json(baseResponse);

  // Phase A: per-category coverage matrix
  const categoryCoverage: Record<string, Record<string, CategoryCell>> = {};
  for (const facility of facilityRows) {
    categoryCoverage[facility.id] = {};
    for (const category of ITEM_CATEGORIES) {
      categoryCoverage[facility.id][category] = buildCategoryCell({
        facility,
        category,
        hvRows,
        parsedLocsByVendor,
        vendorNameById,
        skuCountByVendor,
      });
    }
  }

  return c.json({
    ...baseResponse,
    categories: ITEM_CATEGORIES,
    categoryCoverage,
  });
});

export default app;

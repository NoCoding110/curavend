/**
 * Vendor routing engine.
 *
 * Given a hospital facility and a list of items to order, picks the best
 * `(vendor, vendor_location)` pair for each item based on geography,
 * capability, delivery SLA, and (Phase 2) stock availability.
 *
 * The pure scoring functions here are called by `routes/routing.ts`
 * (`POST /orders/route-suggestions`) and by `routes/orders.ts` when a
 * hospital creates an order without manually pinning a vendor.
 *
 * Phase 1 scope:
 *   - Hard filters: vendor must be in hospital_vendors for this hospital
 *     (with facility_id match or NULL); vendor_location must service the
 *     facility state; custom-fit items require CUSTOM_FIT capability +
 *     same-state; STAT priority requires STAT capability + <=8h SLA.
 *   - Ranking: priority asc, same-state > other, SLA asc.
 *
 * Phase 2 will add stock-aware routing (inventory_lots.vendor_location_id).
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { getDb } from './db';
import {
  hospitalVendors,
  hospitalFacilities,
  vendors,
  vendorLocations,
  inventoryItems,
  vendorItemSkus,
  vendorStockSnapshots,
} from '@curavend/db';

// ---------------------------------------------------------------------------
// HCPC → item-category mapping
// ---------------------------------------------------------------------------
// Mirrors the LOT inference in migration 0007 but widens it into named
// categories the routing engine (and hospital preferences) can reason about.

export type ItemCategory =
  | 'ORTHOTICS'
  | 'PROSTHETICS'
  | 'WOUND_CARE'
  | 'BIOLOGICS'
  | 'DME'
  | 'CONSUMABLES'
  | 'IMPLANTS'
  | 'GENERAL';

/** Canonical, ordered list of item categories — kept in sync with the type. */
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'WOUND_CARE',
  'ORTHOTICS',
  'PROSTHETICS',
  'BIOLOGICS',
  'DME',
  'IMPLANTS',
  'CONSUMABLES',
  'GENERAL',
] as const;

export function inferCategory(hcpcCode: string | null | undefined): ItemCategory {
  if (!hcpcCode) return 'GENERAL';
  const code = hcpcCode.toUpperCase();
  const p1 = code[0];
  if (p1 === 'L') return 'ORTHOTICS'; // L-codes cover orthotics & prosthetics
  if (p1 === 'K') return 'DME';
  if (code.startsWith('A42')) return 'WOUND_CARE';
  if (code.startsWith('Q4')) return 'BIOLOGICS';
  if (p1 === 'C') return 'IMPLANTS';
  if (p1 === 'A') return 'CONSUMABLES';
  if (p1 === 'E') return 'DME';
  return 'GENERAL';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutingItemInput {
  /** Stable key echoed back on the suggestion — frontend line id. */
  itemKey: string;
  hcpcCode?: string;
  inventoryItemId?: string;
  quantity: number;
  isCustomFit?: boolean;
  /** Matches orders.priority: routine | urgent | STAT | ASAP */
  priority?: string;
}

export interface PickedSku {
  vendorSku: string;
  unitsPerPack: number;
  packsPerCase: number;
  /** How many vendor packs to ship to fulfil the requested unit quantity. */
  packQuantity: number;
  /** Total units delivered (packQuantity * unitsPerPack). May exceed requested quantity. */
  unitsTotal: number;
  /** Requested HCPC unit quantity. */
  unitsRequested: number;
  description: string | null;
  unitOfMeasurement: string | null;
  listPriceCents: number | null;
}

export interface StockSignal {
  /** Total on-hand at this location for the picked SKU. */
  onHand: number;
  /** Available (on_hand minus reserved) when feed provides it; else null. */
  available: number | null;
  /** When the vendor's system reported the figure. */
  observedAt: string;
  /** When Curavend ingested it. */
  ingestedAt: string;
  /** Minutes since ingestion. */
  ageMinutes: number;
  /** True if older than the connector's threshold (configurable; default 60 min). */
  stale: boolean;
  /** True if onHand >= request packQuantity (or unitsRequested when no SKU mapping). */
  sufficient: boolean;
}

export interface RoutingLocationCandidate {
  vendorId: string;
  vendorName: string | null;
  locationId: string;
  locationName: string;
  locationState: string | null;
  locationType: string;
  maxDeliveryHours: number | null;
  capabilities: string[];
  serviceStates: string[];
  score: number;
  priority: number;
  reasons: string[];
  /** Phase C — populated when the item has a HCPC and the vendor carries a SKU. */
  pickedSku?: PickedSku | null;
  /** Phase D — populated when stock snapshot exists for this (vendor, location, SKU). */
  stock?: StockSignal | null;
}

export interface NoSkuVendorRef {
  vendorId: string;
  vendorName: string | null;
  reason: 'no-sku-mapping';
}

export interface RoutingSuggestion {
  itemKey: string;
  category: ItemCategory;
  recommended: RoutingLocationCandidate | null;
  alternatives: RoutingLocationCandidate[];
  errors: string[];
  /** Phase C — vendors that match category & geography but lack an active SKU mapping. */
  noSkuVendors?: NoSkuVendorRef[];
}

export interface RoutingResult {
  facilityId: string;
  facilityState: string | null;
  suggestions: RoutingSuggestion[];
  splitRequired: boolean;
  /** Grouped by vendorId for UI preview. */
  groupedByVendor: Record<string, string[]>; // vendorId → itemKey[]
  /** Items that could not be routed at all. */
  unroutable: string[]; // itemKey[]
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function parseJsonArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    /* not JSON, fall through */
  }
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stateMatches(
  facilityState: string | null,
  serviceStates: string[],
  zip: string | null,
  zipPrefixes: string[],
): boolean {
  if (!facilityState) return true; // facility has no state → don't filter
  if (serviceStates.includes(facilityState.toUpperCase())) return true;
  if (zip && zipPrefixes.length > 0) {
    const prefix = zip.substring(0, 3);
    if (zipPrefixes.includes(prefix)) return true;
  }
  return false;
}

export function categoryMatches(
  itemCategory: ItemCategory,
  rowCategories: string[] | null,
): boolean {
  if (!rowCategories || rowCategories.length === 0) return true; // NULL = all
  return rowCategories.includes(itemCategory);
}

/**
 * Pure helper exported for the coverage endpoint. Mirrors the inner
 * `stateMatches` logic so callers don't re-implement state/zip matching.
 */
export function locationServesFacility(
  facilityState: string | null,
  facilityZip: string | null,
  serviceStatesUpper: string[],
  servicePrefixes: string[],
): boolean {
  if (!facilityState) return true;
  if (serviceStatesUpper.includes(facilityState.toUpperCase())) return true;
  if (facilityZip && servicePrefixes.length > 0) {
    const prefix = facilityZip.substring(0, 3);
    if (servicePrefixes.includes(prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

/**
 * Resolve routing for a list of items at a given hospital facility.
 *
 * The function is "best effort" — it returns suggestions and a flag for
 * which items are unroutable, rather than throwing. The API layer decides
 * whether to hard-stop (Phase 1) or soft-warn (future decision-point).
 */
export async function routeOrderItems(
  db: ReturnType<typeof getDb>,
  opts: {
    hospitalId: string;
    facilityId: string;
    items: RoutingItemInput[];
    /** Max alternatives to surface per item. Default 3, clamped 1..5. */
    topN?: number;
  },
): Promise<RoutingResult> {
  const { hospitalId, facilityId, items } = opts;
  const topN = Math.max(1, Math.min(5, opts.topN ?? 3));

  // 1. Resolve facility state/zip
  const facilityRows = await db
    .select()
    .from(hospitalFacilities)
    .where(eq(hospitalFacilities.id, facilityId))
    .limit(1);
  if (!facilityRows.length) {
    throw new Error(`Facility ${facilityId} not found`);
  }
  const facility = facilityRows[0];
  const facilityState = (facility.state || '').toUpperCase() || null;

  // 2. Pull all hospital-vendor relationships for the hospital scoped to
  //    this facility OR hospital-wide (NULL).
  const hvRows = await db
    .select()
    .from(hospitalVendors)
    .where(eq(hospitalVendors.hospitalId, hospitalId));

  const scopedHv = hvRows.filter(
    (row) => row.facilityId == null || row.facilityId === facilityId,
  );

  if (scopedHv.length === 0) {
    return emptyResult(facilityId, facilityState, items);
  }

  const vendorIds = Array.from(new Set(scopedHv.map((r) => r.vendorId)));

  // 3. Pull vendor names + vendor_locations for those vendors
  const [vendorRows, locationRows] = await Promise.all([
    db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds)),
    db
      .select()
      .from(vendorLocations)
      .where(
        and(
          inArray(vendorLocations.vendorId, vendorIds),
          eq(vendorLocations.isActive, 1),
        ),
      ),
  ]);

  const vendorNameById: Record<string, string | null> = {};
  for (const v of vendorRows) vendorNameById[v.id] = v.name;

  // Bucket locations by vendor
  const locationsByVendor: Record<string, typeof locationRows> = {};
  for (const loc of locationRows) {
    (locationsByVendor[loc.vendorId] ||= []).push(loc);
  }

  // 4. If any item references an inventoryItem, batch-resolve its HCPC/custom-fit
  const inventoryItemIds = items
    .map((i) => i.inventoryItemId)
    .filter((x): x is string => !!x);
  const invItemMap: Record<
    string,
    { hcpcCode: string; isCustomFit: number | null }
  > = {};
  if (inventoryItemIds.length > 0) {
    const invRows = await db
      .select({
        id: inventoryItems.id,
        hcpcCode: inventoryItems.hcpcCode,
        isCustomFit: inventoryItems.isCustomFit,
      })
      .from(inventoryItems)
      .where(inArray(inventoryItems.id, inventoryItemIds));
    for (const r of invRows) {
      invItemMap[r.id] = {
        hcpcCode: r.hcpcCode,
        isCustomFit: r.isCustomFit ?? 0,
      };
    }
  }

  // 4b. Phase C — pull the vendor SKU catalog for any HCPC code in this batch.
  // Indexed lookup; returns rows keyed by (vendorId, hcpcCode).
  const itemHcpcCodes = items
    .map((it) => {
      const ref = it.inventoryItemId ? invItemMap[it.inventoryItemId] : null;
      return (it.hcpcCode ?? ref?.hcpcCode ?? '').toUpperCase();
    })
    .filter(Boolean);
  const skuByVendorHcpc: Record<
    string,
    typeof vendorItemSkus.$inferSelect
  > = {};
  if (vendorIds.length > 0 && itemHcpcCodes.length > 0) {
    const skuRows = await db
      .select()
      .from(vendorItemSkus)
      .where(
        and(
          inArray(vendorItemSkus.vendorId, vendorIds),
          inArray(vendorItemSkus.hcpcCode, itemHcpcCodes),
          eq(vendorItemSkus.isActive, 1),
        ),
      );
    // For each (vendor, hcpc), keep the SKU with the lowest list_price_cents
    // (NULL price treated as +Infinity), tie-broken by most-recent updatedAt.
    for (const sku of skuRows) {
      const key = `${sku.vendorId}|${sku.hcpcCode}`;
      const existing = skuByVendorHcpc[key];
      if (!existing) {
        skuByVendorHcpc[key] = sku;
        continue;
      }
      const existPrice = existing.listPriceCents ?? Number.POSITIVE_INFINITY;
      const newPrice = sku.listPriceCents ?? Number.POSITIVE_INFINITY;
      if (newPrice < existPrice) {
        skuByVendorHcpc[key] = sku;
      } else if (
        newPrice === existPrice &&
        (sku.updatedAt ?? '') > (existing.updatedAt ?? '')
      ) {
        skuByVendorHcpc[key] = sku;
      }
    }
  }

  // 4c. Phase D — load stock snapshots for the (vendor, vendor_sku) tuples we
  // expect to consult. Index lookup → cheap even at high cardinality.
  const skuTuples = Object.values(skuByVendorHcpc).map((s) => ({
    vendorId: s.vendorId,
    vendorSku: s.vendorSku,
  }));
  // Map: `${vendorId}|${locationId}|${vendorSku}` → snapshot row
  const snapshotsByVendorLocSku: Record<
    string,
    typeof vendorStockSnapshots.$inferSelect
  > = {};
  if (skuTuples.length > 0) {
    const distinctVendorIds = Array.from(new Set(skuTuples.map((t) => t.vendorId)));
    const distinctSkus = Array.from(new Set(skuTuples.map((t) => t.vendorSku)));
    const snapRows = await db
      .select()
      .from(vendorStockSnapshots)
      .where(
        and(
          inArray(vendorStockSnapshots.vendorId, distinctVendorIds),
          inArray(vendorStockSnapshots.vendorSku, distinctSkus),
        ),
      );
    for (const s of snapRows) {
      const key = `${s.vendorId}|${s.vendorLocationId}|${s.vendorSku}`;
      snapshotsByVendorLocSku[key] = s;
    }
  }

  /** Stale threshold (minutes). Currently a fixed 60min; can be made
   * per-connector later. */
  const STOCK_STALE_MIN = 60;

  function buildStockSignal(
    snap: typeof vendorStockSnapshots.$inferSelect | undefined,
    requiredQty: number,
  ): StockSignal | null {
    if (!snap) return null;
    const ingestedMs = Date.parse(snap.ingestedAt);
    const ageMin = Number.isFinite(ingestedMs)
      ? Math.max(0, Math.floor((Date.now() - ingestedMs) / 60000))
      : 0;
    const onHand = snap.quantityOnHand;
    const avail = snap.availableQuantity ?? snap.quantityOnHand;
    return {
      onHand,
      available: snap.availableQuantity,
      observedAt: snap.observedAt,
      ingestedAt: snap.ingestedAt,
      ageMinutes: ageMin,
      stale: ageMin > STOCK_STALE_MIN,
      sufficient: avail >= requiredQty,
    };
  }

  // 5. Per-item scoring
  const suggestions: RoutingSuggestion[] = [];
  const unroutable: string[] = [];
  const groupedByVendor: Record<string, string[]> = {};

  for (const item of items) {
    const invRef = item.inventoryItemId ? invItemMap[item.inventoryItemId] : null;
    const hcpcCode = item.hcpcCode ?? invRef?.hcpcCode;
    const category = inferCategory(hcpcCode);
    const isCustomFit =
      item.isCustomFit ?? (invRef ? invRef.isCustomFit === 1 : false);
    const priorityUpper = String(item.priority || '').toUpperCase();
    const isStat = priorityUpper === 'STAT' || priorityUpper === 'ASAP';

    const candidates: RoutingLocationCandidate[] = [];
    const errors: string[] = [];
    // Vendors that pass category + geography but lack an SKU mapping for this HCPC.
    const noSkuVendorsByVendorId: Record<string, NoSkuVendorRef> = {};

    // Walk scoped hospital-vendors, sorted by priority asc (lower = better).
    const sortedHv = [...scopedHv].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    for (const hv of sortedHv) {
      const hvCategories = parseJsonArray(hv.itemCategories);
      if (!categoryMatches(category, hvCategories.length ? hvCategories : null)) {
        continue;
      }
      // Prefer facility-specific rows over hospital-wide when both exist
      // for the same vendor. Handled by priority column and the order we
      // iterate — facility rows typically have lower `priority`.

      // Phase C: if the item carries an HCPC code AND we have any SKU rows
      // loaded for this vendor at all, require a SKU match for THIS HCPC.
      // Vendors with zero SKUs in our catalog are treated as legacy / not yet
      // onboarded and pass through (back-compat).
      let pickedSku: PickedSku | null = null;
      const vendorHasAnySku = Object.keys(skuByVendorHcpc).some((k) =>
        k.startsWith(`${hv.vendorId}|`),
      );
      if (hcpcCode) {
        const skuKey = `${hv.vendorId}|${hcpcCode.toUpperCase()}`;
        const sku = skuByVendorHcpc[skuKey];
        if (sku) {
          const unitsPerPack = Math.max(1, sku.unitsPerPack);
          const reqUnits = Math.max(1, item.quantity);
          const packQty = Math.ceil(reqUnits / unitsPerPack);
          pickedSku = {
            vendorSku: sku.vendorSku,
            unitsPerPack,
            packsPerCase: Math.max(1, sku.packsPerCase),
            packQuantity: packQty,
            unitsTotal: packQty * unitsPerPack,
            unitsRequested: reqUnits,
            description: sku.description,
            unitOfMeasurement: sku.unitOfMeasurement,
            listPriceCents: sku.listPriceCents,
          };
        } else if (vendorHasAnySku) {
          // Vendor has a catalog but doesn't carry this HCPC → demote to noSkuVendors
          noSkuVendorsByVendorId[hv.vendorId] = {
            vendorId: hv.vendorId,
            vendorName: vendorNameById[hv.vendorId] ?? null,
            reason: 'no-sku-mapping',
          };
          continue;
        }
        // else: no catalog at all for this vendor → legacy passthrough
      }

      const vendorLocs = locationsByVendor[hv.vendorId] || [];
      for (const loc of vendorLocs) {
        const capabilities = parseJsonArray(loc.capabilities);
        const serviceStates = parseJsonArray(loc.serviceStates).map((s) =>
          s.toUpperCase(),
        );
        const servicePrefixes = parseJsonArray(loc.serviceZipPrefixes);
        const reasons: string[] = [];

        const servesState = stateMatches(
          facilityState,
          serviceStates,
          facility.zip || null,
          servicePrefixes,
        );
        if (!servesState) {
          continue;
        }
        reasons.push(`Services ${facilityState || 'facility'}`);

        const sameState =
          !!facilityState && loc.state?.toUpperCase() === facilityState;

        if (isCustomFit) {
          if (!capabilities.includes('CUSTOM_FIT')) {
            continue;
          }
          if (!sameState) {
            // Custom-fit requires same-state (fitter must visit patient).
            continue;
          }
          reasons.push('Supports custom-fit');
        }
        if (isStat) {
          if (!capabilities.includes('STAT')) continue;
          const sla = loc.maxDeliveryHours ?? Infinity;
          if (sla > 8) continue;
          reasons.push(`STAT (<=${loc.maxDeliveryHours}h)`);
        }

        // Scoring: start high and deduct for less-preferred attributes.
        // Lower score = better rank.
        let score = (hv.priority ?? 100) * 10;
        if (!sameState) score += 50;
        score += Math.min(loc.maxDeliveryHours ?? 72, 72);
        if (loc.isPrimary) score -= 5;

        // Phase D: stock signal — demote insufficient-stock branches by +200,
        // demote stale snapshots by +25 (still rankable, UI flags them).
        let stockSignal: StockSignal | null = null;
        if (pickedSku) {
          const snapKey = `${hv.vendorId}|${loc.id}|${pickedSku.vendorSku}`;
          stockSignal = buildStockSignal(
            snapshotsByVendorLocSku[snapKey],
            pickedSku.packQuantity,
          );
          if (stockSignal) {
            if (!stockSignal.sufficient) {
              score += 200;
              reasons.push(
                `Low stock at this branch (${stockSignal.onHand} on hand, need ${pickedSku.packQuantity})`,
              );
            } else {
              reasons.push(`In stock: ${stockSignal.onHand}`);
            }
            if (stockSignal.stale) {
              score += 25;
              reasons.push(`Stock data is ${stockSignal.ageMinutes} min old`);
            }
          }
        }

        candidates.push({
          vendorId: hv.vendorId,
          vendorName: vendorNameById[hv.vendorId] ?? null,
          locationId: loc.id,
          locationName: loc.name,
          locationState: loc.state || null,
          locationType: loc.locationType,
          maxDeliveryHours: loc.maxDeliveryHours ?? null,
          capabilities,
          serviceStates,
          score,
          priority: hv.priority ?? 100,
          reasons: pickedSku
            ? [...reasons, `SKU ${pickedSku.vendorSku} (${pickedSku.packQuantity} × ${pickedSku.unitsPerPack} = ${pickedSku.unitsTotal} units)`]
            : reasons,
          pickedSku,
          stock: stockSignal,
        });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    const recommended = candidates[0] ?? null;
    // topN includes the recommended; alternatives is everything after.
    const alternatives = candidates.slice(1, topN);

    if (!recommended) {
      if (scopedHv.length === 0) {
        errors.push(`No preferred vendor configured for this facility`);
      } else if (isCustomFit) {
        errors.push(
          `No vendor location in ${facilityState ?? 'facility state'} supports custom-fit`,
        );
      } else if (isStat) {
        errors.push(
          `No vendor with STAT SLA (≤8h) in ${facilityState ?? 'facility state'}`,
        );
      } else {
        // Give a precise reason: did the vendor(s) exist but fail on geography,
        // or did they fail because none covers this item category?
        const hvMatchingCategory = sortedHv.filter((hv) => {
          const hvCats = parseJsonArray(hv.itemCategories);
          return categoryMatches(category, hvCats.length ? hvCats : null);
        });
        if (hvMatchingCategory.length === 0) {
          errors.push(
            `None of your preferred vendors cover category "${category.replace('_', ' ')}" — add a vendor for this category`,
          );
        } else {
          errors.push(
            `No preferred vendor has a location that serves ${facilityState ?? 'this facility'} for category "${category.replace('_', ' ')}"`,
          );
        }
      }
      unroutable.push(item.itemKey);
    } else {
      (groupedByVendor[recommended.vendorId] ||= []).push(item.itemKey);
    }

    const noSkuVendors = Object.values(noSkuVendorsByVendorId);
    suggestions.push({
      itemKey: item.itemKey,
      category,
      recommended,
      alternatives,
      errors,
      noSkuVendors: noSkuVendors.length > 0 ? noSkuVendors : undefined,
    });
  }

  const uniqueVendors = Object.keys(groupedByVendor);
  const splitRequired = uniqueVendors.length > 1;

  return {
    facilityId,
    facilityState,
    suggestions,
    splitRequired,
    groupedByVendor,
    unroutable,
  };
}

function emptyResult(
  facilityId: string,
  facilityState: string | null,
  items: RoutingItemInput[],
): RoutingResult {
  const unroutable = items.map((i) => i.itemKey);
  return {
    facilityId,
    facilityState,
    suggestions: items.map((i) => ({
      itemKey: i.itemKey,
      category: inferCategory(i.hcpcCode),
      recommended: null,
      alternatives: [],
      errors: ['No preferred vendor configured for this hospital/facility'],
    })),
    splitRequired: false,
    groupedByVendor: {},
    unroutable,
  };
}

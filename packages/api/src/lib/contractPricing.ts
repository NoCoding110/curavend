/**
 * Contract-aware price lookup.
 *
 * Orders price line-items in priority order:
 *   1. CONTRACT      — active contract between hospital+vendor with item match
 *   2. GPO_CONTRACT  — group purchasing organization rate honored if hospital is a member (Vizient/Premier/HealthTrust)
 *   3. FEE_SCHEDULE  — customFeeSchedule attached to hospital_vendors
 *   4. MEDICARE      — medicare_fee_schedule_items by HCPC code
 *   5. MANUAL        — vendor fills at invoice time
 *
 * This module covers steps 1 and 2. The caller handles fallback.
 */
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { contracts, contractItems, gpoContractItems, hospitals } from '@curavend/db';
import { getDb } from './db';
import type { D1Database } from '@cloudflare/workers-types';

export interface ContractPriceMatch {
  rate: number;
  contractId: string;
  hcpcCode: string;
  source: 'CONTRACT';
}

export interface GpoPriceMatch {
  rate: number;
  gpoOrganizationId: string;
  gpoContractItemId: string;
  hcpcCode: string;
  source: 'GPO_CONTRACT';
}

/**
 * Look up the negotiated rate for a single HCPC code between a hospital
 * and a vendor. Returns null if there's no ACTIVE contract covering the code,
 * or if today is outside the contract's startDate–endDate window.
 *
 * When multiple active contracts match (rare — should be at most one per
 * (hospital, vendor, hcpc)), the one with the LATEST startDate wins
 * (most-recently negotiated rate).
 */
export async function getContractRate(
  d1: D1Database,
  hospitalId: string | null | undefined,
  vendorId: string | null | undefined,
  hcpcCode: string,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<ContractPriceMatch | null> {
  if (!hospitalId || !vendorId || !hcpcCode) return null;
  const db = getDb(d1);

  // Join contracts -> contract_items, filter to ACTIVE, within window, matching code.
  const rows = await db
    .select({
      contractId: contracts.id,
      startDate: contracts.startDate,
      hcpcCode: contractItems.hcpcCode,
      rate: contractItems.negotiatedRate,
    })
    .from(contractItems)
    .innerJoin(contracts, eq(contractItems.contractId, contracts.id))
    .where(
      and(
        eq(contracts.hospitalId, hospitalId),
        eq(contracts.vendorId, vendorId),
        eq(contracts.status, 'ACTIVE'),
        eq(contractItems.hcpcCode, hcpcCode),
        sql`date(${contracts.startDate}) <= date(${asOf})`,
        sql`date(${contracts.endDate}) >= date(${asOf})`,
      ),
    )
    .orderBy(sql`${contracts.startDate} desc`)
    .limit(1);

  if (!rows.length) return null;
  return {
    rate: rows[0].rate,
    contractId: rows[0].contractId,
    hcpcCode: rows[0].hcpcCode,
    source: 'CONTRACT',
  };
}

/**
 * Bulk variant — fetches all matching contract rates for a list of HCPC codes
 * with a single query. Returns a Map keyed by hcpcCode → match. Codes not
 * found are simply absent from the map (caller handles fallback).
 *
 * This avoids the N+1 pattern when pricing an entire order at create-time.
 */
export async function getContractRatesBulk(
  d1: D1Database,
  hospitalId: string | null | undefined,
  vendorId: string | null | undefined,
  hcpcCodes: string[],
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, ContractPriceMatch>> {
  const result = new Map<string, ContractPriceMatch>();
  if (!hospitalId || !vendorId || !hcpcCodes.length) return result;

  const db = getDb(d1);
  const rows = await db
    .select({
      contractId: contracts.id,
      startDate: contracts.startDate,
      hcpcCode: contractItems.hcpcCode,
      rate: contractItems.negotiatedRate,
    })
    .from(contractItems)
    .innerJoin(contracts, eq(contractItems.contractId, contracts.id))
    .where(
      and(
        eq(contracts.hospitalId, hospitalId),
        eq(contracts.vendorId, vendorId),
        eq(contracts.status, 'ACTIVE'),
        inArray(contractItems.hcpcCode, hcpcCodes),
        sql`date(${contracts.startDate}) <= date(${asOf})`,
        sql`date(${contracts.endDate}) >= date(${asOf})`,
      ),
    )
    .orderBy(sql`${contracts.startDate} desc`);

  // First-row-wins per HCPC (rows already sorted by startDate desc)
  for (const r of rows) {
    if (!result.has(r.hcpcCode)) {
      result.set(r.hcpcCode, {
        rate: r.rate,
        contractId: r.contractId,
        hcpcCode: r.hcpcCode,
        source: 'CONTRACT',
      });
    }
  }
  return result;
}

/**
 * Look up the hospital's GPO membership and return the GPO contract rate
 * for `hcpcCode` if one is active. Honors GPO contracts in the strict order:
 *   1. vendor-specific row matching this order's vendor
 *   2. vendor-agnostic row (vendorId IS NULL) — applies to any vendor
 * Returns null if the hospital is not a GPO member or no row matches.
 */
export async function getGpoRate(
  d1: D1Database,
  hospitalId: string | null | undefined,
  vendorId: string | null | undefined,
  hcpcCode: string,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<GpoPriceMatch | null> {
  if (!hospitalId || !hcpcCode) return null;
  const db = getDb(d1);

  const [hospital] = await db
    .select({ gpoOrganizationId: hospitals.gpoOrganizationId })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);
  if (!hospital?.gpoOrganizationId) return null;

  // Find active GPO contract items for this HCPC, prefer vendor-specific match.
  const rows = await db
    .select()
    .from(gpoContractItems)
    .where(
      and(
        eq(gpoContractItems.gpoOrganizationId, hospital.gpoOrganizationId),
        eq(gpoContractItems.hcpcCode, hcpcCode),
        eq(gpoContractItems.isActive, 1),
        sql`date(${gpoContractItems.effectiveStartDate}) <= date(${asOf})`,
        sql`(${gpoContractItems.effectiveEndDate} IS NULL OR date(${gpoContractItems.effectiveEndDate}) >= date(${asOf}))`,
        vendorId
          ? or(eq(gpoContractItems.vendorId, vendorId), isNull(gpoContractItems.vendorId))
          : isNull(gpoContractItems.vendorId),
      ),
    );

  if (!rows.length) return null;
  // Prefer vendor-specific match if multiple rows came back.
  const winner = vendorId
    ? rows.find((r) => r.vendorId === vendorId) ?? rows[0]
    : rows[0];
  return {
    rate: winner.rateUsd,
    gpoOrganizationId: winner.gpoOrganizationId,
    gpoContractItemId: winner.id,
    hcpcCode: winner.hcpcCode,
    source: 'GPO_CONTRACT',
  };
}

/**
 * Bulk variant — fetch GPO rates for many HCPC codes at once.
 */
export async function getGpoRatesBulk(
  d1: D1Database,
  hospitalId: string | null | undefined,
  vendorId: string | null | undefined,
  hcpcCodes: string[],
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, GpoPriceMatch>> {
  const result = new Map<string, GpoPriceMatch>();
  if (!hospitalId || !hcpcCodes.length) return result;
  const db = getDb(d1);

  const [hospital] = await db
    .select({ gpoOrganizationId: hospitals.gpoOrganizationId })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);
  if (!hospital?.gpoOrganizationId) return result;

  const rows = await db
    .select()
    .from(gpoContractItems)
    .where(
      and(
        eq(gpoContractItems.gpoOrganizationId, hospital.gpoOrganizationId),
        inArray(gpoContractItems.hcpcCode, hcpcCodes),
        eq(gpoContractItems.isActive, 1),
        sql`date(${gpoContractItems.effectiveStartDate}) <= date(${asOf})`,
        sql`(${gpoContractItems.effectiveEndDate} IS NULL OR date(${gpoContractItems.effectiveEndDate}) >= date(${asOf}))`,
        vendorId
          ? or(eq(gpoContractItems.vendorId, vendorId), isNull(gpoContractItems.vendorId))
          : isNull(gpoContractItems.vendorId),
      ),
    );

  // First pick vendor-specific, then fall back to vendor-agnostic.
  for (const r of rows) {
    if (vendorId && r.vendorId === vendorId) {
      result.set(r.hcpcCode, {
        rate: r.rateUsd,
        gpoOrganizationId: r.gpoOrganizationId,
        gpoContractItemId: r.id,
        hcpcCode: r.hcpcCode,
        source: 'GPO_CONTRACT',
      });
    }
  }
  for (const r of rows) {
    if (result.has(r.hcpcCode)) continue;
    if (!r.vendorId) {
      result.set(r.hcpcCode, {
        rate: r.rateUsd,
        gpoOrganizationId: r.gpoOrganizationId,
        gpoContractItemId: r.id,
        hcpcCode: r.hcpcCode,
        source: 'GPO_CONTRACT',
      });
    }
  }
  return result;
}

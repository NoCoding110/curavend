/**
 * Contract-aware price lookup.
 *
 * Orders price line-items in priority order:
 *   1. CONTRACT      — active contract between hospital+vendor with item match
 *   2. FEE_SCHEDULE  — customFeeSchedule attached to hospital_vendors
 *   3. MEDICARE      — medicare_fee_schedule_items by HCPC code
 *   4. MANUAL        — vendor fills at invoice time
 *
 * This module covers step 1. The caller handles fallback.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { contracts, contractItems } from '@curavend/db';
import { getDb } from './db';
import type { D1Database } from '@cloudflare/workers-types';

export interface ContractPriceMatch {
  rate: number;
  contractId: string;
  hcpcCode: string;
  source: 'CONTRACT';
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

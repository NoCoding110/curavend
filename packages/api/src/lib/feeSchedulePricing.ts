/**
 * Fee-schedule and Medicare bulk price helpers.
 *
 * Covers tiers 3 (FEE_SCHEDULE) and 4 (MEDICARE) of the pricing cascade.
 * Tiers 1 (CONTRACT) and 2 (GPO_CONTRACT) are in contractPricing.ts.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { customFeeSchedules, customFeeScheduleItems } from '@curavend/db';
import { getDb } from './db';
import type { D1Database } from '@cloudflare/workers-types';

export interface FeeSchedulePriceMatch {
  rate: number;
  feeScheduleId: string;
  hcpcCode: string;
  source: 'FEE_SCHEDULE';
}

/**
 * Bulk fee-schedule lookup.
 * When feeScheduleId is provided, match that specific schedule's items.
 * Otherwise walk all of the vendor's active schedules (startDate <= asOf <= endDate),
 * most-recently-started first (first-row-wins per HCPC).
 *
 * NOTE: Unlike spendCalculator.ts, this properly enforces startDate <= asOf
 * (i.e. we don't return rates from future-dated schedules).
 */
export async function getFeeScheduleRatesBulk(
  d1: D1Database,
  vendorId: string | null | undefined,
  hcpcCodes: string[],
  feeScheduleId?: string | null,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, FeeSchedulePriceMatch>> {
  const result = new Map<string, FeeSchedulePriceMatch>();
  if ((!vendorId && !feeScheduleId) || !hcpcCodes.length) return result;
  const db = getDb(d1);

  let rows: Array<{ hcpcCode: string; rate: number | null; feeScheduleId: string }>;

  if (feeScheduleId) {
    rows = await db
      .select({
        hcpcCode: customFeeScheduleItems.hcpcCode,
        rate: customFeeScheduleItems.rate,
        feeScheduleId: customFeeScheduleItems.feeScheduleId,
      })
      .from(customFeeScheduleItems)
      .where(
        and(
          eq(customFeeScheduleItems.feeScheduleId, feeScheduleId),
          inArray(customFeeScheduleItems.hcpcCode, hcpcCodes),
        ),
      );
  } else {
    const joined = await db
      .select({
        hcpcCode: customFeeScheduleItems.hcpcCode,
        rate: customFeeScheduleItems.rate,
        feeScheduleId: customFeeScheduleItems.feeScheduleId,
        startDate: customFeeSchedules.startDate,
      })
      .from(customFeeScheduleItems)
      .innerJoin(customFeeSchedules, eq(customFeeScheduleItems.feeScheduleId, customFeeSchedules.id))
      .where(
        and(
          eq(customFeeSchedules.vendorId, vendorId!),
          inArray(customFeeScheduleItems.hcpcCode, hcpcCodes),
          sql`date(${customFeeSchedules.startDate}) <= date(${asOf})`,
          sql`date(${customFeeSchedules.endDate}) >= date(${asOf})`,
        ),
      )
      .orderBy(sql`${customFeeSchedules.startDate} desc`);
    rows = joined;
  }

  for (const r of rows) {
    if (r.rate != null && !result.has(r.hcpcCode)) {
      result.set(r.hcpcCode, {
        rate: r.rate,
        feeScheduleId: r.feeScheduleId,
        hcpcCode: r.hcpcCode,
        source: 'FEE_SCHEDULE',
      });
    }
  }
  return result;
}

/**
 * Bulk Medicare rate lookup — single IN query replaces the N per-item LIMIT 1 pattern.
 *
 * NOTE: The Drizzle schema for medicareFeeScheduleItems does not expose
 * non_rural_rate (legacy column added via raw SQL migration). We query via
 * db.run() with a parameterised sql template.
 */
export async function getMedicareRatesBulk(
  d1: D1Database,
  hcpcCodes: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!hcpcCodes.length) return result;
  const db = getDb(d1);

  const inList = sql.join(hcpcCodes.map((c) => sql`${c}`), sql`, `);
  const raw: any = await db.run(
    sql`SELECT hcpc_code, non_rural_rate FROM medicare_fee_schedule_items WHERE hcpc_code IN (${inList}) AND non_rural_rate IS NOT NULL`,
  );

  const rows: any[] = raw?.results ?? (Array.isArray(raw) ? raw : []);
  for (const row of rows) {
    if (row.hcpc_code && typeof row.non_rural_rate === 'number' && !result.has(row.hcpc_code)) {
      result.set(row.hcpc_code, row.non_rural_rate);
    }
  }
  return result;
}

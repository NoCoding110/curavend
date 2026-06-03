/**
 * Single source of truth for order-line pricing.
 *
 * Priority chain (first hit wins):
 *   1. CONTRACT       — active contract between hospital + vendor
 *   2. GPO_CONTRACT   — group purchasing org rate for the hospital
 *   3. FEE_SCHEDULE   — custom fee schedule on hospital_vendors row
 *   4. MEDICARE       — CMS non-rural rate
 *   5. MANUAL         — no automated price; vendor fills at invoice
 *
 * Always populates `medicareFee` for reference even when a higher tier wins.
 *
 * Usage:
 *   const priceMap = await resolvePricesBulk(d1, {
 *     hospitalId, vendorId, codes, feeScheduleId, asOf
 *   });
 *   const { unitPrice, medicareFee, priceSource, contractId } = priceMap.get(hcpc)!;
 */
import type { D1Database } from '@cloudflare/workers-types';
import { getContractRatesBulk, getGpoRatesBulk } from './contractPricing';
import { getFeeScheduleRatesBulk, getMedicareRatesBulk } from './feeSchedulePricing';

/**
 * Pricing tier that resolved a code.
 * Note: 'LIST' is reserved for a future catalog-price integration and is
 * intentionally NOT emitted by resolvePricesBulk. Do not add UI handlers
 * for it until that tier is implemented.
 */
export type PriceSource = 'CONTRACT' | 'GPO_CONTRACT' | 'FEE_SCHEDULE' | 'MEDICARE' | 'MANUAL';

export interface ResolvedPrice {
  hcpcCode: string;
  unitPrice: number | null;
  medicareFee: number | null;
  priceSource: PriceSource;
  contractId: string | null;
}

export interface ResolvePricesInput {
  hospitalId?: string | null;
  vendorId?: string | null;
  codes: string[];
  feeScheduleId?: string | null;
  asOf?: string;
}

export async function resolvePricesBulk(
  d1: D1Database,
  { hospitalId, vendorId, codes, feeScheduleId, asOf }: ResolvePricesInput,
): Promise<Map<string, ResolvedPrice>> {
  const result = new Map<string, ResolvedPrice>();
  if (!codes.length) return result;

  const asOfDate = asOf ?? new Date().toISOString().slice(0, 10);

  // Tier 1: CONTRACT
  const contractRates = await getContractRatesBulk(d1, hospitalId, vendorId, codes, asOfDate);

  // Tier 2: GPO_CONTRACT — only for codes not yet resolved
  const need2 = codes.filter((c) => !contractRates.has(c));
  const gpoRates = need2.length
    ? await getGpoRatesBulk(d1, hospitalId, vendorId, need2, asOfDate)
    : new Map<string, any>();

  // Tier 3: FEE_SCHEDULE — only for codes still unresolved
  const need3 = need2.filter((c) => !gpoRates.has(c));
  const feeRates = need3.length && (vendorId || feeScheduleId)
    ? await getFeeScheduleRatesBulk(d1, vendorId, need3, feeScheduleId, asOfDate)
    : new Map<string, any>();

  // Tier 4: MEDICARE — bulk lookup for ALL codes (used for fallback + always-denorm medicareFee)
  const medicareRates = await getMedicareRatesBulk(d1, codes);

  // Assemble
  for (const code of codes) {
    const medicare = medicareRates.get(code) ?? null;
    const contract = contractRates.get(code);
    const gpo = gpoRates.get(code);
    const fee = feeRates.get(code);

    if (contract) {
      result.set(code, { hcpcCode: code, unitPrice: contract.rate, medicareFee: medicare, priceSource: 'CONTRACT', contractId: contract.contractId });
    } else if (gpo) {
      result.set(code, { hcpcCode: code, unitPrice: gpo.rate, medicareFee: medicare, priceSource: 'GPO_CONTRACT', contractId: null });
    } else if (fee) {
      result.set(code, { hcpcCode: code, unitPrice: fee.rate, medicareFee: medicare, priceSource: 'FEE_SCHEDULE', contractId: null });
    } else if (medicare != null) {
      result.set(code, { hcpcCode: code, unitPrice: medicare, medicareFee: medicare, priceSource: 'MEDICARE', contractId: null });
    } else {
      result.set(code, { hcpcCode: code, unitPrice: null, medicareFee: null, priceSource: 'MANUAL', contractId: null });
    }
  }
  return result;
}

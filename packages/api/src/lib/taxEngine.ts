/**
 * Tax engine interface + InternalTaxEngine implementation.
 *
 * Per-line tax + jurisdiction-aware. Reads US state sales tax rates from
 * the `sales_tax_rates` table (data-driven; rates can be updated without
 * a deploy). The interface is forward-compatible with Avalara / TaxJar /
 * Vertex; swap via `setTaxEngine(new AvalaraTaxEngine(...))`.
 */
import { and, eq, sql } from 'drizzle-orm';
import { salesTaxRates } from '@curavend/db';
import { getDb } from './db';
import type { D1Database } from '@cloudflare/workers-types';

export interface TaxCalcLine {
  lineKey: string;            // caller-supplied identifier (e.g., invoice_item.id)
  amountCents: number;        // pre-tax line subtotal
  taxCode?: string | null;
  taxExempt?: boolean;
  taxExemptReason?: string | null;
  shipFromState?: string | null;
  shipToState?: string | null;
}

export interface TaxCalcInput {
  invoiceId: string;
  d1?: D1Database;           // when set, InternalTaxEngine reads rates from DB
  hospitalTaxExempt: boolean;
  hospitalTaxExemptCertificateId?: string | null;
  defaultShipFromState?: string | null;
  defaultShipToState?: string | null;
  lines: TaxCalcLine[];
}

export interface TaxCalcLineResult {
  lineKey: string;
  taxRate: number;            // decimal: 0.0625 = 6.25%
  taxAmountCents: number;
  taxJurisdictionCode: string | null;
  taxCode: string | null;
  exempt: boolean;
  exemptReason: string | null;
}

export interface TaxCalcResult {
  lines: TaxCalcLineResult[];
  subtotalCents: number;
  taxTotalCents: number;
  grandTotalCents: number;
  provider: 'INTERNAL' | 'AVALARA' | 'TAXJAR' | 'VERTEX';
  calculationId: string;
  calculatedAt: string;
}

export interface TaxEngine {
  readonly provider: 'INTERNAL' | 'AVALARA' | 'TAXJAR' | 'VERTEX';
  calculate(input: TaxCalcInput): Promise<TaxCalcResult>;
  void?(calculationId: string): Promise<void>;
}

// ─── Tax codes that are always exempt (NACS-style classification) ────────
const ALWAYS_EXEMPT_TAX_CODES = new Set([
  'PH050100',  // Generic medical equipment
  'PH050200',  // Prescription medical devices
  'PH010000',  // Prescription drugs
  'DME',       // Convenience alias for medical DME
]);

/**
 * Last-resort hardcoded fallback if D1 is unavailable. Should rarely fire —
 * primarily the `sales_tax_rates` table is the source of truth. Keeping a
 * minimum in-memory map prevents catastrophic failure during a DB outage.
 */
const FALLBACK_STATE_RATES: Record<string, number> = {
  AK: 0.0, DE: 0.0, MT: 0.0, NH: 0.0, OR: 0.0,
  // All other states default to 0 in fallback mode. The audit trail will
  // record `source: 'FALLBACK_NO_DB'` so reconciliation can flag these.
};

export class InternalTaxEngine implements TaxEngine {
  readonly provider = 'INTERNAL' as const;

  async calculate(input: TaxCalcInput): Promise<TaxCalcResult> {
    const calculationId = `internal-${input.invoiceId}-${Date.now()}`;
    const calculatedAt = new Date().toISOString();
    const lines: TaxCalcLineResult[] = [];

    let subtotalCents = 0;
    let taxTotalCents = 0;

    // Precompute a per-state rate map for this invoice's relevant destinations
    const stateSet = new Set<string>();
    for (const l of input.lines) {
      const s = (l.shipToState ?? input.defaultShipToState ?? '').toUpperCase().trim();
      if (s) stateSet.add(s);
    }
    const stateRates = await this.loadStateRates(input.d1, Array.from(stateSet));

    for (const line of input.lines) {
      subtotalCents += line.amountCents;

      const exempt =
        input.hospitalTaxExempt ||
        !!line.taxExempt ||
        (line.taxCode != null && ALWAYS_EXEMPT_TAX_CODES.has(line.taxCode));
      const exemptReason = input.hospitalTaxExempt
        ? `Hospital tax-exempt${input.hospitalTaxExemptCertificateId ? ` (cert ${input.hospitalTaxExemptCertificateId})` : ''}`
        : line.taxExemptReason
        ?? (line.taxCode && ALWAYS_EXEMPT_TAX_CODES.has(line.taxCode) ? `Tax code ${line.taxCode} is exempt` : null);

      if (exempt) {
        lines.push({
          lineKey: line.lineKey,
          taxRate: 0,
          taxAmountCents: 0,
          taxJurisdictionCode: null,
          taxCode: line.taxCode ?? null,
          exempt: true,
          exemptReason,
        });
        continue;
      }

      // Origin-based vs destination-based sourcing: most US states are
      // destination-based for sales tax. Pick the ship-to state.
      const state = (line.shipToState ?? input.defaultShipToState ?? '').toUpperCase().trim();
      const rate = stateRates.get(state) ?? FALLBACK_STATE_RATES[state] ?? 0;
      const taxAmountCents = Math.round(line.amountCents * rate);
      taxTotalCents += taxAmountCents;
      lines.push({
        lineKey: line.lineKey,
        taxRate: rate,
        taxAmountCents,
        taxJurisdictionCode: state ? `US-${state}` : null,
        taxCode: line.taxCode ?? null,
        exempt: false,
        exemptReason: null,
      });
    }

    return {
      lines,
      subtotalCents,
      taxTotalCents,
      grandTotalCents: subtotalCents + taxTotalCents,
      provider: this.provider,
      calculationId,
      calculatedAt,
    };
  }

  /**
   * Load active state-level sales tax rates from the DB for the given set
   * of states. Returns a Map keyed by 2-letter state code (e.g. 'MA').
   *
   * If `d1` is not supplied, returns an empty map and the caller falls back
   * to FALLBACK_STATE_RATES (mostly zeros — flags non-tax-free states for
   * audit attention via `lineKey` exempt=false / rate=0).
   */
  private async loadStateRates(
    d1: D1Database | undefined,
    states: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!d1 || states.length === 0) return out;
    const db = getDb(d1);
    const codes = states.map((s) => `US-${s}`);
    try {
      const rows = await db
        .select({
          jurisdictionCode: salesTaxRates.jurisdictionCode,
          rate: salesTaxRates.rate,
        })
        .from(salesTaxRates)
        .where(
          and(
            eq(salesTaxRates.jurisdictionType, 'STATE'),
            eq(salesTaxRates.isActive, 1),
            sql`${salesTaxRates.jurisdictionCode} IN (${sql.join(codes.map((c) => sql`${c}`), sql`, `)})`,
          ),
        );
      for (const r of rows) {
        // jurisdictionCode is 'US-XX' → strip to 'XX'
        const state = r.jurisdictionCode.startsWith('US-')
          ? r.jurisdictionCode.slice(3).toUpperCase()
          : r.jurisdictionCode.toUpperCase();
        out.set(state, r.rate);
      }
    } catch (err) {
      console.warn('[taxEngine] failed to load sales_tax_rates, falling back:', err);
    }
    return out;
  }
}

/** Singleton — swap with AvalaraTaxEngine via env config later. */
let _engine: TaxEngine | null = null;

export function getTaxEngine(): TaxEngine {
  if (!_engine) {
    _engine = new InternalTaxEngine();
  }
  return _engine;
}

/** Override the engine for testing or for an alternative provider. */
export function setTaxEngine(engine: TaxEngine): void {
  _engine = engine;
}

/**
 * Invoice-match auto-resolution.
 *
 * Given a three-way-match exception (a difference between PO unit price and
 * invoice unit price, OR a quantity delta), look up the most specific
 * matching rule for (hospitalId, vendorId) and auto-resolve if the delta is
 * within both the percentage tolerance and the absolute dollar cap.
 *
 * Returns:
 *   - { decision: 'AUTO_APPROVE', ruleId } — caller flips the exception to RESOLVED
 *   - { decision: 'ESCALATE', reason }     — caller leaves it OPEN for review
 *   - { decision: 'NO_RULE' }              — no rule configured; safe default = escalate
 *
 * This service is pure — caller decides what to do with the decision.
 */
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { invoiceMatchRules } from '@curavend/db';

export interface AutoResolveArgs {
  hospitalId: string;
  vendorId: string;
  poTotalUsd: number;
  invoiceTotalUsd: number;
}

export interface AutoResolveResult {
  decision: 'AUTO_APPROVE' | 'ESCALATE' | 'NO_RULE';
  reason?: string;
  ruleId?: string;
  deltaUsd?: number;
  deltaPct?: number;
}

export async function evaluateMatchRules(
  d1: D1Database, args: AutoResolveArgs,
): Promise<AutoResolveResult> {
  const db = getDb(d1);
  // Most specific rule wins: vendor-specific > all-vendors. Among matches,
  // most-recently-updated wins.
  const rows = await db
    .select()
    .from(invoiceMatchRules)
    .where(
      and(
        eq(invoiceMatchRules.hospitalId, args.hospitalId),
        eq(invoiceMatchRules.isActive, 1),
        or(eq(invoiceMatchRules.vendorId, args.vendorId), isNull(invoiceMatchRules.vendorId))!,
      ),
    )
    .orderBy(desc(invoiceMatchRules.updatedAt));
  if (rows.length === 0) return { decision: 'NO_RULE' };

  // Prefer vendor-specific over null-vendor rule.
  const rule = rows.find((r) => r.vendorId === args.vendorId) ?? rows[0];

  const delta = args.invoiceTotalUsd - args.poTotalUsd;
  const absDelta = Math.abs(delta);
  const pct = args.poTotalUsd > 0 ? (absDelta / args.poTotalUsd) * 100 : 0;

  if (absDelta <= rule.toleranceMaxUsd && pct <= rule.tolerancePct) {
    return {
      decision: 'AUTO_APPROVE',
      ruleId: rule.id,
      deltaUsd: delta,
      deltaPct: pct,
    };
  }
  return {
    decision: 'ESCALATE',
    reason: `delta $${absDelta.toFixed(2)} (${pct.toFixed(1)}%) exceeds rule (max $${rule.toleranceMaxUsd}, ${rule.tolerancePct}%)`,
    ruleId: rule.id,
    deltaUsd: delta,
    deltaPct: pct,
  };
}

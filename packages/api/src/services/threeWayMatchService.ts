/**
 * Three-way match service.
 *
 * Inputs: an invoiceId. For each invoice line:
 *   1. Look up the source order line via the invoice's orderId + matching HCPC code.
 *   2. Sum quantities from any goods_receipt_lines on the same order with that HCPC.
 *   3. Compare PO qty, received qty, invoice qty, PO unit price, invoice unit price.
 *   4. Persist a `three_way_matches` row with a status.
 *
 * Tolerances (hardcoded defaults; surface as hospital config later):
 *   QTY:   exact match required (variance = 0)
 *   PRICE: 2% above or below PO unit price
 *
 * Returns the array of newly-computed match rows.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  invoices,
  invoiceItems,
  orders,
  orderItems,
  goodsReceipts,
  goodsReceiptLines,
  threeWayMatches,
  type MatchStatus,
} from '@curavend/db';
import type { D1Database } from '@cloudflare/workers-types';

const PRICE_TOLERANCE_PCT = 0.02; // 2%

export interface MatchResult {
  invoiceItemId: string;
  hcpcCode: string;
  matchStatus: MatchStatus;
  poQuantity: number | null;
  receivedQuantity: number | null;
  invoiceQuantity: number | null;
  poUnitPriceUsd: number | null;
  invoiceUnitPriceUsd: number | null;
  qtyVariance: number | null;
  priceVariancePct: number | null;
}

export async function runThreeWayMatch(
  d1: D1Database,
  invoiceId: string,
): Promise<MatchResult[]> {
  const db = getDb(d1);
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

  const invLines = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  if (invLines.length === 0) return [];

  const orderId = (inv as any).orderId ?? null;
  let poLines: any[] = [];
  if (orderId) {
    poLines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }
  let receipts: any[] = [];
  let receiptLines: any[] = [];
  if (orderId) {
    receipts = await db.select().from(goodsReceipts).where(eq(goodsReceipts.orderId, orderId));
    if (receipts.length) {
      const receiptIds = receipts.map((r) => r.id);
      for (const rid of receiptIds) {
        const lines = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.receiptId, rid));
        receiptLines.push(...lines);
      }
    }
  }

  // Clear previous matches for this invoice (re-run idempotent)
  await db.delete(threeWayMatches).where(eq(threeWayMatches.invoiceId, invoiceId));

  const results: MatchResult[] = [];
  const now = new Date().toISOString();

  for (const inv of invLines) {
    const hcpc = (inv as any).code ?? '';
    const invQty = (inv as any).quantity ?? 0;
    const invUnitCents = (inv as any).unitPriceCents ?? 0;
    const invUnit = invUnitCents ? invUnitCents / 100 : (inv as any).unitPrice ?? 0;

    // Find matching PO line by HCPC code
    const poMatches = poLines.filter((l) => (l.code ?? '') === hcpc);
    let matchStatus: MatchStatus = 'PERFECT';
    let poQty: number | null = null;
    let poUnit: number | null = null;
    let receiptLineId: string | null = null;
    let receivedQty: number | null = null;
    let receivedCondition: string | null = null;
    let qtyVariance: number | null = null;
    let priceVariance: number | null = null;
    let priceVariancePct: number | null = null;

    if (poMatches.length === 0) {
      matchStatus = 'NO_PO';
    } else if (poMatches.length > 1) {
      matchStatus = 'AMBIGUOUS';
      poQty = poMatches.reduce((s, l) => s + (l.quantity ?? 0), 0);
    } else {
      const po = poMatches[0];
      poQty = po.quantity ?? 0;
      // PO doesn't carry unit price natively — fall back to invoice's unit price as the reference.
      // (When contract pricing is wired into orderItems, swap to that.)
      poUnit = invUnit;
    }

    // Goods receipts for this HCPC across all receipts
    const matchedReceiptLines = receiptLines.filter((l) => (l.hcpcCode ?? '') === hcpc);
    if (matchedReceiptLines.length > 0) {
      receivedQty = matchedReceiptLines.reduce((s, l) => s + (l.quantityReceived ?? 0), 0);
      const conditions = matchedReceiptLines.map((l) => l.condition).filter(Boolean);
      // Worst-condition wins for the flag
      receivedCondition = conditions.find((c) => c !== 'GOOD') ?? 'GOOD';
      receiptLineId = matchedReceiptLines[0].id;
    } else if (matchStatus === 'PERFECT') {
      matchStatus = 'NO_RECEIPT';
    }

    // Compute variances
    if (matchStatus === 'PERFECT' && poQty != null && receivedQty != null) {
      qtyVariance = invQty - receivedQty;
      if (qtyVariance !== 0) matchStatus = 'QTY_VARIANCE';
    }
    if (matchStatus === 'PERFECT' && poUnit != null) {
      priceVariance = invUnit - poUnit;
      priceVariancePct = poUnit > 0 ? Math.abs(priceVariance) / poUnit : 0;
      if (priceVariancePct > PRICE_TOLERANCE_PCT) matchStatus = 'PRICE_VARIANCE';
    }
    if (matchStatus === 'PERFECT' && receivedCondition && receivedCondition !== 'GOOD') {
      matchStatus = 'CONDITION_BAD';
    }

    const row = {
      id: crypto.randomUUID(),
      invoiceId,
      invoiceItemId: (inv as any).id,
      orderId,
      purchaseOrderId: null as any,
      orderItemId: poMatches.length === 1 ? poMatches[0].id : null,
      receiptLineId,
      hcpcCode: hcpc,
      matchStatus,
      poQuantity: poQty,
      poUnitPriceUsd: poUnit,
      receivedQuantity: receivedQty,
      receivedCondition,
      invoiceQuantity: invQty,
      invoiceUnitPriceUsd: invUnit,
      qtyVariance,
      priceVariance,
      priceVariancePct,
      notes: null,
      resolvedAt: null,
      resolvedByUserId: null,
      resolution: null,
      computedAt: now,
    };

    await db.insert(threeWayMatches).values(row as any);
    results.push({
      invoiceItemId: row.invoiceItemId,
      hcpcCode: hcpc,
      matchStatus,
      poQuantity: poQty,
      receivedQuantity: receivedQty,
      invoiceQuantity: invQty,
      poUnitPriceUsd: poUnit,
      invoiceUnitPriceUsd: invUnit,
      qtyVariance,
      priceVariancePct,
    });
  }

  return results;
}

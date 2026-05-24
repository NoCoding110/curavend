/**
 * Daily DME rental billing cron.
 *
 * Walks `dme_rental_periods` rows where status = 'SCHEDULED' and
 * period_end <= today. For each, creates a rental invoice line and marks
 * the period BILLED. Also enforces Medicare rental caps:
 *
 *   - CAPPED_RENTAL: 13 months → after 13th period, equipment transfers
 *     to patient ownership. Future periods auto-skipped (TERMINATED).
 *   - OXYGEN_RENTAL: 36 months → similar but for oxygen-modality items.
 *   - INEXPENSIVE_ROUTINELY: sold outright on the first invoice; remaining
 *     periods skipped.
 *
 * Runs as part of the existing daily cron (0 8 * * *).
 */
import { and, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  dmeRentalPeriods,
  dmeOrderExtensions,
  orders,
  invoices,
  invoiceItems,
} from '@curavend/db';
import type { Env } from '../lib/env';
import { getNextValue, ensureSequenceTable } from '../services/sequenceService';

const RENTAL_CAPS: Record<string, number> = {
  CAPPED_RENTAL: 13,
  OXYGEN_RENTAL: 36,
  INEXPENSIVE_ROUTINELY: 1,
  PARENTERAL_ENTERAL: 99,        // no cap in CMS terms
  PURCHASE: 1,
  NOT_APPLICABLE: 0,
};

export async function handleRentalBilling(env: Env): Promise<{
  processed: number;
  billed: number;
  capped: number;
  errors: number;
}> {
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);

  const due = await db
    .select()
    .from(dmeRentalPeriods)
    .where(
      and(eq(dmeRentalPeriods.status, 'SCHEDULED'), lte(dmeRentalPeriods.periodEnd, today)),
    );

  let processed = 0;
  let billed = 0;
  let capped = 0;
  let errors = 0;

  for (const p of due) {
    processed++;
    try {
      // Look up order + DME extension to determine rental type
      const [ord] = await db.select().from(orders).where(eq(orders.id, p.orderId)).limit(1);
      if (!ord) {
        await db
          .update(dmeRentalPeriods)
          .set({ status: 'SKIPPED', notes: 'Source order not found', updatedAt: new Date().toISOString() })
          .where(eq(dmeRentalPeriods.id, p.id));
        continue;
      }
      const [ext] = await db
        .select()
        .from(dmeOrderExtensions)
        .where(eq(dmeOrderExtensions.orderId, p.orderId))
        .limit(1);
      const rentalType = (ext as any)?.rentalType ?? 'CAPPED_RENTAL';
      const cap = RENTAL_CAPS[rentalType] ?? 13;

      // Cap enforcement
      if (p.periodNumber > cap) {
        await db
          .update(dmeRentalPeriods)
          .set({
            status: 'TERMINATED',
            notes: `Reached ${rentalType} cap (${cap} months); equipment transfers to patient ownership`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(dmeRentalPeriods.id, p.id));
        capped++;
        continue;
      }

      // Spawn an invoice for this rental period
      await ensureSequenceTable(db);
      const seq = await getNextValue(db, `invoice_${(ord as any).hospitalId}`);
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(seq).padStart(6, '0')}`;
      const invoiceId = crypto.randomUUID();
      const now = new Date().toISOString();
      const rate = p.monthlyRateUsd ?? 0;

      await db.insert(invoices).values({
        id: invoiceId,
        // The invoices schema is broad; fill the minimum CMS-relevant fields:
        invoiceNumber,
        hospitalId: (ord as any).hospitalId,
        vendorId: (ord as any).vendorId,
        orderId: p.orderId,
        status: 'INVOICE_GENERATED',
        amountCents: Math.round(rate * 100),
        notes: `DME rental period ${p.periodNumber}/${cap} — ${rentalType} (${p.periodStart} → ${p.periodEnd})`,
        createdAt: now,
        updatedAt: now,
      } as any);

      await db.insert(invoiceItems).values({
        id: crypto.randomUUID(),
        invoiceId,
        code: 'RENTAL',
        description: `${rentalType} rental period ${p.periodNumber}/${cap}`,
        quantity: 1,
        unitPrice: rate,
        unitPriceCents: Math.round(rate * 100),
        lineSubtotalCents: Math.round(rate * 100),
        lineTotalCents: Math.round(rate * 100),
        createdAt: now,
      } as any);

      await db
        .update(dmeRentalPeriods)
        .set({
          status: 'BILLED',
          invoiceId,
          updatedAt: now,
        })
        .where(eq(dmeRentalPeriods.id, p.id));
      billed++;
    } catch (err) {
      console.error('[rental-billing] failed for period', p.id, err);
      errors++;
    }
  }

  return { processed, billed, capped, errors };
}

/**
 * Initialize rental periods for a freshly-created rental order. Called when
 * an order's DME extension is upserted with a non-PURCHASE rental type.
 *
 * Spawns N periods (capped by rental type) of length 30 days each starting
 * from `dmeEstimatedStartDate` (or today if not set).
 */
export async function initializeRentalPeriods(
  env: Env,
  orderId: string,
  monthlyRateUsd: number,
): Promise<{ created: number }> {
  const db = getDb(env.DB);
  const [ext] = await db
    .select()
    .from(dmeOrderExtensions)
    .where(eq(dmeOrderExtensions.orderId, orderId))
    .limit(1);
  if (!ext) return { created: 0 };
  const rentalType = (ext as any).rentalType;
  if (!rentalType || rentalType === 'PURCHASE' || rentalType === 'NOT_APPLICABLE') {
    return { created: 0 };
  }
  const cap = RENTAL_CAPS[rentalType] ?? 13;
  const startBase = (ext as any).estimatedStartDate
    ? new Date((ext as any).estimatedStartDate)
    : new Date();
  const lon = (ext as any).lengthOfNeedMonths ?? cap;
  const periodCount = Math.min(cap, lon);

  // Wipe any existing future SCHEDULED periods so re-init is idempotent
  await (db as any).run(
    `DELETE FROM dme_rental_periods WHERE order_id = ? AND status = 'SCHEDULED'`,
    [orderId],
  );

  const now = new Date().toISOString();
  for (let i = 1; i <= periodCount; i++) {
    const periodStart = new Date(startBase.getTime() + (i - 1) * 30 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(dmeRentalPeriods).values({
      id: crypto.randomUUID(),
      orderId,
      periodNumber: i,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      monthlyRateUsd,
      status: 'SCHEDULED',
      createdAt: now,
      updatedAt: now,
    });
  }
  return { created: periodCount };
}

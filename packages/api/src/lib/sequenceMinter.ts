/**
 * Sequential number minting for orders, invoices, POs, etc.
 *
 * Uses the existing `sequences` table with composite keys baked into the
 * sequence name (e.g., `order:BGH:2026`). Each mint is an atomic single
 * statement so concurrent POSTs cannot collide.
 *
 * Order number format: `{HOSPITAL_PREFIX}-{YEAR}-{6-DIGIT-PADDED}` →
 * e.g., `BGH-2026-000123`. Hospitals without a configured prefix fall back
 * to `ORD-{YEAR}-...`.
 */
import { sql } from 'drizzle-orm';
import { hospitals } from '@curavend/db';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Atomically increment the named sequence and return the new value. This is
 * the workhorse — every other minter wraps it.
 *
 * Uses `INSERT … ON CONFLICT (name) DO UPDATE SET current_value = current_value + 1 RETURNING current_value`
 * which is a single SQLite statement and therefore atomic across concurrent
 * Worker invocations.
 */
export async function nextSequenceValue(d1: D1Database, name: string): Promise<number> {
  const db = getDb(d1);
  const row = await db.run(sql`
    INSERT INTO sequences (name, current_value)
    VALUES (${name}, 1)
    ON CONFLICT(name) DO UPDATE SET current_value = current_value + 1
    RETURNING current_value
  `);
  // db.run with a RETURNING returns the rows in different positions across
  // drizzle/D1 versions. Probe both shapes.
  const results: any[] = (row as any).results ?? (row as any).rows ?? [];
  const value = results[0]?.current_value ?? results[0]?.['current_value'] ?? results[0]?.[0];
  if (typeof value !== 'number') {
    throw new Error(`[sequenceMinter] failed to read RETURNING value for ${name}`);
  }
  return value;
}

/**
 * Mint a human-readable order number, tenant-namespaced + year-prefixed.
 *
 * Format: `{HOSPITAL_PREFIX}-{YEAR}-{6-digit}` (e.g. `BGH-2026-000123`).
 * If the hospital has no prefix configured, falls back to `ORD`.
 */
export async function mintOrderNumber(
  d1: D1Database,
  hospitalId: string,
  asOf: Date = new Date(),
): Promise<string> {
  const db = getDb(d1);
  const year = asOf.getUTCFullYear();

  let prefix = 'ORD';
  if (hospitalId) {
    const h = await db
      .select({ orderNumberPrefix: hospitals.orderNumberPrefix })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId))
      .limit(1);
    if (h[0]?.orderNumberPrefix && h[0].orderNumberPrefix.trim().length > 0) {
      prefix = h[0].orderNumberPrefix.trim().toUpperCase();
    }
  }

  const sequenceName = `order:${prefix}:${year}`;
  const seq = await nextSequenceValue(d1, sequenceName);
  return `${prefix}-${year}-${seq.toString().padStart(6, '0')}`;
}

/** Mint an invoice number. Format: `INV-{YEAR}-{6-digit}` (no tenant scope). */
export async function mintInvoiceNumber(
  d1: D1Database,
  asOf: Date = new Date(),
): Promise<string> {
  const year = asOf.getUTCFullYear();
  const seq = await nextSequenceValue(d1, `invoice:${year}`);
  return `INV-${year}-${seq.toString().padStart(6, '0')}`;
}

/** Mint a purchase order number. Format: `PO-{YEAR}-{6-digit}`. */
export async function mintPurchaseOrderNumber(
  d1: D1Database,
  asOf: Date = new Date(),
): Promise<string> {
  const year = asOf.getUTCFullYear();
  const seq = await nextSequenceValue(d1, `purchase_order:${year}`);
  return `PO-${year}-${seq.toString().padStart(6, '0')}`;
}

/** Mint a support ticket number. Format: `TKT-{YEAR}-{6-digit}`. */
export async function mintSupportTicketNumber(
  d1: D1Database,
  asOf: Date = new Date(),
): Promise<string> {
  const year = asOf.getUTCFullYear();
  const seq = await nextSequenceValue(d1, `support_ticket:${year}`);
  return `TKT-${year}-${seq.toString().padStart(6, '0')}`;
}

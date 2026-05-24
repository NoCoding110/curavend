/**
 * DME document packet management.
 *
 * When a DME order is created, this service walks the order's items, looks up
 * required documents for each HCPC, and materializes one `dme_order_documents`
 * row per (orderId, documentType) with status MISSING.
 *
 * Users then upload files which mark them RECEIVED. The materialization is
 * idempotent — re-running for the same order doesn't duplicate rows.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orders,
  orderItems,
  dmeDocumentRequirements,
  dmeOrderDocuments,
  payors,
} from '@curavend/db';
import type { D1Database } from '@cloudflare/workers-types';

export interface MaterializedDoc {
  documentType: string;
  required: boolean;
  status: 'MISSING' | 'RECEIVED' | 'EXPIRED' | 'REJECTED' | 'NOT_APPLICABLE';
  expiresDays: number | null;
  notes: string | null;
}

/**
 * Resolve the document packet for an order. Looks at:
 *   - each HCPC in the order items
 *   - the order's payor kind (if set)
 *   - dme_document_requirements with matching hcpc_code (and matching
 *     payor_kind_filter OR null filter)
 * Returns the deduped set of (documentType, requirement).
 */
export async function resolveDocumentRequirements(
  d1: D1Database,
  orderId: string,
): Promise<{ requirementId: string; documentType: string; expiresDays: number | null; notes: string | null }[]> {
  const db = getDb(d1);

  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!ord) return [];

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const hcpcs = Array.from(new Set(items.map((i) => i.code).filter(Boolean) as string[]));
  if (hcpcs.length === 0) return [];

  // Determine payor kind for the filter, if order has a payor
  let payorKind: string | null = null;
  if ((ord as any).payorId) {
    const [p] = await db.select().from(payors).where(eq(payors.id, (ord as any).payorId)).limit(1);
    payorKind = (p as any)?.kind ?? null;
  }

  const reqs = await db
    .select()
    .from(dmeDocumentRequirements)
    .where(
      and(
        inArray(dmeDocumentRequirements.hcpcCode, hcpcs),
        eq(dmeDocumentRequirements.isRequired, 1),
      ),
    );

  // Filter by payor kind: keep rows where filter is null OR matches
  const applicable = reqs.filter(
    (r) => r.payorKindFilter == null || (payorKind && r.payorKindFilter === payorKind),
  );

  // Dedupe by document type (so we don't materialize the same type twice
  // if two HCPCs both require a DWO). Take the first matching requirement.
  const seen = new Set<string>();
  const out: { requirementId: string; documentType: string; expiresDays: number | null; notes: string | null }[] = [];
  for (const r of applicable) {
    if (seen.has(r.documentType)) continue;
    seen.add(r.documentType);
    out.push({
      requirementId: r.id,
      documentType: r.documentType,
      expiresDays: r.expiresDays,
      notes: r.notes,
    });
  }
  return out;
}

/**
 * Idempotently create dme_order_documents rows for any required docs
 * not already materialized. Returns count of new rows created.
 */
export async function materializeOrderDocuments(
  d1: D1Database,
  orderId: string,
): Promise<{ created: number; totalRequired: number }> {
  const db = getDb(d1);
  const required = await resolveDocumentRequirements(d1, orderId);

  // Pull what's already materialized
  const existing = await db
    .select()
    .from(dmeOrderDocuments)
    .where(eq(dmeOrderDocuments.orderId, orderId));
  const existingTypes = new Set(existing.map((e) => e.documentType));

  const now = new Date().toISOString();
  let created = 0;
  for (const req of required) {
    if (existingTypes.has(req.documentType)) continue;
    await db.insert(dmeOrderDocuments).values({
      id: crypto.randomUUID(),
      orderId,
      requirementId: req.requirementId,
      documentType: req.documentType,
      status: 'MISSING',
      notes: req.notes,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }
  return { created, totalRequired: required.length };
}

/**
 * Doc-packet completeness summary for an order. Used by the order detail UI
 * to show "5 of 7 docs received, missing: CMN, Face-to-face".
 */
export async function getDocPacketStatus(d1: D1Database, orderId: string) {
  const db = getDb(d1);
  const rows = await db
    .select()
    .from(dmeOrderDocuments)
    .where(eq(dmeOrderDocuments.orderId, orderId));
  const total = rows.length;
  const received = rows.filter((r) => r.status === 'RECEIVED').length;
  const missing = rows.filter((r) => r.status === 'MISSING' || r.status === 'EXPIRED').length;
  const rejected = rows.filter((r) => r.status === 'REJECTED').length;
  return {
    total,
    received,
    missing,
    rejected,
    complete: total > 0 && missing === 0 && rejected === 0,
    docs: rows,
  };
}

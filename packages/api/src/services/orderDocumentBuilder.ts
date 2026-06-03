/**
 * Order document builder — lifts PDF generation out of route handlers
 * so it can be called from the queue context (Gap 3).
 *
 * Returns null gracefully when the order is not a DME order or PDF generation fails,
 * so the write-back logic logs SKIPPED rather than crashing.
 */
import type { Env } from '../lib/env';
import { getDb } from '../lib/db';
import { sql } from 'drizzle-orm';

export async function buildDwoPdf(env: Env, orderId: string): Promise<Uint8Array | null> {
  try {
    const db = getDb(env.DB);
    // Check if this is a DME order with DWO data
    const row: any = await db.run(sql`
      SELECT o.id, o.patient_name, o.vendor_id,
             d.id as dme_doc_id, d.document_type
      FROM orders o
      LEFT JOIN dme_documents d ON d.order_id = o.id AND d.document_type = 'DWO'
      WHERE o.id = ${orderId}
      LIMIT 1
    `);
    const order = row?.results?.[0] ?? row?.[0];
    if (!order?.dme_doc_id) return null; // not a DME order with DWO

    // The dmeDocumentService exports vary — use dynamic import with any cast
    // to avoid compile-time coupling. If it doesn't have the needed exports,
    // we return null gracefully.
    try {
      const dmeService = await import('./dmeDocumentService') as any;
      if (typeof dmeService.loadDwoData !== 'function' || typeof dmeService.renderDwoHtml !== 'function') {
        return null;
      }
      const dwoData = await dmeService.loadDwoData(env.DB, orderId);
      if (!dwoData) return null;
      const html = dmeService.renderDwoHtml(dwoData);

      // Try browser rendering
      if (env.BROWSER) {
        try {
          const pdfService = await import('./pdfService') as any;
          if (typeof pdfService.renderHtmlToPdf === 'function') {
            const pdf = await pdfService.renderHtmlToPdf(env.BROWSER, html);
            if (pdf) return pdf;
          }
        } catch (err) {
          console.warn('[orderDocumentBuilder] browser PDF render failed:', err);
        }
      }
    } catch (err) {
      console.warn('[orderDocumentBuilder] dmeDocumentService not available:', err);
    }
    return null;
  } catch (err) {
    console.warn('[orderDocumentBuilder] buildDwoPdf failed:', err);
    return null;
  }
}

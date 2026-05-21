// services/invoiceService.ts
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../lib/db';
import { invoices, invoiceItems, orderItems, sequences, orders, hospitals, vendors } from '@curavend/db';
import { eq, sql } from 'drizzle-orm';
import { getTaxEngine, type TaxCalcLine } from '../lib/taxEngine';

export class InvoiceService {
  private db: ReturnType<typeof getDb>;
  private d1: D1Database;

  constructor(d1: D1Database) {
    this.d1 = d1;
    this.db = getDb(d1);
  }

  async getNextInvoiceNumber(): Promise<number> {
    // Atomic increment via composite name `invoice:{year}`
    const year = new Date().getUTCFullYear();
    const name = `invoice:${year}`;
    const row = await this.db.run(sql`
      INSERT INTO sequences (name, current_value)
      VALUES (${name}, 1)
      ON CONFLICT(name) DO UPDATE SET current_value = current_value + 1
      RETURNING current_value
    `);
    const results: any[] = (row as any).results ?? (row as any).rows ?? [];
    const value = results[0]?.current_value ?? results[0]?.['current_value'] ?? results[0]?.[0];
    return typeof value === 'number' ? value : 1;
  }

  async createInvoiceForOrder(order: {
    id: string;
    hospitalId: string;
    vendorId: string | null;
    providerId: string | null;
    superVendorId: string | null;
    identifier: string;
  }): Promise<string> {
    // Idempotent: bail if invoice already exists for this order
    const existing = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.orderId, order.id))
      .limit(1);
    if (existing.length > 0) return existing[0].id;

    const seq = await this.getNextInvoiceNumber();
    const year = new Date().getUTCFullYear();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Load full order + hospital + vendor for tax-engine context
    const fullOrder = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    const hospitalRow = await this.db.select().from(hospitals).where(eq(hospitals.id, order.hospitalId)).limit(1);
    const vendorRow = order.vendorId
      ? await this.db.select().from(vendors).where(eq(vendors.id, order.vendorId)).limit(1)
      : [];

    const items = await this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    // Build invoice line items with cents-based pricing
    const invoiceLineRows = items.map((item) => {
      const unitPriceCents = Math.round((item.unitPrice ?? 0) * 100);
      const qty = item.quantity ?? 1;
      const lineSubtotalCents = unitPriceCents * qty;
      return {
        id: crypto.randomUUID(),
        code: item.code ?? null,
        description: item.description ?? null,
        quantity: qty,
        unitPriceCents,
        lineSubtotalCents,
      };
    });

    // Build tax calc input
    const orderRow = fullOrder[0] ?? null;
    const hospital = hospitalRow[0] ?? null;
    const vendorData = vendorRow[0] ?? null;
    const taxEngine = getTaxEngine();

    const taxLines: TaxCalcLine[] = invoiceLineRows.map((l) => ({
      lineKey: l.id,
      amountCents: l.lineSubtotalCents,
      taxCode: 'DME', // healthcare DME — Internal engine treats as exempt
      taxExempt: !!orderRow?.taxExempt,
      taxExemptReason: orderRow?.taxExemptCertificateId ?? null,
      shipFromState: vendorData?.state ?? null,
      shipToState: hospital?.state ?? null,
    }));

    const taxResult = await taxEngine.calculate({
      invoiceId: id,
      d1: this.d1,
      hospitalTaxExempt: !!hospital?.taxExempt,
      hospitalTaxExemptCertificateId: hospital?.taxExemptCertificateUrl ?? null,
      defaultShipFromState: vendorData?.state ?? null,
      defaultShipToState: hospital?.state ?? null,
      lines: taxLines,
    });

    // Insert invoice header
    await this.db.insert(invoices).values({
      id,
      number: `INV-${year}-${seq.toString().padStart(6, '0')}`,
      orderId: order.id,
      hospitalId: order.hospitalId,
      vendorId: order.vendorId ?? '',
      providerId: order.providerId ?? null,
      superVendorId: order.superVendorId ?? null,
      status: 'ORDER_COMPLETED',
      total: (taxResult.grandTotalCents / 100),
      subtotalCents: taxResult.subtotalCents,
      taxTotalCents: taxResult.taxTotalCents,
      grandTotalCents: taxResult.grandTotalCents,
      currencyCode: hospital?.preferredCurrencyCode ?? 'USD',
      taxEngineCalculatedAt: taxResult.calculatedAt,
      taxEngineProvider: taxResult.provider,
      taxEngineCalculationId: taxResult.calculationId,
      createdAt: now,
      updatedAt: now,
    });

    // Insert invoice items with per-line tax stamped on
    const lineResultByKey = new Map(taxResult.lines.map((l) => [l.lineKey, l]));
    for (const row of invoiceLineRows) {
      const taxLine = lineResultByKey.get(row.id);
      const taxAmountCents = taxLine?.taxAmountCents ?? 0;
      const lineTotalCents = row.lineSubtotalCents + taxAmountCents;
      await this.db.insert(invoiceItems).values({
        id: row.id,
        invoiceId: id,
        code: row.code,
        description: row.description,
        quantity: row.quantity,
        unitPrice: row.unitPriceCents / 100,
        spend: row.lineSubtotalCents / 100,
        unitPriceCents: row.unitPriceCents,
        lineSubtotalCents: row.lineSubtotalCents,
        taxRate: taxLine?.taxRate ?? 0,
        taxAmountCents,
        taxCode: taxLine?.taxCode ?? null,
        taxJurisdictionCode: taxLine?.taxJurisdictionCode ?? null,
        taxExempt: taxLine?.exempt ? 1 : 0,
        taxExemptReason: taxLine?.exemptReason ?? null,
        lineTotalCents,
        createdAt: now,
      });
    }

    return id;
  }
}

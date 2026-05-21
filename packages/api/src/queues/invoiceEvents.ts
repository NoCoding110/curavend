/**
 * Queue handlers for invoice.* events.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { getInvoiceById, notifyHospitalUsers, notifyVendorUsers } from './notificationHelpers';
import { dispatchCustomerEvent } from '../services/notificationRouter';
import { invoicePaidTemplate } from '../services/customerEmailTemplates';
import { hospitals as hospitalsTbl, vendors as vendorsTbl } from '@curavend/db';
import type { Env } from '../lib/env';

export async function handleInvoiceCreated(env: Env, payload: { invoiceId: string }) {
  const inv = await getInvoiceById(env, payload.invoiceId);
  if (!inv) return;
  if (inv.vendorId) {
    await notifyVendorUsers(
      env,
      inv.vendorId,
      `Invoice ${inv.number} created for completed order`,
      'INVOICE',
      inv.id,
    );
  }
}

export async function handleInvoiceSent(env: Env, payload: { invoiceId: string }) {
  const inv = await getInvoiceById(env, payload.invoiceId);
  if (!inv) return;
  if (inv.hospitalId) {
    await notifyHospitalUsers(
      env,
      inv.hospitalId,
      `Invoice ${inv.number} received — payment due`,
      'INVOICE',
      inv.id,
      `Curavend: Invoice ${inv.number}`,
      `<p>A new invoice <strong>${inv.number}</strong> is ready for payment. Total: $${inv.total ?? 0}.</p>`,
    );
  }
}

export async function handleInvoicePaid(env: Env, payload: { invoiceId: string; stripeSessionId?: string; amountPaid?: number }) {
  const inv = await getInvoiceById(env, payload.invoiceId);
  if (!inv) return;

  // Internal notification to the vendor
  if (inv.vendorId) {
    await notifyVendorUsers(
      env,
      inv.vendorId,
      `Invoice ${inv.number} has been paid`,
      'INVOICE',
      inv.id,
      `Curavend: Payment received for ${inv.number}`,
      `<p>Payment has been recorded for invoice <strong>${inv.number}</strong>.</p>`,
    );
  }

  // ── Customer-facing paid receipt email ──────────────────────────────
  try {
    const db = getDb(env.DB);
    const [hospRow, vendRow] = await Promise.all([
      inv.hospitalId ? db.select({ name: hospitalsTbl.name }).from(hospitalsTbl).where(eq(hospitalsTbl.id, inv.hospitalId)).limit(1) : Promise.resolve([]),
      inv.vendorId ? db.select({ name: vendorsTbl.name }).from(vendorsTbl).where(eq(vendorsTbl.id, inv.vendorId)).limit(1) : Promise.resolve([]),
    ]);
    const amountCents = (inv as any).grandTotalCents ?? Math.round(((inv as any).total ?? 0) * 100);
    await dispatchCustomerEvent(env, {
      eventType: 'INVOICE_PAID',
      invoiceId: inv.id,
      orderId: inv.orderId ?? undefined,
      hospitalId: inv.hospitalId ?? undefined,
      vendorId: inv.vendorId ?? undefined,
      subject: `Curavend: Payment received for invoice ${inv.number}`,
      htmlBuilder: () => invoicePaidTemplate({
        invoiceNumber: inv.number,
        hospitalName: hospRow[0]?.name ?? null,
        vendorName: vendRow[0]?.name ?? null,
        amountCents,
        currency: (inv as any).currencyCode ?? 'USD',
        paidAt: (inv as any).paymentDate ?? null,
        receiptUrl: null,
        unsubscribeUrl: null,
      }),
    });
  } catch (err) {
    console.warn('[invoiceEvents] paid receipt email failed:', err);
  }
}

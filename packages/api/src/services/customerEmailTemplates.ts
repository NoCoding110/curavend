/**
 * HTML templates for customer-facing emails (order confirmation, shipped,
 * delivered, paid receipt, recurring upcoming).
 *
 * Plain inline HTML with a brand header + unsubscribe link. The Worker serves
 * `GET /unsubscribe?token=...` for the link.
 */
import { trackingUrl as carrierTrackingUrl } from '../lib/carriers';

const BRAND_COLOR = '#1677ff';

function header(title: string): string {
  return `
    <div style="background:${BRAND_COLOR};color:#fff;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:20px;font-weight:bold;">Curavend</div>
      <div style="font-size:13px;opacity:0.9;">${escapeHtml(title)}</div>
    </div>
  `;
}

function footer(unsubscribeUrl?: string | null): string {
  return `
    <div style="padding:16px 24px;border-top:1px solid #eee;background:#fafafa;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;">
      <div>You're receiving this email because your account is associated with a Curavend supply order. If you don't want to receive these emails, <a href="${unsubscribeUrl ?? '#'}" style="color:${BRAND_COLOR};">unsubscribe</a>.</div>
      <div style="margin-top:6px;">Curavend, Inc. · Healthcare Supply Chain Management</div>
    </div>
  `;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface OrderLite {
  identifier: string | null;
  patientName: string | null;
  patientLastName: string | null;
  hospitalName?: string | null;
  vendorName?: string | null;
  comment?: string | null;
}

interface OrderItem {
  code: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice?: number | null;
}

export function orderConfirmationTemplate(args: {
  order: OrderLite;
  items: OrderItem[];
  unsubscribeUrl?: string | null;
}): string {
  const { order, items } = args;
  const patient = [order.patientName, order.patientLastName].filter(Boolean).join(' ') || '—';
  return `
    <div style="background:#f5f6f8;padding:24px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:6px;overflow:hidden;">
        ${header('Order confirmation')}
        <div style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#222;">
          <p style="font-size:14px;">Your order <strong>${escapeHtml(order.identifier ?? '')}</strong> has been received.</p>
          <table style="width:100%;font-size:13px;margin-top:12px;border-collapse:collapse;">
            <tr><td style="padding:4px 0;color:#888;">Patient:</td><td>${escapeHtml(patient)}</td></tr>
            ${order.hospitalName ? `<tr><td style="padding:4px 0;color:#888;">Hospital:</td><td>${escapeHtml(order.hospitalName)}</td></tr>` : ''}
            ${order.vendorName ? `<tr><td style="padding:4px 0;color:#888;">Vendor:</td><td>${escapeHtml(order.vendorName)}</td></tr>` : ''}
          </table>
          <h4 style="margin:20px 0 8px;font-size:14px;">Items</h4>
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="text-align:left;padding:6px 10px;">HCPC</th>
                <th style="text-align:left;padding:6px 10px;">Description</th>
                <th style="text-align:right;padding:6px 10px;">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it) => `
                <tr style="border-top:1px solid #eee;">
                  <td style="padding:6px 10px;">${escapeHtml(it.code ?? '')}</td>
                  <td style="padding:6px 10px;">${escapeHtml(it.description ?? '')}</td>
                  <td style="padding:6px 10px;text-align:right;">${it.quantity ?? 1}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="margin-top:20px;font-size:13px;color:#555;">We'll email you again when your order ships.</p>
        </div>
        ${footer(args.unsubscribeUrl)}
      </div>
    </div>
  `;
}

export function orderShippedTemplate(args: {
  order: OrderLite;
  carrierCode: string | null;
  trackingNumber: string | null;
  vendorTrackingTemplate?: string | null;
  shipmentDate?: string | null;
  expectedDeliveryDate?: string | null;
  unsubscribeUrl?: string | null;
}): string {
  const { order, carrierCode, trackingNumber } = args;
  const trackUrl = carrierTrackingUrl(carrierCode, trackingNumber, args.vendorTrackingTemplate);
  return `
    <div style="background:#f5f6f8;padding:24px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:6px;overflow:hidden;">
        ${header('Your order has shipped')}
        <div style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#222;">
          <p style="font-size:14px;">Order <strong>${escapeHtml(order.identifier ?? '')}</strong> is on its way.</p>
          <table style="width:100%;font-size:13px;margin-top:12px;">
            ${carrierCode ? `<tr><td style="padding:4px 0;color:#888;">Carrier:</td><td>${escapeHtml(carrierCode)}</td></tr>` : ''}
            ${trackingNumber ? `<tr><td style="padding:4px 0;color:#888;">Tracking:</td><td><strong>${escapeHtml(trackingNumber)}</strong></td></tr>` : ''}
            ${args.shipmentDate ? `<tr><td style="padding:4px 0;color:#888;">Shipped:</td><td>${escapeHtml(args.shipmentDate)}</td></tr>` : ''}
            ${args.expectedDeliveryDate ? `<tr><td style="padding:4px 0;color:#888;">Expected:</td><td>${escapeHtml(args.expectedDeliveryDate)}</td></tr>` : ''}
          </table>
          ${trackUrl ? `<p style="margin-top:20px;"><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;font-size:13px;">Track shipment</a></p>` : ''}
        </div>
        ${footer(args.unsubscribeUrl)}
      </div>
    </div>
  `;
}

export function orderDeliveredTemplate(args: {
  order: OrderLite;
  podUrl?: string | null;
  deliveredAt?: string | null;
  unsubscribeUrl?: string | null;
}): string {
  return `
    <div style="background:#f5f6f8;padding:24px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:6px;overflow:hidden;">
        ${header('Your order was delivered')}
        <div style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#222;">
          <p style="font-size:14px;">Order <strong>${escapeHtml(args.order.identifier ?? '')}</strong> has been delivered${args.deliveredAt ? ` on <strong>${escapeHtml(args.deliveredAt)}</strong>` : ''}.</p>
          ${args.podUrl ? `<p style="margin-top:16px;"><a href="${escapeHtml(args.podUrl)}" style="color:${BRAND_COLOR};">View proof of delivery</a></p>` : ''}
        </div>
        ${footer(args.unsubscribeUrl)}
      </div>
    </div>
  `;
}

export function invoicePaidTemplate(args: {
  invoiceNumber: string;
  hospitalName?: string | null;
  vendorName?: string | null;
  amountCents: number;
  currency?: string;
  paidAt?: string | null;
  receiptUrl?: string | null;
  unsubscribeUrl?: string | null;
}): string {
  const amount = (args.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: args.currency ?? 'USD' });
  return `
    <div style="background:#f5f6f8;padding:24px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:6px;overflow:hidden;">
        ${header('Payment received')}
        <div style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#222;">
          <p style="font-size:14px;">We've received your payment of <strong>${amount}</strong> for invoice <strong>${escapeHtml(args.invoiceNumber)}</strong>.</p>
          ${args.vendorName ? `<p style="font-size:13px;color:#555;">Vendor: ${escapeHtml(args.vendorName)}</p>` : ''}
          ${args.paidAt ? `<p style="font-size:13px;color:#555;">Paid: ${escapeHtml(args.paidAt)}</p>` : ''}
          ${args.receiptUrl ? `<p style="margin-top:16px;"><a href="${escapeHtml(args.receiptUrl)}" style="color:${BRAND_COLOR};">View receipt</a></p>` : ''}
        </div>
        ${footer(args.unsubscribeUrl)}
      </div>
    </div>
  `;
}

export function recurringUpcomingTemplate(args: {
  order: OrderLite;
  nextOccurrenceDate: string;
  cadence: string;
  manageUrl?: string | null;
  unsubscribeUrl?: string | null;
}): string {
  return `
    <div style="background:#f5f6f8;padding:24px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:6px;overflow:hidden;">
        ${header('Upcoming recurring order')}
        <div style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#222;">
          <p style="font-size:14px;">Your next recurring order from <strong>${escapeHtml(args.order.vendorName ?? 'your vendor')}</strong> is scheduled for <strong>${escapeHtml(args.nextOccurrenceDate)}</strong> (${escapeHtml(args.cadence)}).</p>
          <p style="font-size:13px;color:#555;">If you want to skip, pause, or modify this delivery, please act before that date.</p>
          ${args.manageUrl ? `<p style="margin-top:16px;"><a href="${escapeHtml(args.manageUrl)}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;font-size:13px;">Manage schedule</a></p>` : ''}
        </div>
        ${footer(args.unsubscribeUrl)}
      </div>
    </div>
  `;
}

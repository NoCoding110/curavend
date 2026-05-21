/**
 * Perspective-aware invoice status display.
 *
 * The canonical DB enum (`ORDER_COMPLETED` → `SPEND_CONFIRMED` →
 * `INVOICE_GENERATED` → `INVOICE_SENT` → `INVOICE_PAID`) describes a single
 * state machine, but vendors and hospitals sit on opposite sides of it:
 * a vendor *sends* an invoice, a hospital *receives* it. This helper maps
 * (status, perspective) → (label, color) so the same row renders with the
 * right verb in each portal. Admin sees the raw canonical labels so internal
 * operations and exports stay unambiguous.
 */

export type InvoiceStatus =
  | 'ORDER_COMPLETED'
  | 'SPEND_CONFIRMED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID';

export type Perspective = 'VENDOR' | 'HOSPITAL' | 'ADMIN';

const COLOR_MAP: Record<InvoiceStatus, string> = {
  ORDER_COMPLETED: 'blue',
  SPEND_CONFIRMED: 'orange',
  INVOICE_GENERATED: 'purple',
  INVOICE_SENT: 'cyan',
  INVOICE_PAID: 'green',
};

const LABELS: Record<Perspective, Record<InvoiceStatus, string>> = {
  VENDOR: {
    ORDER_COMPLETED: 'Pending Spend Confirmation',
    SPEND_CONFIRMED: 'Spend Confirmed',
    INVOICE_GENERATED: 'Invoice Drafted',
    INVOICE_SENT: 'Invoice Sent',
    INVOICE_PAID: 'Paid',
  },
  HOSPITAL: {
    ORDER_COMPLETED: 'Spend Confirmation Needed',
    SPEND_CONFIRMED: 'Spend Confirmed',
    INVOICE_GENERATED: 'Invoice Pending from Vendor',
    INVOICE_SENT: 'Invoice Received',
    INVOICE_PAID: 'Paid',
  },
  ADMIN: {
    ORDER_COMPLETED: 'Order Completed',
    SPEND_CONFIRMED: 'Spend Confirmed',
    INVOICE_GENERATED: 'Invoice Generated',
    INVOICE_SENT: 'Invoice Sent',
    INVOICE_PAID: 'Invoice Paid',
  },
};

export function perspectiveFromUserType(userType?: string | null): Perspective {
  if (userType === 'VENDOR') return 'VENDOR';
  if (userType === 'HOSPITAL') return 'HOSPITAL';
  return 'ADMIN';
}

export function getInvoiceStatusDisplay(
  status: InvoiceStatus | string | undefined | null,
  perspective: Perspective,
): { label: string; color: string } {
  if (!status) return { label: '—', color: 'default' };
  const safeStatus = status as InvoiceStatus;
  const label = LABELS[perspective]?.[safeStatus] ?? String(status);
  const color = COLOR_MAP[safeStatus] ?? 'default';
  return { label, color };
}

/**
 * Tab list for the billing list page.
 * Hospital omits `INVOICE_GENERATED` — that's a vendor-internal draft state
 * and the hospital list hides those rows by default anyway.
 */
export function getInvoiceStatusTabs(
  perspective: Perspective,
): Array<{ key: string; label: string }> {
  const ALL = { key: 'ALL', label: 'All' };
  const order: InvoiceStatus[] =
    perspective === 'HOSPITAL'
      ? ['ORDER_COMPLETED', 'SPEND_CONFIRMED', 'INVOICE_SENT', 'INVOICE_PAID']
      : [
          'ORDER_COMPLETED',
          'SPEND_CONFIRMED',
          'INVOICE_GENERATED',
          'INVOICE_SENT',
          'INVOICE_PAID',
        ];
  return [
    ALL,
    ...order.map((s) => ({ key: s, label: LABELS[perspective][s] })),
  ];
}

// ──────────────────────────────────────────────
// Notification types
// ──────────────────────────────────────────────

export type RedirectTo =
  | 'ORDER'
  | 'INVOICE'
  | 'FACILITY_USER'
  | 'VENDOR_USER'
  | 'ROOM'
  | 'SUPPORT_TICKET'
  | 'NO_REDIRECT';

/** In-app notification record. */
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  redirectTo: RedirectTo;
  redirectId: string | null;
  isRead: boolean;
  readAt: string | null;
  hospitalId: string | null;
  vendorId: string | null;
  providerId: string | null;
  superVendorId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  roomId: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

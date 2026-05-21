// ──────────────────────────────────────────────
// Invoice & Purchase-Order types
// ──────────────────────────────────────────────

export type InvoiceStatus =
  | 'ORDER_COMPLETED'
  | 'SPEND_CONFIRMED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID';

export type PurchaseOrderStatus = 'ORDER_COMPLETED' | 'EXPORTED';

/** Single line item on an invoice. */
export interface InvoiceItem {
  id: string;
  invoiceId: string;
  orderId: string;
  orderNumber: string | null;
  productName: string;
  productCode: string | null;
  hcpcsCode: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payment details associated with an invoice. */
export interface PaymentDetails {
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentDate: string | null;
  paymentAmount: number | null;
  notes: string | null;
}

/** Invoice record grouping one or more completed orders. */
export interface Invoice {
  id: string;
  invoiceNumber: string;
  hospitalId: string;
  hospitalName: string | null;
  providerId: string | null;
  providerName: string | null;
  vendorId: string;
  vendorName: string | null;
  superVendorId: string | null;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  paymentDetails: PaymentDetails | null;
  pdfUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

/** Single line item on a purchase order. */
export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  orderId: string;
  orderNumber: string | null;
  productName: string;
  productCode: string | null;
  hcpcsCode: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Purchase order generated from completed orders for ERP export. */
export interface PurchaseOrder {
  id: string;
  purchaseOrderNumber: string;
  hospitalId: string;
  hospitalName: string | null;
  providerId: string | null;
  providerName: string | null;
  vendorId: string;
  vendorName: string | null;
  superVendorId: string | null;
  status: PurchaseOrderStatus;
  orderDate: string;
  totalAmount: number;
  blanketPurchaseOrderNumber: string | null;
  erpAccountNumber: string | null;
  notes: string | null;
  exportedAt: string | null;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}

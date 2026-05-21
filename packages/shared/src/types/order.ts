// ──────────────────────────────────────────────
// Order-related types
// ──────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED';

export type OrderSubStatus =
  | 'NEW_ORDER'
  | 'VENDOR_ASSIGNED'
  | 'VENDOR_CONFIRMED_RECEIPT'
  | 'VENDOR_DECLINED'
  | 'FACILITY_CANCELLED'
  | 'ORDER_REQUESTED_FOR_MODIFY'
  | 'PATIENT_VISITED_AND_ASSESSED'
  | 'DELIVERED'
  | 'PROOF_UPLOADED'
  | 'ORDER_COMPLETED';

export type EpicOrderStatus =
  | 'draft'
  | 'active'
  | 'on_hold'
  | 'revoked'
  | 'completed'
  | 'entered_in_error'
  | 'unknown';

export type Intent =
  | 'proposal'
  | 'plan'
  | 'directive'
  | 'order'
  | 'original_order'
  | 'reflex_order'
  | 'filler_order'
  | 'instance_order'
  | 'option';

export type Priority = 'routine' | 'urgent' | 'asap' | 'stat';

export type AgreementSendMethod = 'EMAIL' | 'PRINT' | 'BOTH' | 'NONE';

/** Single line item within an order. */
export interface OrderItem {
  id: string;
  orderId: string;
  productName: string;
  productCode: string | null;
  hcpcsCode: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A record of sub-status changes within an order. */
export interface OrderSubStatusHistory {
  id: string;
  orderId: string;
  subStatus: OrderSubStatus;
  changedBy: string;
  changedByName: string | null;
  notes: string | null;
  createdAt: string;
}

/** Full audit history entry for an order. */
export interface OrderHistory {
  id: string;
  orderId: string;
  action: string;
  performedBy: string;
  performedByName: string | null;
  details: string | null;
  createdAt: string;
}

/** Delivery proof item attached to an order. */
export interface DeliveryItem {
  id: string;
  orderId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedBy: string;
  uploadedByName: string | null;
  notes: string | null;
  createdAt: string;
}

/** Patient demographics embedded in an order. */
export interface PatientInfo {
  firstName: string;
  lastName: string;
  middleName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  mrn: string | null;
  ssn: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceGroupNumber: string | null;
}

/** Core order record. */
export interface Order {
  id: string;
  orderNumber: string;
  hospitalId: string;
  hospitalName: string | null;
  providerId: string | null;
  providerName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  superVendorId: string | null;
  patientInfo: PatientInfo | null;
  status: OrderStatus;
  subStatus: OrderSubStatus;
  epicOrderStatus: EpicOrderStatus | null;
  intent: Intent | null;
  priority: Priority;
  orderDate: string;
  requiredByDate: string | null;
  deliveryDate: string | null;
  completedDate: string | null;
  cancelledDate: string | null;
  totalAmount: number;
  notes: string | null;
  internalNotes: string | null;
  agreementSendMethod: AgreementSendMethod | null;
  agreementSentAt: string | null;
  agreementSignedAt: string | null;
  agreementSignedBy: string | null;
  fhirOrderId: string | null;
  fhirEncounterId: string | null;
  isRead: boolean;
  isModified: boolean;
  assignedBy: string | null;
  assignedByName: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  items: OrderItem[];
  subStatusHistory: OrderSubStatusHistory[];
  history: OrderHistory[];
  deliveryItems: DeliveryItem[];
  createdAt: string;
  updatedAt: string;
}

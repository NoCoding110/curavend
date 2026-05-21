// ──────────────────────────────────────────────
// Support ticket types
// ──────────────────────────────────────────────

export type TicketStatus = 'OPEN' | 'CLOSED';

export type TicketSubject =
  | 'ACCOUNT'
  | 'PRICING'
  | 'ORDER'
  | 'CONTRACT'
  | 'INVOICE'
  | 'OTHER';

/** Single reply in a support ticket thread. */
export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string | null;
  senderUserType: string;
  message: string;
  attachments: SupportTicketAttachment[] | null;
  createdAt: string;
}

/** File attached to a support ticket message. */
export interface SupportTicketAttachment {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

/** Support ticket record. */
export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: TicketSubject;
  title: string;
  description: string;
  status: TicketStatus;
  createdBy: string;
  createdByName: string | null;
  createdByUserType: string;
  assignedTo: string | null;
  assignedToName: string | null;
  hospitalId: string | null;
  hospitalName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  providerId: string | null;
  providerName: string | null;
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  messages: SupportTicketMessage[];
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

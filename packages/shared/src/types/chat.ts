// ──────────────────────────────────────────────
// Chat / messaging types
// ──────────────────────────────────────────────

export type RoomStatus = 'ACTIVE' | 'ARCHIVE';

export type ReceiverUserType = 'ADMIN' | 'HOSPITAL' | 'VENDOR';

/** Content payload of a single chat message. */
export interface MessageContent {
  text: string | null;
  attachments: MessageAttachment[] | null;
}

/** File attachment within a chat message. */
export interface MessageAttachment {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

/** Single chat message within a room. */
export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string | null;
  senderUserType: ReceiverUserType;
  content: MessageContent;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Chat room linking two or more parties. */
export interface Room {
  id: string;
  name: string | null;
  orderId: string | null;
  orderNumber: string | null;
  hospitalId: string | null;
  hospitalName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  providerId: string | null;
  providerName: string | null;
  superVendorId: string | null;
  status: RoomStatus;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  participantIds: string[];
  unreadCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

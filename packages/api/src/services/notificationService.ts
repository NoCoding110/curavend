// services/notificationService.ts
import { D1Database } from '@cloudflare/workers-types';
import { getDb } from '../lib/db';
import { notifications } from '@curavend/db';

export interface NotificationPayload {
  receiverId: string;
  message: string;
  redirectTo: string; // ORDER | INVOICE | FACILITY_USER | VENDOR_USER | ROOM | SUPPORT_TICKET | NO_REDIRECT
  redirectId?: string; // orderId, invoiceId, etc.
}

export class NotificationService {
  private db: ReturnType<typeof getDb>;

  constructor(d1: D1Database) {
    this.db = getDb(d1);
  }

  async createNotification(payload: NotificationPayload): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(notifications).values({
      id,
      receiverId: payload.receiverId,
      message: payload.message,
      redirectTo: payload.redirectTo,
      redirectId: payload.redirectId ?? null,
      isRead: 0,
      createdAt: now,
    });
  }

  async createOrderStatusNotification(
    receiverId: string,
    orderId: string,
    orderIdentifier: string,
    newStatus: string,
  ): Promise<void> {
    const statusMessages: Record<string, string> = {
      VENDOR_ASSIGNED: `Order ${orderIdentifier} has been assigned to a vendor`,
      VENDOR_CONFIRMED_RECEIPT: `Vendor confirmed receipt of order ${orderIdentifier}`,
      VENDOR_DECLINED: `Vendor declined order ${orderIdentifier}`,
      FACILITY_CANCELLED: `Order ${orderIdentifier} was cancelled`,
      ORDER_REQUESTED_FOR_MODIFY: `Modification requested for order ${orderIdentifier}`,
      PATIENT_VISITED_AND_ASSESSED: `Patient visited for order ${orderIdentifier}`,
      DELIVERED: `Order ${orderIdentifier} has been delivered`,
      PROOF_UPLOADED: `Proof of delivery uploaded for order ${orderIdentifier}`,
      ORDER_COMPLETED: `Order ${orderIdentifier} has been completed`,
    };

    await this.createNotification({
      receiverId,
      message: statusMessages[newStatus] ?? `Order ${orderIdentifier} status changed to ${newStatus}`,
      redirectTo: 'ORDER',
      redirectId: orderId,
    });
  }
}

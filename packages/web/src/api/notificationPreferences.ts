import { get, post, put, del } from './client';

export type NotificationEventType =
  | 'ORDER_CONFIRMATION'
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID'
  | 'INVOICE_OVERDUE'
  | 'CONTRACT_SUBMITTED'
  | 'CONTRACT_APPROVED'
  | 'CONTRACT_REJECTED'
  | 'RECURRING_ORDER_UPCOMING'
  | 'RECURRING_ORDER_PAUSED';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'IN_APP' | 'WEBHOOK';
export type NotificationRecipientType = 'PATIENT' | 'CONTACT' | 'ORDERER' | 'CLINICIAN' | 'PROCUREMENT_TEAM' | 'CUSTOM';

export interface NotificationPreference {
  id: string;
  scopeType: 'HOSPITAL' | 'VENDOR' | 'PROVIDER' | 'USER';
  scopeId: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  recipientType: NotificationRecipientType;
  customEmail: string | null;
  customPhone: string | null;
  customWebhookUrl: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export const notificationPreferencesApi = {
  list: (params: { scopeType: string; scopeId: string; eventType?: string }) =>
    get<{ items: NotificationPreference[] }>('/notification-preferences', params),
  create: (data: {
    scopeType: string;
    scopeId: string;
    eventType: NotificationEventType;
    channel: NotificationChannel;
    recipientType: NotificationRecipientType;
    customEmail?: string;
    customPhone?: string;
    customWebhookUrl?: string;
    isActive?: boolean;
  }) => post<NotificationPreference>('/notification-preferences', data),
  update: (
    id: string,
    data: Partial<{ isActive: boolean; customEmail: string; customPhone: string; customWebhookUrl: string }>,
  ) => put<NotificationPreference>(`/notification-preferences/${id}`, data),
  delete: (id: string) => del<{ success: boolean }>(`/notification-preferences/${id}`),
};

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  'ORDER_CONFIRMATION',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'INVOICE_SENT',
  'INVOICE_PAID',
  'INVOICE_OVERDUE',
  'CONTRACT_SUBMITTED',
  'CONTRACT_APPROVED',
  'CONTRACT_REJECTED',
  'RECURRING_ORDER_UPCOMING',
  'RECURRING_ORDER_PAUSED',
];

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'IN_APP', 'WEBHOOK'];
export const NOTIFICATION_RECIPIENT_TYPES: NotificationRecipientType[] = [
  'PATIENT',
  'CONTACT',
  'ORDERER',
  'CLINICIAN',
  'PROCUREMENT_TEAM',
  'CUSTOM',
];

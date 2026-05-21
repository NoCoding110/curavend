import { get, post, put, del } from './client';

export type CarrierCode = 'USPS' | 'UPS' | 'FEDEX' | 'DHL' | 'ONTRAC' | 'OTHER' | 'NONE';

export interface Shipment {
  id: string;
  orderId: string;
  shipmentSequence: number;
  carrierCode: CarrierCode | null;
  carrierServiceLevel: string | null;
  trackingNumber: string | null;
  trackingUrl?: string | null;
  shipmentDate: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  signatureRequired: number;
  insuredValueCents: number | null;
  hazmatFlag: number;
  weightGrams: number | null;
  dimensionsCm: string | null;
  shipFromAddress: string | null;
  shipToAddress: string | null;
  latestStatus: string | null;
  latestStatusAt: string | null;
  latestStatusLocation: string | null;
  podAttachment: string | null;
  podSignedBy: string | null;
  podSignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingWriteInput {
  carrierCode?: CarrierCode | null;
  carrierServiceLevel?: string | null;
  trackingNumber: string;
  shipmentDate?: string;
  expectedDeliveryDate?: string;
  signatureRequired?: boolean;
  insuredValueCents?: number | null;
}

export interface BulkTrackingItem {
  orderIdentifier: string;
  carrierCode?: CarrierCode | null;
  carrierServiceLevel?: string;
  trackingNumber: string;
  shipmentDate?: string;
  expectedDeliveryDate?: string;
}

export interface BulkTrackingResponse {
  dryRun: boolean;
  results: Array<{ orderIdentifier: string; status: 'OK' | 'FAILED'; error?: string }>;
  succeeded: number;
  failed: number;
}

export const shipmentsApi = {
  listCarriers: () => get<{ items: Array<{ code: string; name: string }> }>('/carriers'),
  listForOrder: (orderId: string) => get<{ items: Shipment[] }>(`/orders/${orderId}/shipments`),
  createForOrder: (orderId: string, data: Partial<Shipment> & { trackingNumber?: string }) =>
    post<Shipment>(`/orders/${orderId}/shipments`, data),
  setTracking: (orderId: string, data: TrackingWriteInput) =>
    put<{ success: boolean; trackingNumber: string }>(`/orders/${orderId}/tracking`, data),
  updateShipment: (shipmentId: string, data: Partial<Shipment>) =>
    put<Shipment>(`/shipments/${shipmentId}`, data),
  deleteShipment: (shipmentId: string) => del<{ success: boolean }>(`/shipments/${shipmentId}`),
  bulkTracking: (data: { idempotencyKey?: string; dryRun?: boolean; items: BulkTrackingItem[] }) =>
    post<BulkTrackingResponse>('/orders/bulk-tracking', data),
};

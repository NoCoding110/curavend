/**
 * Goods Receipt + Three-Way Match API client.
 */
import { get, post, put, del } from './client';

export const RECEIPT_CONDITIONS = ['GOOD', 'DAMAGED', 'EXPIRED', 'WRONG_ITEM', 'SHORT_SHIPPED', 'OVERSHIPPED'] as const;
export const GRN_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;
export const MATCH_STATUSES = [
  'PERFECT',
  'QTY_VARIANCE',
  'PRICE_VARIANCE',
  'NO_RECEIPT',
  'NO_PO',
  'CONDITION_BAD',
  'AMBIGUOUS',
] as const;

export interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  orderId: string | null;
  purchaseOrderId: string | null;
  hospitalId: string;
  vendorId: string | null;
  facilityId: string | null;
  receivedAt: string;
  receivedByUserId: string;
  carrier: string | null;
  trackingNumber: string | null;
  packingSlipNumber: string | null;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  notes: string | null;
  photoBlobKeys?: string[];
  postedAt: string | null;
  postedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptLine {
  id: string;
  receiptId: string;
  orderItemId: string | null;
  hcpcCode: string;
  description: string | null;
  quantityOrdered: number | null;
  quantityReceived: number;
  quantityRejected: number;
  condition: string;
  lotNumber: string | null;
  serialNumber: string | null;
  expirationDate: string | null;
  notes: string | null;
}

export interface ThreeWayMatch {
  id: string;
  invoiceId: string;
  invoiceItemId: string;
  orderId: string | null;
  orderItemId: string | null;
  receiptLineId: string | null;
  hcpcCode: string;
  matchStatus: typeof MATCH_STATUSES[number];
  poQuantity: number | null;
  poUnitPriceUsd: number | null;
  receivedQuantity: number | null;
  receivedCondition: string | null;
  invoiceQuantity: number | null;
  invoiceUnitPriceUsd: number | null;
  qtyVariance: number | null;
  priceVariance: number | null;
  priceVariancePct: number | null;
  notes: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  computedAt: string;
}

export const receivingApi = {
  listReceipts: (params?: { orderId?: string; status?: string; hospitalId?: string }) =>
    get<{ items: GoodsReceipt[] }>('/goods-receipts', params as Record<string, string> | undefined),
  createReceipt: (body: any) => post<{ id: string; receiptNumber: string }>('/goods-receipts', body),
  getReceipt: (id: string) =>
    get<GoodsReceipt & { lines: GoodsReceiptLine[] }>(`/goods-receipts/${id}`),
  updateReceipt: (id: string, patch: any) => put<{ updated: boolean }>(`/goods-receipts/${id}`, patch),
  addLine: (id: string, body: any) => post<{ id: string }>(`/goods-receipts/${id}/lines`, body),
  updateLine: (id: string, lid: string, patch: any) =>
    put<{ updated: boolean }>(`/goods-receipts/${id}/lines/${lid}`, patch),
  removeLine: (id: string, lid: string) =>
    del<{ deleted: boolean }>(`/goods-receipts/${id}/lines/${lid}`),
  postReceipt: (id: string) => post<{ status: string }>(`/goods-receipts/${id}/post`, {}),
  cancelReceipt: (id: string) => post<{ status: string }>(`/goods-receipts/${id}/cancel`, {}),
};

export const matchingApi = {
  run: (invoiceId: string) =>
    post<{ invoiceId: string; total: number; byStatus: Record<string, number>; results: any[] }>(
      `/three-way-match/run/${invoiceId}`,
      {},
    ),
  forInvoice: (invoiceId: string) =>
    get<{ items: ThreeWayMatch[] }>(`/three-way-match/invoice/${invoiceId}`),
  exceptions: (params?: { matchStatus?: string }) =>
    get<{ items: ThreeWayMatch[] }>('/three-way-match/exceptions', params as Record<string, string> | undefined),
  resolve: (matchId: string, body: { resolution: 'ACCEPTED' | 'DISPUTED' | 'OVERRIDDEN'; notes?: string }) =>
    post<{ resolution: string }>(`/three-way-match/${matchId}/resolve`, body),
};

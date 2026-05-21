import { get, post, put, del } from './client';

export type CustomerPoStatus = 'OPEN' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';

export interface CustomerPurchaseOrder {
  id: string;
  hospitalId: string;
  poNumber: string;
  poDate: string;
  authorizedAmount: number | null;
  spentAmount: number;
  expiresAt: string | null;
  notes: string | null;
  status: CustomerPoStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPurchaseOrderDetail extends CustomerPurchaseOrder {
  linkedOrders: Array<{
    id: string;
    identifier: string | null;
    status: string;
    orderSubStatus: string;
    createdAt: string;
  }>;
}

export const customerPurchaseOrdersApi = {
  list: (params?: { status?: CustomerPoStatus; limit?: number; offset?: number }) =>
    get<{ items: CustomerPurchaseOrder[]; total: number }>('/customer-purchase-orders', params),
  get: (id: string) => get<CustomerPurchaseOrderDetail>(`/customer-purchase-orders/${id}`),
  create: (data: {
    poNumber: string;
    poDate: string;
    authorizedAmount?: number;
    expiresAt?: string;
    notes?: string;
    hospitalId?: string;
  }) => post<CustomerPurchaseOrder>('/customer-purchase-orders', data),
  update: (
    id: string,
    data: Partial<{ notes: string | null; authorizedAmount: number; expiresAt: string | null; poDate: string }>,
  ) => put<CustomerPurchaseOrder>(`/customer-purchase-orders/${id}`, data),
  close: (id: string, status: 'EXHAUSTED' | 'CANCELLED' = 'EXHAUSTED') =>
    post<{ success: boolean; status: CustomerPoStatus }>(`/customer-purchase-orders/${id}/close`, { status }),
  delete: (id: string) => del<{ success: boolean }>(`/customer-purchase-orders/${id}`),
};

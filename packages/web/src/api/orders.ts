import { get, post, put } from './client';

export const ordersApi = {
  // POST keeps the `search` filter (which may be a patient name / PHI) out of
  // the URL query string. Backend serves the same logic on GET and POST /query.
  list: (params?: Record<string, any>) => post<any>('/orders/query', params ?? {}),
  get: (id: string) => get<any>(`/orders/${id}`),
  create: (data: any) => post<any>('/orders', data),
  update: (id: string, data: any) => put<any>(`/orders/${id}`, data),
  updateStatus: (id: string, data: { orderSubStatus: string; reason?: string }) =>
    put<any>(`/orders/${id}/status`, data),
  assignVendor: (id: string, vendorId: string) =>
    put<any>(`/orders/${id}/assign-vendor`, { vendorId }),
};

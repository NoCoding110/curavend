import apiClient from './client';
import { get, put, post } from './client';

export const invoicesApi = {
  list: (params?: Record<string, any>) => get<any>('/invoices', params),
  get: (id: string) => get<any>(`/invoices/${id}`),
  update: (id: string, data: any) => put<any>(`/invoices/${id}`, data),
  confirmSpend: (id: string, data: any) => put<any>(`/invoices/${id}/confirm-spend`, data),
  generate: (id: string) => put<any>(`/invoices/${id}/generate`, {}),
  send: (id: string) => put<any>(`/invoices/${id}/send`, {}),
  markPaid: (id: string, data: any) => put<any>(`/invoices/${id}/mark-paid`, data),

  exportCsv: async (params?: Record<string, any>): Promise<void> => {
    const response = await apiClient.get('/invoices/export.csv', {
      params,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoices.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  importPayments: (csvText: string) =>
    post<{ processed: number; failed: number; results: any[] }>('/invoices/import-payments', { csv: csvText }),

  /**
   * Mint a Stripe Checkout session for paying an invoice. Returns the
   * Checkout URL; the frontend should redirect the user there.
   */
  createCheckoutSession: (id: string) =>
    post<{ id: string; url: string; expires_at: number }>(`/invoices/${id}/checkout-session`, {}),
};

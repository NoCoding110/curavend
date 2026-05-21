import { get } from './client';

export const reportsApi = {
  executiveSummary: (params?: Record<string, any>) => get<any>('/reports/executive-summary', params),
  spendByVendor: (params?: Record<string, any>) => get<any>('/reports/spend-by-vendor', params),
  spendByHcpc: (params?: Record<string, any>) => get<any>('/reports/spend-by-hcpc', params),
  spendByMonth: (params?: Record<string, any>) => get<any>('/reports/spend-by-month', params),
  ordersByStatus: (params?: Record<string, any>) => get<any>('/reports/orders-by-status', params),
  ordersByVendor: (params?: Record<string, any>) => get<any>('/reports/orders-by-vendor', params),
  vendorKpis: (params?: Record<string, any>) => get<any>('/reports/vendor-kpis', params),
};

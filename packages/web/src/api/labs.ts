import { get, post, put, del } from './client';

export interface LabGroup {
  id: string;
  name: string;
  groupType: 'SINGLE_SITE' | 'D2P';
  vendorId?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabKitSite {
  id: string;
  labGroupId: string;
  siteName: string;
  siteNumber?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

export interface LabOrder {
  id: string;
  orderNumber: string;
  labGroupId: string;
  kitSiteId?: string | null;
  patientName?: string | null;
  patientLastName?: string | null;
  status: string;
  readyForApproval: number;
  trfBlobKey?: string | null;
  shippingLabelBlobKey?: string | null;
  returnLabelBlobKey?: string | null;
  stickersBlobKey?: string | null;
  consolidatedAssetsBlobKey?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  rejectionReason?: string | null;
  testList?: string | null;
  dxCodeList?: string | null;
  // QC + external vendor (athome parity)
  qcStatus?: string | null;
  qcAttemptCount?: number | null;
  qcPermanentlyFailed?: number | null;
  qcFailureReason?: string | null;
  externalVendorName?: string | null;
  externalVendorStatus?: string | null;
  externalOrderRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabOrderItem {
  testCode?: string | null;
  testName?: string | null;
  specimenType?: string | null;
  barcode?: string | null;
  quantity: number;
}

export const labsApi = {
  // Groups
  listGroups: () => get<{ data: LabGroup[] }>('/labs/groups'),
  createGroup: (body: Partial<LabGroup>) => post<LabGroup>('/labs/groups', body),
  updateGroup: (id: string, body: Partial<LabGroup>) => put<any>(`/labs/groups/${id}`, body),
  deleteGroup: (id: string) => del<any>(`/labs/groups/${id}`),

  // Kit sites
  listKitSites: () => get<{ data: LabKitSite[] }>('/labs/kit-sites'),
  createKitSite: (body: Partial<LabKitSite>) => post<LabKitSite>('/labs/kit-sites', body),
  updateKitSite: (id: string, body: Partial<LabKitSite>) => put<any>(`/labs/kit-sites/${id}`, body),
  deleteKitSite: (id: string) => del<any>(`/labs/kit-sites/${id}`),

  // Orders
  listOrders: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    get<{ data: LabOrder[]; total: number; limit: number; offset: number }>('/labs/orders', params),
  getOrder: (id: string) =>
    get<{ data: LabOrder & { items: LabOrderItem[] } }>(`/labs/orders/${id}`),
  createOrder: (body: any) => post<{
    id: string;
    orderNumber: string;
    workflowInstanceId: string | null;
    consumption?: {
      attempted: number;
      fullyIssued: number;
      shortages: Array<{
        testCode: string;
        consumableId: string;
        consumableCode: string;
        requested: number;
        issued: number;
        short: number;
        isCritical: boolean;
      }>;
    };
  }>(
    '/labs/orders',
    body,
  ),
  updateOrder: (id: string, body: any) => put<any>(`/labs/orders/${id}`, body),
  approveOrder: (id: string) => post<any>(`/labs/orders/${id}/approve`),
  rejectOrder: (id: string, reason: string) =>
    post<any>(`/labs/orders/${id}/reject`, { reason }),
  getWorkflow: (id: string) => get<{ data: any }>(`/labs/orders/${id}/workflow`),

  // Asset PDF URLs (browser will navigate to these)
  trfPdfUrl: (id: string) => `/api/labs/orders/${id}/trf.pdf`,
  shippingLabelPdfUrl: (id: string) => `/api/labs/orders/${id}/shipping-label.pdf`,
  returnLabelPdfUrl: (id: string) => `/api/labs/orders/${id}/return-label.pdf`,
  stickersPdfUrl: (id: string) => `/api/labs/orders/${id}/stickers.pdf`,
  consolidatedPdfUrl: (id: string) => `/api/labs/orders/${id}/consolidated.pdf`,

  // Dashboard + reports
  dashboardCounts: () =>
    get<{ counts: Record<string, number>; total: number }>('/labs/dashboard/counts'),
  ordersXlsxUrl: () => `/api/labs/orders.xlsx`,
};

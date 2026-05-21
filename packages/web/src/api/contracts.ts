import { get, post, put, del } from './client';

export type ContractStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'TERMINATED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type ContractInitiator = 'HOSPITAL' | 'VENDOR' | 'ADMIN';

export interface ContractListItem {
  id: string;
  name: string | null;
  vendorId: string | null;
  vendor: string | null;
  hospitalId: string | null;
  hospital: string | null;
  startDate: string;
  endDate: string;
  s3key: string | null;
  status: ContractStatus;
  initiatedBy: ContractInitiator | null;
  currentRevisionId: string | null;
  parentContractId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDetail extends ContractListItem {
  terminatedAt: string | null;
  terminatedBy: string | null;
  terminationReason: string | null;
  rejectedReason: string | null;
  itemCategories: string | null;
  superVendorId: string | null;
  providerId: string | null;
  permissions: {
    isDrafter: boolean;
    canReview: boolean;
    canWrite: boolean;
  };
}

export interface ContractItem {
  id: string;
  contractId: string;
  hcpcCode: string;
  description: string | null;
  negotiatedRate: number;
  quantity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractRevision {
  id: string;
  revisionNumber: number;
  s3key: string | null;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  submittedByUserId: string;
  submittedAt: string;
  submittedByEmail: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewDecision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | null;
  reviewComment: string | null;
}

export interface ContractRevisionDetail extends ContractRevision {
  contractId: string;
  itemsSnapshot: string;
  items: Array<{ hcpcCode: string; description: string | null; rate: number; quantity: number | null }>;
}

export interface ContractHistoryRow {
  id: string;
  description: string;
  changedByUserId: string | null;
  changedByEmail: string | null;
  createdAt: string;
}

export interface AiContractItemSuggestion {
  hcpcCode: string;
  description: string | null;
  rate: number;
  quantity: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export const contractsApi = {
  // ── list + CRUD ──────────────────────────────────────────────────────
  list: (params?: Record<string, any>) =>
    get<{ items: ContractListItem[]; total: number }>('/contracts', params),
  get: (id: string) => get<ContractDetail>(`/contracts/${id}`),
  create: (data: any) => post<ContractListItem>('/contracts', data),
  update: (id: string, data: any) => put<ContractListItem>(`/contracts/${id}`, data),
  delete: (id: string) => del<{ success: boolean }>(`/contracts/${id}`),

  // ── items ────────────────────────────────────────────────────────────
  listItems: (id: string) => get<{ items: ContractItem[] }>(`/contracts/${id}/items`),
  addItem: (id: string, data: { hcpcCode: string; description?: string | null; negotiatedRate: number; quantity?: number | null }) =>
    post<ContractItem>(`/contracts/${id}/items`, data),
  updateItem: (id: string, itemId: string, data: Partial<{ hcpcCode: string; description: string | null; negotiatedRate: number; quantity: number | null }>) =>
    put<ContractItem>(`/contracts/${id}/items/${itemId}`, data),
  deleteItem: (id: string, itemId: string) => del<{ success: boolean }>(`/contracts/${id}/items/${itemId}`),

  // ── transitions ──────────────────────────────────────────────────────
  submit: (id: string) => post<{ success: boolean; revisionId: string; revisionNumber: number }>(`/contracts/${id}/submit`),
  withdraw: (id: string) => post<{ success: boolean; status: ContractStatus }>(`/contracts/${id}/withdraw`),
  approve: (id: string) => post<{ success: boolean; status: ContractStatus }>(`/contracts/${id}/approve`),
  reject: (id: string, reason: string) => post<{ success: boolean; status: ContractStatus }>(`/contracts/${id}/reject`, { reason }),
  requestChanges: (id: string, comment: string) =>
    post<{ success: boolean; status: ContractStatus; comment: string }>(`/contracts/${id}/request-changes`, { comment }),
  reopen: (id: string) => post<{ success: boolean; status: ContractStatus }>(`/contracts/${id}/reopen`),
  terminate: (id: string, reason: string) => post<{ success: boolean; status: ContractStatus }>(`/contracts/${id}/terminate`, { reason }),
  amend: (id: string) => post<{ success: boolean; id: string; parentContractId: string }>(`/contracts/${id}/amend`),

  // ── revisions + history ──────────────────────────────────────────────
  listRevisions: (id: string) => get<{ items: ContractRevision[] }>(`/contracts/${id}/revisions`),
  getRevision: (id: string, revId: string) => get<ContractRevisionDetail>(`/contracts/${id}/revisions/${revId}`),
  listHistory: (id: string) => get<{ items: ContractHistoryRow[] }>(`/contracts/${id}/history`),

  // ── AI extraction ────────────────────────────────────────────────────
  extractFromPdf: (id: string, imageBase64: string) =>
    post<{ suggestions: AiContractItemSuggestion[] }>(`/contracts/${id}/extract-from-pdf`, { imageBase64 }),

  // ── fee-schedules (legacy, kept for backwards compatibility) ────────
  listFeeSchedules: (params?: Record<string, any>) => get<any>('/contracts/fee-schedules', params),
  getFeeSchedule: (id: string) => get<any>(`/contracts/fee-schedules/${id}`),
  createFeeSchedule: (data: any) => post<any>('/contracts/fee-schedules', data),
  addFeeScheduleItem: (scheduleId: string, data: any) => post<any>(`/contracts/fee-schedules/${scheduleId}/items`, data),
  updateFeeScheduleItem: (scheduleId: string, itemId: string, data: any) =>
    put<any>(`/contracts/fee-schedules/${scheduleId}/items/${itemId}`, data),
  deleteFeeScheduleItem: (scheduleId: string, itemId: string) =>
    del<any>(`/contracts/fee-schedules/${scheduleId}/items/${itemId}`),
};

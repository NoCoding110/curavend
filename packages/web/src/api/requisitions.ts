/**
 * Requisitions API client.
 */
import { get, post, put, del } from './client';

export const REQUISITION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CONVERTED',
  'CANCELLED',
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type RequisitionPriority = (typeof REQUISITION_PRIORITIES)[number];

export interface Requisition {
  id: string;
  requisitionNumber: string;
  hospitalId: string;
  facilityId: string | null;
  departmentId: string | null;
  requestedByUserId: string;
  title: string;
  justification: string | null;
  status: RequisitionStatus;
  priority: RequisitionPriority;
  neededByDate: string | null;
  estimatedTotalUsd: number | null;
  approverUserId: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  convertedAt: string | null;
  convertedOrderIds?: string[];
  payorId: string | null;
  priorAuthId: string | null;
  templateId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequisitionItem {
  id: string;
  requisitionId: string;
  formularyItemId: string | null;
  hcpcCode: string;
  description: string;
  quantity: number;
  estimatedUnitPriceUsd: number | null;
  preferredVendorId: string | null;
  justification: string | null;
  substitutesAllowed: number;
  approvalStatus: string;
  isOffFormulary: number;
  requiresPriorAuth: number;
  notes: string | null;
  createdAt: string;
}

export interface RequisitionHistoryEvent {
  id: string;
  requisitionId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  byUserId: string | null;
  comment: string | null;
  createdAt: string;
}

export const requisitionsApi = {
  list: (params?: { status?: string; requesterId?: string; approverId?: string; priority?: string; facilityId?: string; departmentId?: string; q?: string }) =>
    get<{ items: Requisition[] }>('/requisitions', params as Record<string, string> | undefined),
  create: (body: Partial<Requisition> & { title: string; items?: any[] }) =>
    post<{ id: string; requisitionNumber: string }>('/requisitions', body),
  get: (id: string) =>
    get<Requisition & { items: RequisitionItem[]; history: RequisitionHistoryEvent[] }>(`/requisitions/${id}`),
  update: (id: string, patch: Partial<Requisition>) =>
    put<{ updated: boolean }>(`/requisitions/${id}`, patch),
  addItem: (id: string, body: any) => post<{ id: string }>(`/requisitions/${id}/items`, body),
  updateItem: (id: string, itemId: string, patch: any) =>
    put<{ updated: boolean }>(`/requisitions/${id}/items/${itemId}`, patch),
  removeItem: (id: string, itemId: string) =>
    del<{ deleted: boolean }>(`/requisitions/${id}/items/${itemId}`),
  submit: (id: string) =>
    post<{ status: string; approver: any; matched: boolean }>(`/requisitions/${id}/submit`, {}),
  approve: (id: string, comment?: string) =>
    post<{ status: string }>(`/requisitions/${id}/approve`, { comment }),
  reject: (id: string, reason: string) =>
    post<{ status: string }>(`/requisitions/${id}/reject`, { reason }),
  cancel: (id: string, comment?: string) =>
    post<{ status: string }>(`/requisitions/${id}/cancel`, { comment }),
  convert: (id: string) =>
    post<{ status: string; orderIds: string[] }>(`/requisitions/${id}/convert`, {}),
  convertToPo: (id: string) =>
    post<{ status: string; purchaseOrderIds: string[] }>(
      `/requisitions/${id}/convert-to-po`,
      {},
    ),
  comment: (id: string, comment: string) =>
    post<{ ok: boolean }>(`/requisitions/${id}/comment`, { comment }),
};

// ─── Approval Rules ────────────────────────────────────────────────────────
export const APPROVAL_RULE_TRIGGERS = ['REQUISITION', 'ORDER', 'INVOICE', 'CONTRACT'] as const;
export type ApprovalRuleTrigger = (typeof APPROVAL_RULE_TRIGGERS)[number];

export interface ApprovalRule {
  id: string;
  hospitalId: string;
  name: string;
  description: string | null;
  triggerType: ApprovalRuleTrigger;
  priority: number;
  isActive: number;
  conditionsJson: string;
  approverJson: string;
  isTerminal: number;
  createdAt: string;
  updatedAt: string;
}

export const approvalRulesApi = {
  list: (params?: { triggerType?: string; hospitalId?: string }) =>
    get<{ items: ApprovalRule[] }>('/approval-rules', params as Record<string, string> | undefined),
  create: (body: any) => post<{ id: string }>('/approval-rules', body),
  update: (id: string, patch: any) => put<{ updated: boolean }>(`/approval-rules/${id}`, patch),
  remove: (id: string) => del<{ deleted: boolean }>(`/approval-rules/${id}`),
  preview: (body: { triggerType: string; sample: any }) =>
    post<{ approvers: any[] }>('/approval-rules/preview', body),
};

// ─── Requisition Templates ─────────────────────────────────────────────────
export interface RequisitionTemplate {
  id: string;
  hospitalId: string;
  facilityId: string | null;
  departmentId: string | null;
  name: string;
  description: string | null;
  category: string | null;
  defaultPriority: RequisitionPriority;
  isActive: number;
  timesUsed: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequisitionTemplateItem {
  id: string;
  templateId: string;
  hcpcCode: string;
  description: string;
  defaultQuantity: number;
  preferredVendorId: string | null;
  formularyItemId: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
}

export const requisitionTemplatesApi = {
  list: (params?: { facilityId?: string; departmentId?: string; hospitalId?: string }) =>
    get<{ items: RequisitionTemplate[] }>('/requisition-templates', params as Record<string, string> | undefined),
  create: (body: any) => post<{ id: string }>('/requisition-templates', body),
  get: (id: string) => get<RequisitionTemplate & { items: RequisitionTemplateItem[] }>(`/requisition-templates/${id}`),
  update: (id: string, patch: any) => put<{ updated: boolean }>(`/requisition-templates/${id}`, patch),
  remove: (id: string) => del<{ deactivated: boolean }>(`/requisition-templates/${id}`),
  instantiate: (id: string, body?: any) =>
    post<{ requisitionId: string; requisitionNumber: string }>(`/requisition-templates/${id}/instantiate`, body ?? {}),
};

import { get, post } from './client';

export type ApprovalEntityType = 'order' | 'user' | 'contract';

export interface ApprovalQueueItem {
  entityType: ApprovalEntityType;
  entityId: string;
  hospitalId: string | null;
  vendorId: string | null;
  pendingState: string;
  summary: string;
  requestedByUserId: string | null;
  requestedAt: string;
  ageDays: number;
  actionUrl: string;
}

export interface ApprovalQueueResponse {
  items: ApprovalQueueItem[];
  total: number;
  counts: {
    order: number;
    user: number;
    contract?: number;
  };
}

export interface ApprovalQueueQuery {
  type?: 'all' | 'order' | 'user' | 'contract';
  facilityId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export const approvalsApi = {
  queue: (params: ApprovalQueueQuery = {}) =>
    get<ApprovalQueueResponse>('/approvals/queue', params),

  approve: (entityType: ApprovalEntityType, entityId: string, body: any = {}) =>
    post<{ success: boolean }>(`/approvals/${entityType}/${entityId}/approve`, body),

  reject: (entityType: ApprovalEntityType, entityId: string, reason?: string) =>
    post<{ success: boolean }>(`/approvals/${entityType}/${entityId}/reject`, { reason }),

  bulkApprove: (items: Array<{ entityType: ApprovalEntityType; entityId: string }>) =>
    post<{
      results: Array<{ entityType: string; entityId: string; status: 'OK' | 'FAILED'; error?: string }>;
      succeeded: number;
      failed: number;
    }>('/approvals/bulk-approve', { items }),
};

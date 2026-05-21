import { get, put } from './client';

export interface FileAccessLogRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userType: string | null;
  fileKey: string;
  fileKind: string | null;
  hospitalId: string | null;
  vendorId: string | null;
  orderId: string | null;
  contractId: string | null;
  invoiceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  bytesServed: number | null;
  httpStatus: number | null;
  accessedAt: string;
}

export interface FileAccessLogQuery {
  userId?: string;
  fileKind?: string;
  orderId?: string;
  hospitalId?: string;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export const adminApi = {
  pendingUsers: () => get<any>('/admin/pending-users'),
  approveUser: (id: string) => put(`/admin/users/${id}/approve`, {}),
  rejectUser: (id: string, reason?: string) => put(`/admin/users/${id}/reject`, { reason }),
  stats: () => get<any>('/admin/stats'),

  fileAccessLog: (params: FileAccessLogQuery = {}) =>
    get<{ items: FileAccessLogRow[]; total: number }>('/admin/file-access-log', params),
};

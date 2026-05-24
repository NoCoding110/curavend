import { get, post, patch } from './client';

export const PRIOR_AUTH_STATUSES = ['NEEDED', 'SUBMITTED', 'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'] as const;
export type PriorAuthStatus = (typeof PRIOR_AUTH_STATUSES)[number];

export interface PriorAuth {
  id: string;
  orderId: string | null;
  hospitalId: string | null;
  payorId: string;
  payorMemberId: string;
  payorGroupId: string | null;
  patientName: string;
  patientDob: string | null;
  hcpcCode: string;
  icd10Codes: string | null;
  clinicalNote: string | null;
  authNumber: string | null;
  status: PriorAuthStatus;
  statusReason: string | null;
  quantityApproved: number | null;
  submittedAt: string | null;
  decisionAt: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  documentBlobKeys: string | null;
  createdAt: string;
  updatedAt: string;
  payor?: { id: string; name: string; kind: string } | null;
}

export interface PriorAuthHistory {
  id: string;
  priorAuthId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export const priorAuthsApi = {
  list: (params?: { status?: PriorAuthStatus; payorId?: string; orderId?: string }) =>
    get<{ items: PriorAuth[] }>('/prior-auths', params as Record<string, string> | undefined),
  get: (id: string) => get<PriorAuth & { history: PriorAuthHistory[] }>(`/prior-auths/${id}`),
  create: (body: {
    orderId?: string;
    payorId: string;
    payorMemberId: string;
    payorGroupId?: string;
    patientName: string;
    patientDob?: string;
    hcpcCode: string;
    icd10Codes?: string[];
    clinicalNote?: string;
    effectiveStartDate?: string;
    effectiveEndDate?: string;
  }) => post<{ id: string }>('/prior-auths', body),
  update: (id: string, body: any) => patch<{ id: string; updated: boolean }>(`/prior-auths/${id}`, body),
  transition: (
    id: string,
    body: {
      toStatus: PriorAuthStatus;
      reason?: string;
      authNumber?: string;
      quantityApproved?: number;
      effectiveStartDate?: string;
      effectiveEndDate?: string;
    },
  ) => post<{ id: string; status: PriorAuthStatus }>(`/prior-auths/${id}/transition`, body),
  attachDocument: (id: string, blobKey: string) =>
    post<{ documentBlobKeys: string[] }>(`/prior-auths/${id}/documents`, { blobKey }),
  dashboardSummary: () => get<{ counts: Record<string, number>; expiringSoon: number }>('/prior-auths/summary/dashboard'),
};

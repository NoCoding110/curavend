/**
 * DME documents API client.
 */
import { get, post, put, del } from './client';

export const DME_DOCUMENT_TYPES = [
  'DWO', 'SWO', 'CMN', 'FACE_TO_FACE', 'SLEEP_STUDY', 'OXIMETRY',
  'LMN', 'PROGRESS_NOTES', 'PHOTO', 'AOB', 'DELIVERY_TICKET',
  'PROOF_OF_DELIVERY', 'OTHER',
] as const;
export type DmeDocumentType = (typeof DME_DOCUMENT_TYPES)[number];

export const DME_DOC_STATUSES = [
  'MISSING', 'RECEIVED', 'EXPIRED', 'REJECTED', 'NOT_APPLICABLE',
] as const;
export type DmeDocStatus = (typeof DME_DOC_STATUSES)[number];

export interface DmeOrderDocument {
  id: string;
  orderId: string;
  requirementId: string | null;
  documentType: DmeDocumentType;
  status: DmeDocStatus;
  blobKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  signedAt: string | null;
  signedByName: string | null;
  expiresAt: string | null;
  notes: string | null;
  uploadedAt: string | null;
  uploadedByUserId: string | null;
}

export interface DmeDocPacketStatus {
  total: number;
  received: number;
  missing: number;
  rejected: number;
  complete: boolean;
  docs: DmeOrderDocument[];
}

export interface DmeDocumentRequirement {
  id: string;
  hcpcCode: string;
  documentType: DmeDocumentType;
  isRequired: number;
  payorKindFilter: string | null;
  expiresDays: number | null;
  notes: string | null;
}

export const dmeDocumentsApi = {
  materialize: (orderId: string) =>
    post<{ created: number; totalRequired: number }>(`/dme-documents/materialize/${orderId}`, {}),
  forOrder: (orderId: string) =>
    get<DmeDocPacketStatus>(`/dme-documents/order/${orderId}`),
  upload: (
    docId: string,
    body: { blobKey: string; fileName?: string; mimeType?: string; signedAt?: string; signedByName?: string; notes?: string },
  ) => post<{ status: string; expiresAt: string | null }>(`/dme-documents/${docId}/upload`, body),
  markReceived: (docId: string, notes?: string) =>
    post<{ status: string }>(`/dme-documents/${docId}/mark-received`, { notes }),
  markRejected: (docId: string, reason: string) =>
    post<{ status: string }>(`/dme-documents/${docId}/mark-rejected`, { reason }),
  addAdHoc: (orderId: string, documentType: string, notes?: string) =>
    post<{ id: string }>(`/dme-documents/order/${orderId}/ad-hoc`, { documentType, notes }),
  remove: (docId: string) =>
    del<{ deleted: boolean }>(`/dme-documents/${docId}`),

  listRequirements: (hcpcCode?: string) =>
    get<{ items: DmeDocumentRequirement[] }>('/dme-documents/requirements', hcpcCode ? { hcpcCode } : undefined),
  createRequirement: (body: any) =>
    post<{ id: string }>('/dme-documents/requirements', body),
  updateRequirement: (id: string, patch: any) =>
    put<{ updated: boolean }>(`/dme-documents/requirements/${id}`, patch),
  removeRequirement: (id: string) =>
    del<{ deleted: boolean }>(`/dme-documents/requirements/${id}`),
};

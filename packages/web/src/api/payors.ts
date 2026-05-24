import { get, post, put } from './client';

export const PAYOR_KINDS = ['COMMERCIAL', 'MEDICARE', 'MEDICAID', 'WORKERS_COMP', 'SELF_PAY', 'OTHER'] as const;
export type PayorKind = (typeof PAYOR_KINDS)[number];

export interface Payor {
  id: string;
  name: string;
  kind: PayorKind;
  payorCode: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  isActive: number;
  contractItemCount?: number;
}

export interface PayorContractItem {
  id: string;
  payorId: string;
  vendorId: string | null;
  hcpcCode: string;
  description: string | null;
  allowableUsd: number;
  patientResponsibilityUsd: number | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  requiresPriorAuth: number;
  isActive: number;
}

export interface EligibilityResponse {
  id: string;
  status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN' | 'ERROR';
  benefitNotes: string;
  copayUsd: number | null;
  deductibleUsd: number | null;
  deductibleMetUsd: number | null;
  payor: { id: string; name: string; kind: string };
  stub: boolean;
}

export const payorsApi = {
  list: () => get<{ items: Payor[] }>('/payors'),
  get: (id: string) => get<Payor>(`/payors/${id}`),
  create: (body: { name: string; kind: PayorKind; payorCode?: string; phone?: string; website?: string; notes?: string }) =>
    post<{ id: string }>('/payors', body),
  update: (id: string, body: Partial<Payor>) => put<{ id: string; updated: boolean }>(`/payors/${id}`, body),
  listItems: (id: string) => get<{ items: PayorContractItem[] }>(`/payors/${id}/items`),
  upsertItems: (
    id: string,
    items: Array<{
      hcpcCode: string;
      allowableUsd: number;
      effectiveStartDate: string;
      effectiveEndDate?: string;
      vendorId?: string;
      description?: string;
      patientResponsibilityUsd?: number;
      requiresPriorAuth?: boolean;
    }>,
  ) => post<{ processed: number; itemIds: string[] }>(`/payors/${id}/items`, { items }),
  checkEligibility: (
    payorId: string,
    body: { patientMemberId: string; patientName?: string; patientDob?: string; hcpcCode?: string; orderId?: string },
  ) => post<EligibilityResponse>(`/payors/${payorId}/eligibility-check`, body),
};

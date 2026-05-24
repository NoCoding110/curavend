/**
 * GPO management API client.
 */
import { get, post, put, del } from './client';

export const GPO_KINDS = ['VIZIENT', 'PREMIER', 'HEALTHTRUST', 'INTALERE', 'CAPSTONE', 'OTHER'] as const;
export type GpoKind = (typeof GPO_KINDS)[number];

export interface GpoOrganization {
  id: string;
  name: string;
  kind: GpoKind;
  description: string | null;
  website: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface GpoContractItem {
  id: string;
  gpoOrganizationId: string;
  vendorId: string | null;
  hcpcCode: string;
  description: string | null;
  rateUsd: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  isActive: number;
  sourceContractId: string | null;
}

export const gpoApi = {
  listOrganizations: (): Promise<{ items: GpoOrganization[] }> =>
    get<{ items: GpoOrganization[] }>('/gpo/organizations'),

  createOrganization: (body: { name: string; kind: GpoKind; description?: string; website?: string }) =>
    post<{ id: string }>('/gpo/organizations', body),

  getOrganization: (id: string) =>
    get<GpoOrganization & { memberHospitalCount: number; contractItemCount: number }>(
      `/gpo/organizations/${id}`,
    ),

  listItems: (id: string, params?: { hcpcCode?: string; activeOnly?: boolean }) =>
    get<{ items: GpoContractItem[] }>(`/gpo/organizations/${id}/items`, params as Record<string, string> | undefined),

  upsertItems: (
    id: string,
    items: Array<{
      hcpcCode: string;
      rateUsd: number;
      effectiveStartDate: string;
      effectiveEndDate?: string;
      vendorId?: string;
      description?: string;
      sourceContractId?: string;
    }>,
  ) => post<{ processed: number; itemIds: string[] }>(`/gpo/organizations/${id}/items`, { items }),

  deleteItem: (id: string, itemId: string) =>
    del<{ deleted: boolean }>(`/gpo/organizations/${id}/items/${itemId}`),

  setHospitalMembership: (body: { hospitalId: string; gpoOrganizationId: string | null; gpoMemberId?: string | null }) =>
    put<{ hospitalId: string }>('/gpo/hospital-membership', body),

  resolveRate: (params: { hospitalId: string; vendorId?: string; hcpcCode: string }) =>
    get<{ match: { rate: number; gpoOrganizationId: string; gpoContractItemId: string; hcpcCode: string; source: 'GPO_CONTRACT' } | null }>(
      '/gpo/resolve-rate',
      params as Record<string, string>,
    ),
};

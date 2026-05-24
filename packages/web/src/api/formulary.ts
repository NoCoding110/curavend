/**
 * Formulary (Item Master) API client.
 */
import { get, post, put, del } from './client';

export const FORMULARY_STATUSES = ['ACTIVE', 'INACTIVE', 'RETIRED'] as const;
export type FormularyStatus = (typeof FORMULARY_STATUSES)[number];

export interface FormularyItem {
  id: string;
  hospitalId: string;
  facilityId: string | null;
  hcpcCode: string;
  description: string;
  category: string | null;
  preferredVendorId: string | null;
  secondaryVendorId: string | null;
  preferredVendorName?: string | null;
  secondaryVendorName?: string | null;
  maxUnitPriceUsd: number | null;
  requiresPriorAuth: number;
  isRestricted: number;
  restrictionReason: string | null;
  parLevel: number | null;
  reorderQuantity: number | null;
  unitOfMeasure: string | null;
  status: FormularyStatus;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormularySubstitute {
  id: string;
  formularyItemId: string;
  substituteHcpcCode: string;
  substituteDescription: string | null;
  priority: number;
  notes: string | null;
  createdAt: string;
}

export type FormularyDecision = 'ON_FORMULARY' | 'OFF_FORMULARY' | 'RESTRICTED';

export interface FormularyResolveResult {
  decision: FormularyDecision;
  hcpcCode: string;
  item: FormularyItem | null;
  substitutes: FormularySubstitute[];
}

export const formularyApi = {
  list: (params?: {
    hospitalId?: string;
    facilityId?: string;
    status?: FormularyStatus;
    hcpcCode?: string;
    q?: string;
  }) => get<{ items: FormularyItem[] }>('/formulary', params as Record<string, string> | undefined),

  create: (body: Partial<FormularyItem> & { hcpcCode: string; description: string }) =>
    post<{ id: string }>('/formulary', body),

  get: (id: string) =>
    get<FormularyItem & { substitutes: FormularySubstitute[] }>(`/formulary/${id}`),

  update: (id: string, patch: Partial<FormularyItem>) =>
    put<{ updated: boolean }>(`/formulary/${id}`, patch),

  retire: (id: string) => del<{ retired: boolean }>(`/formulary/${id}`),

  addSubstitute: (
    id: string,
    body: { substituteHcpcCode: string; substituteDescription?: string; priority?: number; notes?: string },
  ) => post<{ id: string }>(`/formulary/${id}/substitutes`, body),

  removeSubstitute: (id: string, subId: string) =>
    del<{ deleted: boolean }>(`/formulary/${id}/substitutes/${subId}`),

  bulkImport: (body: {
    hospitalId?: string;
    facilityId?: string | null;
    items: Array<{
      hcpcCode: string;
      description: string;
      category?: string;
      maxUnitPriceUsd?: number;
      requiresPriorAuth?: boolean;
      isRestricted?: boolean;
      restrictionReason?: string;
      parLevel?: number;
      reorderQuantity?: number;
      unitOfMeasure?: string;
      notes?: string;
    }>;
  }) => post<{ inserted: number; updated: number; totalProcessed: number }>('/formulary/bulk-import', body),

  resolve: (params: { hcpcCode: string; facilityId?: string; hospitalId?: string }) =>
    get<FormularyResolveResult>('/formulary/resolve', params as Record<string, string>),
};

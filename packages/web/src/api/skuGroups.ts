import { get, post, put, del } from './client';

export interface SkuGroup {
  id: string;
  vendorId: string;
  groupName: string;
  tagline: string | null;
  longDescription: string | null;
  salientFeatures: string | null; // JSON
  brandManufacturer: string | null;
  coverImageUrl: string | null;
  datasheetUrl: string | null;
  ifuUrl: string | null;
  msdsUrl: string | null;
  brochureUrl: string | null;
  videoUrl: string | null;
  categoryPath: string | null;
  variantAttributes: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkuGroupDetail extends SkuGroup {
  skus: Array<{
    id: string;
    vendorSku: string;
    hcpcCode: string;
    description: string | null;
    variantAttributes: string | null;
  }>;
}

export const skuGroupsApi = {
  list: (params?: { vendorId?: string; isActive?: 'true' | 'false'; limit?: number; offset?: number }) =>
    get<{ items: SkuGroup[]; total: number }>('/sku-groups', params),
  get: (id: string) => get<SkuGroupDetail>(`/sku-groups/${id}`),
  create: (data: Partial<SkuGroup> & { groupName: string; vendorId?: string; salientFeatures?: string[]; variantAttributes?: any; categoryPath?: any }) =>
    post<SkuGroup>('/sku-groups', data),
  update: (id: string, data: Partial<SkuGroup> & { salientFeatures?: string[]; variantAttributes?: any; categoryPath?: any }) =>
    put<SkuGroup>(`/sku-groups/${id}`, data),
  delete: (id: string) => del<{ success: boolean }>(`/sku-groups/${id}`),
  attachSku: (groupId: string, skuId: string, variantAttributes?: any) =>
    post<{ success: boolean }>(`/sku-groups/${groupId}/skus`, { skuId, variantAttributes }),
  detachSku: (groupId: string, skuId: string) => del<{ success: boolean }>(`/sku-groups/${groupId}/skus/${skuId}`),
};

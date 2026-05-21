import { get } from './client';

export interface CatalogItem {
  id: string;
  vendorId: string;
  hcpcCode: string;
  vendorSku: string;
  description: string | null;
  manufacturerName: string | null;
  manufacturerItemNumber: string | null;
  unitsPerPack: number;
  packsPerCase: number;
  unitOfMeasurement: string | null;
  listPriceCents: number | null;
  currencyCode: string;
  minimumOrderQuantity: number;
  maximumOrderQuantity: number | null;
  packMultiple: number;
  tagline: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  datasheetUrl: string | null;
  groupId: string | null;
  variantAttributes: string | null;
  groupName: string | null;
  groupCoverImageUrl: string | null;
  groupDatasheetUrl: string | null;
  vendorName: string | null;
  resolvedPriceCents: number | null;
  priceSource: 'CONTRACT' | 'MEDICARE' | 'LIST';
  contractId: string | null;
}

export const catalogApi = {
  list: (params?: {
    q?: string;
    vendorId?: string;
    groupId?: string;
    hcpcCode?: string;
    limit?: number;
    offset?: number;
  }) => get<{ items: CatalogItem[]; total: number }>('/catalog', params),
};

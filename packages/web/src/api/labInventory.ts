/**
 * Lab inventory API client.
 */
import { get, post, put, del } from './client';

export const LAB_CONSUMABLE_CATEGORIES = [
  'REAGENT','CONTROL','CALIBRATOR','KIT','SWAB','TUBE',
  'PIPETTE_TIP','PLATE','PPE','CLEANING','OTHER',
] as const;
export type LabConsumableCategory = (typeof LAB_CONSUMABLE_CATEGORIES)[number];

export const HAZARD_CLASSES = [
  'NONE','BIOHAZARD','CHEMICAL','RADIOACTIVE','FLAMMABLE','CORROSIVE','CONTROLLED_SUBSTANCE',
] as const;

export const LOT_STATUSES = ['ACTIVE','EXPIRED','QUARANTINED','RECALLED','DEPLETED'] as const;

export interface LabConsumable {
  id: string;
  labGroupId: string | null;
  itemCode: string;
  description: string;
  category: LabConsumableCategory;
  manufacturer: string | null;
  manufacturerCatalog: string | null;
  storageTempMinC: number | null;
  storageTempMaxC: number | null;
  storageInstructions: string | null;
  hazardClass: string;
  usageUom: string;
  unitsPerCase: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  requiresLotTracking: number;
  preferredVendorId: string | null;
  defaultUnitPriceUsd: number | null;
  isActive: number;
}

export interface LabLot {
  id: string;
  consumableId: string;
  siteId: string;
  lotNumber: string;
  expirationDate: string | null;
  quantityOnHand: number;
  quantityReserved: number;
  unitPriceUsd: number | null;
  receivedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'QUARANTINED' | 'RECALLED' | 'DEPLETED';
  notes: string | null;
}

export interface SiteSummaryRow {
  consumableId: string;
  itemCode: string;
  description: string;
  category: string;
  siteId: string;
  totalOnHand: number;
  totalReserved: number;
  lotCount: number;
  oldestExpiration: string | null;
  daysToOldestExpiration: number | null;
  reorderPoint: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
  belowReorderPoint: boolean;
  belowMin: boolean;
  hasExpiringSoon: boolean;
  hasExpiredLot: boolean;
}

export interface StockMovement {
  id: string;
  lotId: string;
  consumableId: string;
  siteId: string;
  movementType: string;
  quantity: number;
  quantityAfter: number;
  relatedOrderId: string | null;
  relatedLabOrderId: string | null;
  relatedTransferId: string | null;
  reason: string | null;
  performedByUserId: string | null;
  occurredAt: string;
}

export const labInventoryApi = {
  listConsumables: (params?: { category?: string; labGroupId?: string; isActive?: string }) =>
    get<{ items: LabConsumable[] }>('/lab-inventory/consumables', params as Record<string, string> | undefined),
  createConsumable: (body: Partial<LabConsumable> & { itemCode: string; description: string; category: string }) =>
    post<{ id: string }>('/lab-inventory/consumables', body),
  updateConsumable: (id: string, patch: Partial<LabConsumable>) =>
    put<{ updated: boolean }>(`/lab-inventory/consumables/${id}`, patch),
  removeConsumable: (id: string) =>
    del<{ deactivated: boolean }>(`/lab-inventory/consumables/${id}`),

  listLots: (params?: { siteId?: string; consumableId?: string; status?: string }) =>
    get<{ items: LabLot[] }>('/lab-inventory/lots', params as Record<string, string> | undefined),
  receiveLot: (body: {
    consumableId: string;
    siteId: string;
    lotNumber: string;
    quantity: number;
    expirationDate?: string;
    unitPriceUsd?: number;
    receivedFromOrderId?: string;
    receivedFromGrnId?: string;
  }) => post<{ lotId: string; quantityAfter: number; created: boolean }>('/lab-inventory/lots/receive', body),
  adjustLot: (id: string, body: { quantity: number; reason: string }) =>
    post<{ quantityAfter: number }>(`/lab-inventory/lots/${id}/adjust`, body),
  quarantineLot: (id: string, reason?: string) =>
    post<{ status: string }>(`/lab-inventory/lots/${id}/quarantine`, { reason }),
  recallLot: (id: string, reason: string) =>
    post<{ status: string }>(`/lab-inventory/lots/${id}/recall`, { reason }),

  issue: (body: { consumableId: string; siteId: string; quantity: number; relatedLabOrderId?: string; reason?: string }) =>
    post<{ issuedFromLots: Array<{ lotId: string; qty: number }>; remaining: number }>('/lab-inventory/issue', body),
  transfer: (body: { consumableId: string; fromLotId: string; toSiteId: string; quantity: number; reason?: string }) =>
    post<{ transferId: string; fromLotId: string; toLotId: string; quantity: number }>('/lab-inventory/transfer', body),

  summary: (params?: { siteId?: string; labGroupId?: string; category?: string }) =>
    get<{ items: SiteSummaryRow[] }>('/lab-inventory/summary', params as Record<string, string> | undefined),
  reorderCandidates: (params?: { siteId?: string; labGroupId?: string }) =>
    get<{ items: SiteSummaryRow[] }>('/lab-inventory/reorder-candidates', params as Record<string, string> | undefined),
  expiring: (days = 30) =>
    get<{ days: number; items: LabLot[] }>('/lab-inventory/expiring', { days: String(days) } as any),

  movementsByLot: (lotId: string) =>
    get<{ items: StockMovement[] }>(`/lab-inventory/movements/lot/${lotId}`),
  movementsBySite: (siteId: string) =>
    get<{ items: StockMovement[] }>(`/lab-inventory/movements/site/${siteId}`),

  listTestMap: (params?: { testCode?: string; consumableId?: string }) =>
    get<{ items: any[] }>('/lab-inventory/test-consumables', params as Record<string, string> | undefined),
  createTestMap: (body: { testCode: string; consumableId: string; quantityPerTest: number; testDescription?: string; isCritical?: boolean; notes?: string; labGroupId?: string }) =>
    post<{ id: string }>('/lab-inventory/test-consumables', body),
  removeTestMap: (id: string) =>
    del<{ deleted: boolean }>(`/lab-inventory/test-consumables/${id}`),
};

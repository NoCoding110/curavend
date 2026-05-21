// ──────────────────────────────────────────────
// Inventory & consignment types
// ──────────────────────────────────────────────

export type InventoryChangeType =
  | 'INCREMENT'
  | 'DECREMENT'
  | 'PAR_ADJUSTMENT'
  | 'INITIAL_SETUP'
  | 'CYCLE_COUNT_ADJUSTMENT';

export type InventoryField =
  | 'DISPENSED'
  | 'ON_HAND'
  | 'PAR_LEVEL'
  | 'REORDER_TRIGGER_THRESHOLD';

export type Track = 'PURCHASE_ORDER' | 'INVOICE';

/** Single product line tracked in inventory. */
export interface InventoryItem {
  id: string;
  inventoryId: string;
  productName: string;
  productCode: string | null;
  hcpcsCode: string | null;
  description: string | null;
  unitPrice: number;
  onHand: number;
  parLevel: number;
  reorderTriggerThreshold: number;
  dispensed: number;
  lastCountDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Audit log entry for an inventory change. */
export interface InventoryChangeLog {
  id: string;
  inventoryItemId: string;
  changeType: InventoryChangeType;
  field: InventoryField;
  previousValue: number;
  newValue: number;
  changedBy: string;
  changedByName: string | null;
  reason: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
}

/** Top-level inventory record for a hospital-vendor pair. */
export interface Inventory {
  id: string;
  hospitalId: string;
  hospitalName: string | null;
  vendorId: string;
  vendorName: string | null;
  providerId: string | null;
  providerName: string | null;
  superVendorId: string | null;
  name: string | null;
  description: string | null;
  items: InventoryItem[];
  createdAt: string;
  updatedAt: string;
}

/** Single product in a consignment closet. */
export interface ConsignmentClosetItem {
  id: string;
  closetId: string;
  productName: string;
  productCode: string | null;
  hcpcsCode: string | null;
  description: string | null;
  unitPrice: number;
  onHand: number;
  parLevel: number;
  reorderTriggerThreshold: number;
  dispensed: number;
  lotNumber: string | null;
  serialNumber: string | null;
  expirationDate: string | null;
  lastCountDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Consignment closet managed by a vendor at a hospital location. */
export interface ConsignmentCloset {
  id: string;
  hospitalId: string;
  hospitalName: string | null;
  vendorId: string;
  vendorName: string | null;
  providerId: string | null;
  providerName: string | null;
  superVendorId: string | null;
  name: string;
  location: string | null;
  description: string | null;
  items: ConsignmentClosetItem[];
  createdAt: string;
  updatedAt: string;
}

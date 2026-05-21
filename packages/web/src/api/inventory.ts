import { get, post, put, del } from './client';

export const inventoryApi = {
  list: (params?: Record<string, any>) => get<any>('/inventory', params),
  get: (id: string) => get<any>(`/inventory/${id}`),
  create: (data: any) => post<any>('/inventory', data),
  update: (id: string, data: any) => put<any>(`/inventory/${id}`, data),
  listItems: (inventoryId: string) => get<any>(`/inventory/${inventoryId}/items`),
  addItem: (inventoryId: string, data: any) => post<any>(`/inventory/${inventoryId}/items`, data),
  updateItem: (inventoryId: string, itemId: string, data: any) => put<any>(`/inventory/${inventoryId}/items/${itemId}`, data),
  deleteItem: (inventoryId: string, itemId: string) => del<any>(`/inventory/${inventoryId}/items/${itemId}`),

  // Lot CRUD
  listLots: (inventoryId: string, itemId: string) =>
    get<any>(`/inventory/${inventoryId}/items/${itemId}/lots`),
  addLot: (inventoryId: string, itemId: string, data: any) =>
    post<any>(`/inventory/${inventoryId}/items/${itemId}/lots`, data),
  updateLot: (inventoryId: string, itemId: string, lotId: string, data: any) =>
    put<any>(`/inventory/${inventoryId}/items/${itemId}/lots/${lotId}`, data),
  deleteLot: (inventoryId: string, itemId: string, lotId: string) =>
    del<any>(`/inventory/${inventoryId}/items/${itemId}/lots/${lotId}`),

  // Unified search (for encounter add-item modal)
  search: (params: { q: string; vendorId?: string }) =>
    get<{ items: any[] }>('/inventory/search', params),
};

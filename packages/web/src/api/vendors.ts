import { get, post, put } from './client';

export const vendorsApi = {
  list: (params?: Record<string, any>) => get<any>('/vendors', params),
  get: (id: string) => get<any>(`/vendors/${id}`),
  create: (data: any) => post<any>('/vendors', data),
  update: (id: string, data: any) => put<any>(`/vendors/${id}`, data),
};

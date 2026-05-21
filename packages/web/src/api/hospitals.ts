import { get, post, put } from './client';

export const hospitalsApi = {
  list: (params?: Record<string, any>) => get<any>('/hospitals', params),
  get: (id: string) => get<any>(`/hospitals/${id}`),
  create: (data: any) => post<any>('/hospitals', data),
  update: (id: string, data: any) => put<any>(`/hospitals/${id}`, data),
};

import { get, post, put } from './client';

export const usersApi = {
  list: (params?: Record<string, any>) => get<any>('/users', params),
  get: (id: string) => get<any>(`/users/${id}`),
  create: (data: any) => post<any>('/users', data),
  update: (id: string, data: any) => put<any>(`/users/${id}`, data),
};

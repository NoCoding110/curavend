import { get, post, put } from './client';

export const supportTicketsApi = {
  list: (params?: Record<string, any>) => get<any>('/support-tickets', params),
  get: (id: string) => get<any>(`/support-tickets/${id}`),
  create: (data: any) => post<any>('/support-tickets', data),
  update: (id: string, data: any) => put<any>(`/support-tickets/${id}`, data),
  getMessages: (id: string) => get<any>(`/support-tickets/${id}/messages`),
  sendMessage: (id: string, data: any) => post<any>(`/support-tickets/${id}/messages`, data),
};

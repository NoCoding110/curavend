import { get, post, put } from './client';

export const roomsApi = {
  list: (params?: Record<string, any>) => get<any>('/rooms', params),
  get: (id: string) => get<any>(`/rooms/${id}`),
  create: (data: any) => post<any>('/rooms', data),
  getMessages: (id: string, params?: Record<string, any>) => get<any>(`/rooms/${id}/messages`, params),
  sendMessage: (id: string, data: any) => post<any>(`/rooms/${id}/messages`, data),
  markRead: (id: string) => put<any>(`/rooms/${id}/read`, {}),
  archive: (id: string) => put<any>(`/rooms/${id}/archive`, {}),
};

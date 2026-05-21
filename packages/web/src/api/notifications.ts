import { get, put } from './client';

export const notificationsApi = {
  list: (params?: Record<string, any>) => get<any>('/notifications', params),
  count: () => get<any>('/notifications/count'),
  markRead: (id: string) => put<any>(`/notifications/${id}/read`, {}),
  markAllRead: () => put<any>('/notifications/read-all', {}),
};

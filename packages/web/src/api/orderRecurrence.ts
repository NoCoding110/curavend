import { get, post, put } from './client';

export type RecurrenceFrequencyUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'QUARTERS' | 'CUSTOM';
export type RecurrenceStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

export interface RecurrencePlan {
  id: string;
  parentOrderId: string;
  hospitalId: string;
  vendorId: string | null;
  frequencyUnit: RecurrenceFrequencyUnit;
  frequencyValue: number;
  anchorDay: number | null;
  customCronExpression: string | null;
  startDate: string;
  endDate: string | null;
  totalOccurrences: number | null;
  skipDates: string | null; // JSON string
  leadTimeDays: number;
  requireReauthEvery: number | null;
  status: RecurrenceStatus;
  nextOccurrenceDate: string | null;
  occurrencesSpawned: number;
  pausedAt: string | null;
  pausedReason: string | null;
  pauseUntil: string | null;
  cancelledAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OccurrenceListResponse {
  plan: RecurrencePlan;
  spawned: Array<{
    id: string;
    identifier: string | null;
    status: string;
    orderSubStatus: string;
    recurrenceIndex: number | null;
    createdAt: string;
  }>;
  upcoming: string[];
}

export interface CreatePlanInput {
  frequencyUnit: RecurrenceFrequencyUnit;
  frequencyValue: number;
  anchorDay?: number | null;
  customCronExpression?: string | null;
  startDate: string;
  endDate?: string | null;
  totalOccurrences?: number | null;
  skipDates?: string[];
  leadTimeDays?: number;
  requireReauthEvery?: number | null;
}

export const orderRecurrenceApi = {
  list: (params?: { status?: RecurrenceStatus; limit?: number; offset?: number }) =>
    get<{ items: RecurrencePlan[]; total: number }>('/recurrence', params),
  getByOrder: (orderId: string) => get<RecurrencePlan>(`/recurrence/by-order/${orderId}`),
  create: (orderId: string, data: CreatePlanInput) => post<RecurrencePlan>(`/recurrence/by-order/${orderId}`, data),
  update: (planId: string, data: Partial<CreatePlanInput>) => put<RecurrencePlan>(`/recurrence/${planId}`, data),
  pause: (planId: string, reason?: string, pauseUntil?: string) =>
    post<{ success: boolean; status: RecurrenceStatus }>(`/recurrence/${planId}/pause`, { reason, pauseUntil }),
  resume: (planId: string) => post<{ success: boolean; status: RecurrenceStatus }>(`/recurrence/${planId}/resume`),
  cancel: (planId: string) => post<{ success: boolean; status: RecurrenceStatus }>(`/recurrence/${planId}/cancel`),
  skipNext: (planId: string) => post<{ success: boolean; nextOccurrenceDate: string | null }>(`/recurrence/${planId}/skip-next`),
  occurrences: (planId: string) => get<OccurrenceListResponse>(`/recurrence/${planId}/occurrences`),
};

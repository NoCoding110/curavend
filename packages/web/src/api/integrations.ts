import { get, post } from './client';

export type IntegrationStatus = 'PENDING' | 'SUCCESS' | 'RETRYING' | 'DEAD_LETTER' | 'TERMINAL_FAILURE';

export interface IntegrationLogEntry {
  id: string;
  connectorType: string;
  connectorId: string | null;
  entityType: string;
  entityId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  httpMethod: string | null;
  url: string | null;
  requestPayload: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  status: IntegrationStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastErrorMessage: string | null;
  idempotencyKey: string | null;
  triggeredByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const integrationsApi = {
  log: (params?: {
    status?: IntegrationStatus;
    entityType?: string;
    entityId?: string;
    connector?: string;
    limit?: number;
    offset?: number;
  }) => get<{ items: IntegrationLogEntry[]; total: number }>('/integrations/log', params),
  getOne: (id: string) => get<IntegrationLogEntry>(`/integrations/log/${id}`),
  retry: (id: string) => post<{ success: boolean; status: IntegrationStatus }>(`/integrations/log/${id}/retry`),
  abort: (id: string, reason?: string) =>
    post<{ success: boolean; status: IntegrationStatus }>(`/integrations/log/${id}/abort`, { reason }),
};

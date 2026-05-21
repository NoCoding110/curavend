import { get, post, del } from './client';

export interface WorkflowInstance {
  id: string;
  instanceId?: string;
  workflowType: string;
  entityType: string | null;
  entityId: string | null;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'TERMINATED'
    | 'WAITING_FOR_EVENT';
  currentStep: string | null;
  stepIndex: number;
  totalSteps: number | null;
  customStatus?: any;
  context?: any;
  errorMessage?: string | null;
  waitingForEvent?: string | null;
  eventWaitExpiresAt?: string | null;
  terminatedBy?: string | null;
  terminatedAt?: string | null;
  terminateReason?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  activityLog?: Array<{
    activityName: string;
    status: string;
    durationMs: number | null;
    startedAt: string;
    completedAt: string | null;
    errorMessage: string | null;
  }>;
  managementUrls?: {
    statusQueryGetUri: string;
    terminatePostUri: string;
    sendEventPostUri: string;
    purgeHistoryDeleteUri: string;
  };
}

export interface WorkflowListResponse {
  data: WorkflowInstance[];
  total: number;
  limit: number;
  offset: number;
  registeredTypes: string[];
}

export interface StartWorkflowResponse {
  instanceId: string;
  workflowType: string;
  statusQueryGetUri: string;
  terminatePostUri: string;
  sendEventPostUri: string;
  purgeHistoryDeleteUri: string;
}

export const workflowsApi = {
  list: (params?: {
    type?: string;
    status?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
  }) => get<WorkflowListResponse>('/workflows', params as any),

  getStatus: (id: string) => get<WorkflowInstance>(`/workflows/${id}/status`),

  start: (type: string, body: { entityType: string; entityId: string; context?: any }) =>
    post<StartWorkflowResponse>(`/workflows/${type}/start`, body),

  terminate: (id: string, reason: string) =>
    post<{ ok: boolean; status: string; reason: string }>(`/workflows/${id}/terminate`, { reason }),

  raiseEvent: (id: string, eventName: string, payload?: any) =>
    post<{ ok: boolean; eventId: string; eventName: string; resumed: boolean }>(
      `/workflows/${id}/events`,
      { eventName, payload },
    ),

  purge: (id: string) =>
    del<{ ok: boolean; activityRowsDeleted: number; eventRowsDeleted: number }>(`/workflows/${id}`),
};

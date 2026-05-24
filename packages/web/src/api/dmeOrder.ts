/**
 * DME order wizard API client.
 */
import { get, post } from './client';
import type { DmeDocPacketStatus } from './dmeDocuments';

export interface LcdCheckResult {
  decision: 'MEETS' | 'DOES_NOT_MEET' | 'NEEDS_CLINICAL_REVIEW' | 'UNKNOWN';
  hcpcCode: string;
  evaluations: Array<{
    criterionId: string;
    criterionType: string;
    citation: string | null;
    description: string;
    passed: boolean | null;
    reason: string;
  }>;
  citations: string[];
  explanation: string;
}

export interface RequiredFinding {
  findingName: string;
  operator: string;
  threshold: number;
  threshold2: number | null;
  unit: string | null;
  description: string;
  citation: string | null;
}

export const dmeOrderApi = {
  lcdCheck: (body: {
    hcpcCode: string;
    icd10List?: string[];
    setting?: string;
    orderId?: string;
    findings?: Record<string, number | null>;
  }) => post<LcdCheckResult>('/lcd/check', body),
  paRequired: (hcpc: string) =>
    get<{ hcpcCode: string; required: boolean; info: any | null }>(`/lcd/pa-required/${hcpc}`),
  requiredFindings: (hcpc: string) =>
    get<{ hcpcCode: string; findings: RequiredFinding[] }>(`/lcd/required-findings/${hcpc}`),
};

export interface EligibilityResult {
  status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  benefitNotes: string;
  copayUsd: number | null;
  deductibleUsd: number | null;
  deductibleMetUsd: number | null;
  simulated: boolean;
  rawResponse?: any;
}

export interface EligibilityCheckInput {
  patientMemberId: string;
  patientName?: string;
  patientDob?: string;
  hcpcCode?: string;
  orderId?: string;
}

export interface PriorAuthSubmitInput {
  priorAuthId: string;
  hcpcCode: string;
  patientName: string;
  patientDob?: string;
  patientMemberId?: string;
  icd10Codes?: string[];
  clinicalNote?: string;
}

export interface PriorAuthSubmitResult {
  accepted: boolean;
  externalRef: string;
  simulated: boolean;
  rawResponse?: any;
}

export interface EligibilityProvider {
  check(input: EligibilityCheckInput): Promise<EligibilityResult>;
}

export interface PriorAuthProvider {
  submit(input: PriorAuthSubmitInput): Promise<PriorAuthSubmitResult>;
}

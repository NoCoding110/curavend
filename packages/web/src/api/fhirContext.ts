/**
 * fhirContext — typed FE wrappers around the /api/fhir/:connectionId/* endpoints.
 *
 * Phase 1.F consumer: feeds the wizard pre-fill flow.
 */
import { get } from './client';

export interface PatientDto {
  id: string;
  mrn?: string;
  given: string[];
  family?: string;
  name: string;
  dob?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  phone?: string;
  email?: string;
  address?: {
    line: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface EncounterDto {
  id: string;
  status?: string;
  classCode?: string;
  classDisplay?: string;
  periodStart?: string;
  periodEnd?: string;
  locationFhirId?: string;
  locationDisplay?: string;
  practitionerFhirId?: string;
  practitionerDisplay?: string;
  serviceTypeDisplay?: string;
}

export interface CoverageDto {
  id: string;
  status?: string;
  payorFhirId?: string;
  payorName?: string;
  memberId?: string;
  groupId?: string;
  planName?: string;
  relationship?: string;
  periodStart?: string;
  periodEnd?: string;
  order?: number;
}

export interface ConditionDto {
  id: string;
  icd10?: string;
  snomed?: string;
  displayText: string;
  clinicalStatus?: string;
  onsetDate?: string;
  recordedDate?: string;
}

export interface PractitionerDto {
  id: string;
  npi?: string;
  given: string[];
  family?: string;
  prefix?: string[];
  suffix?: string[];
  name: string;
  email?: string;
  phone?: string;
}

export interface LaunchContextPrefill {
  patient: PatientDto | null;
  encounter: EncounterDto | null;
  encounters: EncounterDto[];
  coverages: CoverageDto[];
  conditions: ConditionDto[];
}

export interface TokenStatus {
  connected: boolean;
  expiresAt?: string;
  expiresInSeconds?: number;
  scope?: string;
  patient?: string | null;
  encounter?: string | null;
  fhirUser?: string | null;
}

export const fhirApi = {
  /** Start a Standalone Launch for the given connection. Caller redirects to the returned URL. */
  authorizeUrl(connectionId: string): Promise<{ url: string }> {
    return get<{ url: string }>(`/fhir/authorize-url`, { connectionId });
  },

  /** Is the caller connected to this Epic connection? */
  tokenStatus(connectionId: string): Promise<TokenStatus> {
    return get<TokenStatus>(`/fhir/token-status`, { connectionId });
  },

  /** Diagnostic — show the cached SMART configuration for a connection. */
  smartConfig(connectionId: string): Promise<{ ok: boolean; smart: unknown; fhirBaseUrl: string }> {
    return get(`/fhir/smart-config`, { connectionId });
  },

  /** Read a single patient. */
  patient(connectionId: string, patientId: string): Promise<PatientDto> {
    return get<PatientDto>(`/fhir/${connectionId}/patient/${patientId}`);
  },

  /** Aggregate prefill: patient + (optional) encounter + coverages + conditions in one call. */
  launchContextPrefill(
    connectionId: string,
    patientId: string,
    encounterId?: string,
    /** When set, look up the FHIR token under `fhir:<fhirUser>` instead of the
     * calling Curavend user. Used when the OAuth flow was an EHR Launch (no
     * Curavend session was bound at token-store time). */
    fhirUser?: string,
  ): Promise<LaunchContextPrefill> {
    const params: Record<string, string> = { patientId };
    if (encounterId) params.encounterId = encounterId;
    if (fhirUser) params.fhirUser = fhirUser;
    return get<LaunchContextPrefill>(
      `/fhir/${connectionId}/launch-context-prefill`,
      params,
    );
  },

  /** Read a single encounter. */
  encounter(connectionId: string, encounterId: string): Promise<EncounterDto> {
    return get<EncounterDto>(`/fhir/${connectionId}/encounter/${encounterId}`);
  },

  /** Active encounters for a patient. */
  activeEncounters(connectionId: string, patientId: string): Promise<{ items: EncounterDto[] }> {
    return get(`/fhir/${connectionId}/encounter`, { patient: patientId });
  },

  /** Coverages on file for a patient. */
  coverages(connectionId: string, patientId: string): Promise<{ items: CoverageDto[] }> {
    return get(`/fhir/${connectionId}/coverage`, { patient: patientId });
  },

  /** Active conditions for a patient. */
  conditions(connectionId: string, patientId: string): Promise<{ items: ConditionDto[] }> {
    return get(`/fhir/${connectionId}/condition`, { patient: patientId });
  },

  /** Practitioner lookup. */
  practitioner(connectionId: string, practitionerId: string): Promise<PractitionerDto> {
    return get<PractitionerDto>(
      `/fhir/${connectionId}/practitioner/${practitionerId}`,
    );
  },

  /**
   * CDS Hooks last-mile prefill.
   * Called when the wizard opens from an order-sign deep-link.  No connectionId
   * is needed — the API auto-selects the hospital's first active Epic connection
   * and uses system-mode Backend Services to pull the data.
   */
  cdsPrefill(
    patientId: string,
    encounterId?: string,
  ): Promise<LaunchContextPrefill> {
    const params: Record<string, string> = { patientId };
    if (encounterId) params.encounterId = encounterId;
    return get<LaunchContextPrefill>('/fhir/cds-hooks-prefill', params);
  },
};

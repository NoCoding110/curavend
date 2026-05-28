/**
 * Condition — patient diagnoses. Feeds the wizard's ICD-10 selector.
 * Scope: `user/Condition.read` or `system/Condition.read`.
 */
import { fhirSearch, type FhirCallContext } from './fhirClient';

export interface ConditionDto {
  id: string;
  /** ICD-10 code if present (system = http://hl7.org/fhir/sid/icd-10-cm). */
  icd10?: string;
  /** SNOMED CT code if present. */
  snomed?: string;
  /** Display text. */
  displayText: string;
  clinicalStatus?: string;
  /** Date condition was first noted (ISO 8601). */
  onsetDate?: string;
  /** Date this Condition resource was recorded. */
  recordedDate?: string;
}

interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus?: { coding?: Array<{ code?: string }> };
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string };
  onsetDateTime?: string;
  onsetPeriod?: { start?: string };
  recordedDate?: string;
}

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm';
const SNOMED_SYSTEM = 'http://snomed.info/sct';

function mapCondition(c: FhirCondition): ConditionDto {
  const codings = c.code?.coding ?? [];
  const icd = codings.find((co) => co.system === ICD10_SYSTEM);
  const snomed = codings.find((co) => co.system === SNOMED_SYSTEM);
  const display =
    icd?.display ?? snomed?.display ?? codings[0]?.display ?? c.code?.text ?? '(no description)';
  return {
    id: c.id,
    icd10: icd?.code,
    snomed: snomed?.code,
    displayText: display,
    clinicalStatus: c.clinicalStatus?.coding?.[0]?.code,
    onsetDate: c.onsetDateTime ?? c.onsetPeriod?.start,
    recordedDate: c.recordedDate,
  };
}

/** Active conditions only (filter on clinical-status). */
export async function activeConditionsForPatient(
  ctx: FhirCallContext,
  patientId: string,
): Promise<ConditionDto[]> {
  const bundle = await fhirSearch<FhirCondition>(ctx, 'Condition', {
    patient: patientId,
    'clinical-status': 'active',
    _count: 50,
  });
  return (bundle.entry ?? [])
    .map((e) => mapCondition(e.resource))
    // Surface ICD-10-coded conditions first; they're more useful for orders.
    .sort((a, b) => (a.icd10 ? -1 : 1) - (b.icd10 ? -1 : 1));
}

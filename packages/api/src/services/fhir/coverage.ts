/**
 * Coverage — patient insurance. Drives prior-auth + eligibility flow.
 * Scope: `user/Coverage.read` or `system/Coverage.read`.
 */
import { fhirSearch, type FhirCallContext } from './fhirClient';

export interface CoverageDto {
  id: string;
  status?: string;
  /** Payor organization reference (Organization/{id}). */
  payorFhirId?: string;
  payorName?: string;
  /** Member ID printed on the insurance card. */
  memberId?: string;
  /** Group ID (employer plan grouping). */
  groupId?: string;
  /** Plan name (e.g. "BCBS PPO"). */
  planName?: string;
  /** Subscriber relationship to patient. */
  relationship?: string;
  /** Coverage period. */
  periodStart?: string;
  periodEnd?: string;
  /** Order — when patient has multiple plans, 1 = primary, 2 = secondary, etc. */
  order?: number;
}

interface FhirCoverage {
  resourceType: 'Coverage';
  id: string;
  status?: string;
  payor?: Array<{ reference?: string; display?: string }>;
  subscriberId?: string;
  identifier?: Array<{ value?: string; type?: { text?: string } }>;
  class?: Array<{ type?: { coding?: Array<{ code?: string }> }; value?: string; name?: string }>;
  relationship?: { coding?: Array<{ display?: string; code?: string }>; text?: string };
  period?: { start?: string; end?: string };
  order?: number;
}

function refToId(reference?: string): string | undefined {
  if (!reference) return undefined;
  const parts = reference.split('/');
  return parts[parts.length - 1];
}

function mapCoverage(c: FhirCoverage): CoverageDto {
  const payor = c.payor?.[0];
  const groupClass = c.class?.find((cl) =>
    cl.type?.coding?.some((co) => co.code === 'group'),
  );
  const planClass = c.class?.find((cl) =>
    cl.type?.coding?.some((co) => co.code === 'plan'),
  );
  const memberId =
    c.subscriberId ??
    c.identifier?.find((i) => i.type?.text?.toLowerCase().includes('member'))?.value ??
    c.identifier?.[0]?.value;
  return {
    id: c.id,
    status: c.status,
    payorFhirId: refToId(payor?.reference),
    payorName: payor?.display,
    memberId,
    groupId: groupClass?.value,
    planName: planClass?.name ?? planClass?.value,
    relationship:
      c.relationship?.coding?.[0]?.display ??
      c.relationship?.text,
    periodStart: c.period?.start,
    periodEnd: c.period?.end,
    order: c.order,
  };
}

/** Pull every coverage on file for the patient. Sorted primary → secondary by `order`. */
export async function coveragesForPatient(
  ctx: FhirCallContext,
  patientId: string,
): Promise<CoverageDto[]> {
  const bundle = await fhirSearch<FhirCoverage>(ctx, 'Coverage', {
    patient: patientId,
    _count: 20,
  });
  return (bundle.entry ?? [])
    .map((e) => mapCoverage(e.resource))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/**
 * Encounter — typed reads against Epic FHIR R4.
 * Scope: `user/Encounter.read` (user-delegated) or `system/Encounter.read`.
 */
import { fhirGet, fhirSearch, type FhirCallContext } from './fhirClient';

export interface EncounterDto {
  id: string;
  status?: string;
  /** Display value from class.code (e.g. "IMP" for inpatient). */
  classCode?: string;
  classDisplay?: string;
  /** Period start (ISO 8601). */
  periodStart?: string;
  periodEnd?: string;
  locationFhirId?: string;
  locationDisplay?: string;
  practitionerFhirId?: string;
  practitionerDisplay?: string;
  /** Service type display (often the department name in Epic). */
  serviceTypeDisplay?: string;
}

interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  status?: string;
  class?: { code?: string; display?: string };
  period?: { start?: string; end?: string };
  location?: Array<{ location?: { reference?: string; display?: string } }>;
  participant?: Array<{
    individual?: { reference?: string; display?: string };
    type?: Array<{ coding?: Array<{ code?: string }> }>;
  }>;
  serviceType?: { coding?: Array<{ display?: string }>; text?: string };
}

function refToId(reference?: string): string | undefined {
  if (!reference) return undefined;
  // e.g. "Location/abc123" or "Practitioner/abc123"
  const parts = reference.split('/');
  return parts[parts.length - 1];
}

function mapEncounter(e: FhirEncounter): EncounterDto {
  const loc = e.location?.[0]?.location;
  // Prefer participant flagged as PPRF (primary performer), else first.
  const primaryParticipant =
    e.participant?.find((p) =>
      p.type?.some((t) => t.coding?.some((c) => c.code === 'PPRF')),
    ) ?? e.participant?.[0];
  return {
    id: e.id,
    status: e.status,
    classCode: e.class?.code,
    classDisplay: e.class?.display,
    periodStart: e.period?.start,
    periodEnd: e.period?.end,
    locationFhirId: refToId(loc?.reference),
    locationDisplay: loc?.display,
    practitionerFhirId: refToId(primaryParticipant?.individual?.reference),
    practitionerDisplay: primaryParticipant?.individual?.display,
    serviceTypeDisplay:
      e.serviceType?.coding?.[0]?.display ?? e.serviceType?.text,
  };
}

export async function readEncounter(
  ctx: FhirCallContext,
  encounterId: string,
): Promise<EncounterDto> {
  const e = await fhirGet<FhirEncounter>(
    ctx,
    `Encounter/${encodeURIComponent(encounterId)}`,
  );
  return mapEncounter(e);
}

export async function activeEncountersForPatient(
  ctx: FhirCallContext,
  patientId: string,
): Promise<EncounterDto[]> {
  const bundle = await fhirSearch<FhirEncounter>(ctx, 'Encounter', {
    patient: patientId,
    status: 'in-progress,arrived,triaged',
    _count: 10,
  });
  return (bundle.entry ?? []).map((e) => mapEncounter(e.resource));
}

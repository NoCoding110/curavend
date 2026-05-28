/**
 * Practitioner — Epic provider directory.
 * Scope: `user/Practitioner.read` or `system/Practitioner.read`.
 */
import { fhirGet, type FhirCallContext } from './fhirClient';

export interface PractitionerDto {
  id: string;
  npi?: string;
  given: string[];
  family?: string;
  prefix?: string[];
  suffix?: string[];
  /** Full display name with prefix/suffix. */
  name: string;
  email?: string;
  phone?: string;
}

interface FhirPractitioner {
  resourceType: 'Practitioner';
  id: string;
  identifier?: Array<{ system?: string; value?: string }>;
  name?: Array<{
    given?: string[];
    family?: string;
    prefix?: string[];
    suffix?: string[];
  }>;
  telecom?: Array<{ system?: string; value?: string }>;
}

const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';

function mapPractitioner(p: FhirPractitioner): PractitionerDto {
  const nameEntry = p.name?.[0] ?? {};
  const given = nameEntry.given ?? [];
  const family = nameEntry.family;
  const prefix = nameEntry.prefix ?? [];
  const suffix = nameEntry.suffix ?? [];
  const npiIdent = p.identifier?.find((i) => i.system === NPI_SYSTEM);
  const telecom = p.telecom ?? [];
  return {
    id: p.id,
    npi: npiIdent?.value,
    given,
    family,
    prefix,
    suffix,
    name: [...prefix, ...given, family, ...suffix].filter(Boolean).join(' '),
    email: telecom.find((t) => t.system === 'email')?.value,
    phone: telecom.find((t) => t.system === 'phone')?.value,
  };
}

export async function readPractitioner(
  ctx: FhirCallContext,
  practitionerId: string,
): Promise<PractitionerDto> {
  const p = await fhirGet<FhirPractitioner>(
    ctx,
    `Practitioner/${encodeURIComponent(practitionerId)}`,
  );
  return mapPractitioner(p);
}

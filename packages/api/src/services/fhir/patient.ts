/**
 * Patient — typed reads against Epic FHIR R4.
 *
 * Scope: `user/Patient.read` (user-delegated) or `system/Patient.read` (backend).
 * USCDI v3 conformant.
 */
import { fhirGet, fhirSearch, type FhirCallContext } from './fhirClient';

export interface PatientDto {
  id: string;
  /** Primary MRN if found (uses `system === conn.mappingProfile.mrnSystem` when present, else first identifier). */
  mrn?: string;
  given: string[];
  family?: string;
  /** Full display name. */
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

interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  identifier?: Array<{ system?: string; value?: string; type?: { text?: string } }>;
  name?: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  telecom?: Array<{ system?: string; value?: string }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

function mapPatient(p: FhirPatient, mrnSystem?: string): PatientDto {
  const nameEntry = p.name?.[0] ?? {};
  const given = nameEntry.given ?? [];
  const family = nameEntry.family;
  const mrnIdent = mrnSystem
    ? p.identifier?.find((i) => i.system === mrnSystem)
    : p.identifier?.[0];
  const telecom = p.telecom ?? [];
  const phone = telecom.find((t) => t.system === 'phone')?.value;
  const email = telecom.find((t) => t.system === 'email')?.value;
  const addr = p.address?.[0];
  return {
    id: p.id,
    mrn: mrnIdent?.value,
    given,
    family,
    name: `${given.join(' ')} ${family ?? ''}`.trim(),
    dob: p.birthDate,
    gender: p.gender,
    phone,
    email,
    address: addr
      ? {
          line: addr.line ?? [],
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: addr.country,
        }
      : undefined,
  };
}

/** Read a Patient by FHIR id. */
export async function readPatient(
  ctx: FhirCallContext,
  patientId: string,
): Promise<PatientDto> {
  const mrnSystem = mrnSystemFor(ctx);
  const p = await fhirGet<FhirPatient>(ctx, `Patient/${encodeURIComponent(patientId)}`);
  return mapPatient(p, mrnSystem);
}

/** Search Patient by MRN. Returns the first match (Epic returns at most one per MRN). */
export async function searchPatientByMrn(
  ctx: FhirCallContext,
  mrn: string,
  mrnSystemOverride?: string,
): Promise<PatientDto | null> {
  const system = mrnSystemOverride ?? mrnSystemFor(ctx);
  if (!system) {
    throw new Error(
      'mrnSystem not configured. Set mappingProfile.mrnSystem on the EhrConnection (urn:oid:1.2.840.114350.1.13.X.Y.Z).',
    );
  }
  const bundle = await fhirSearch<FhirPatient>(ctx, 'Patient', {
    identifier: `${system}|${mrn}`,
    _count: 1,
  });
  const first = bundle.entry?.[0]?.resource;
  return first ? mapPatient(first, system) : null;
}

/** Extract the MRN OID from the connection's mappingProfile. */
function mrnSystemFor(ctx: FhirCallContext): string | undefined {
  if (!ctx.conn.mappingProfile) return undefined;
  try {
    const mp = JSON.parse(ctx.conn.mappingProfile);
    return typeof mp.mrnSystem === 'string' ? mp.mrnSystem : undefined;
  } catch {
    return undefined;
  }
}

/**
 * EhrAdapter — abstract interface for ingesting FHIR resources from any
 * EHR vendor (Epic, Cerner, Meditech, Athena, Allscripts, eCW, or generic
 * FHIR R4).
 *
 * v1 covers the most common case: a ServiceRequest (DME / lab kit / supply
 * order) arrives via the connection's webhook endpoint, gets verified for
 * authenticity, mapped to Curavend's internal Order shape, and either:
 *   - inserted as a new PENDING order, or
 *   - logged + held for manual review if the mapping has gaps.
 *
 * The mapping itself is data-driven (`ehr_connections.mapping_profile`
 * column stores a JSON path map). This means onboarding a new EHR's
 * payload shape is a configuration change, NOT a code change.
 */
import type { EhrVendor, EhrAuthMode } from '@curavend/db';

export interface EhrConnection {
  id: string;
  hospitalId: string;
  vendor: EhrVendor;
  authMode: EhrAuthMode;
  fhirBaseUrl: string | null;
  authClientId: string | null;
  authSecretEnvRef: string | null;
  sharedSecretEnvRef: string | null;
  apiKeyEnvRef: string | null;
  webhookSecretEnvRef: string | null;
  mappingProfile: string | null;
}

/**
 * Internal canonical order shape that all adapters target. Any field
 * mapping that produces this shape lets the rest of the pipeline (vendor
 * routing, pricing, contracts) work unchanged.
 */
export interface CanonicalOrder {
  patientName: string;
  patientDob?: string;
  patientGender?: string;
  patientPhone?: string;
  patientEmail?: string;
  patientAddressLine?: string;
  patientCity?: string;
  patientState?: string;
  patientZip?: string;
  hcpcCode?: string;
  icd10Codes?: string[];
  priority?: 'routine' | 'stat' | 'urgent';
  orderingPhysicianNpi?: string;
  orderingPhysicianName?: string;
  clinicalNote?: string;
  /** Original EHR resource ID — used for idempotency. */
  externalResourceId?: string;
  externalResourceType?: string;
}

/**
 * Pull a value from a deeply-nested object using a JSON-path-like
 * dot-notation string. Supports indices like `code.coding[0].code` and
 * the empty path "" (return the input itself).
 */
function pathGet(obj: any, path: string): any {
  if (!path) return obj;
  const parts = path.split('.').flatMap((p) => {
    // turn `name[0]` into ['name', 0]
    const m = p.match(/^(.+?)\[(\d+)\]$/);
    if (m) return [m[1], Number(m[2])];
    return [p];
  });
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Apply a JSON-path mapping profile to a FHIR resource to produce a
 * CanonicalOrder.
 *
 * Mapping profile shape:
 * {
 *   "patientName":     "subject.display",
 *   "patientDob":      "subject.birthDate",
 *   "hcpcCode":        "code.coding[0].code",
 *   "priority":        "priority",
 *   "icd10Codes":      { "fromArray": "reasonCode", "path": "coding[0].code" },
 *   "clinicalNote":    "note[0].text"
 * }
 *
 * The `fromArray` shape means: take the source array, map each element to
 * `path`, return the resulting array.
 */
export function applyMappingProfile(resource: any, mappingProfile: Record<string, any>): CanonicalOrder {
  const out: CanonicalOrder = { patientName: '' };
  for (const [key, mapper] of Object.entries(mappingProfile)) {
    let value: any;
    if (typeof mapper === 'string') {
      value = pathGet(resource, mapper);
    } else if (mapper && typeof mapper === 'object' && mapper.fromArray) {
      const arr = pathGet(resource, mapper.fromArray);
      if (Array.isArray(arr)) value = arr.map((el) => pathGet(el, mapper.path));
    }
    if (value != null) (out as any)[key] = value;
  }
  return out;
}

/**
 * Vendor-specific defaults. If the connection has no `mapping_profile`
 * configured, we fall back to a sane default per vendor based on
 * canonical FHIR shapes.
 */
export const DEFAULT_MAPPINGS: Record<EhrVendor, Record<string, any>> = {
  EPIC: {
    patientName: 'subject.display',
    patientDob: 'extension[0].valueDate',
    hcpcCode: 'code.coding[0].code',
    priority: 'priority',
    orderingPhysicianName: 'requester.display',
    clinicalNote: 'note[0].text',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
    icd10Codes: { fromArray: 'reasonCode', path: 'coding[0].code' },
  },
  CERNER: {
    patientName: 'subject.display',
    patientDob: 'subject.extension[0].valueDate',
    hcpcCode: 'code.coding[0].code',
    priority: 'priority',
    orderingPhysicianName: 'requester.display',
    clinicalNote: 'note[0].text',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
  },
  MEDITECH: {
    patientName: 'subject.display',
    hcpcCode: 'code.coding[0].code',
    priority: 'priority',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
  },
  ATHENA: {
    patientName: 'subject.display',
    hcpcCode: 'code.coding[0].code',
    priority: 'priority',
    orderingPhysicianName: 'requester.agent.display',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
  },
  ALLSCRIPTS: {
    patientName: 'subject.display',
    hcpcCode: 'code.coding[0].code',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
  },
  ECW: {
    patientName: 'subject.display',
    hcpcCode: 'code.coding[0].code',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
  },
  GENERIC_FHIR_R4: {
    patientName: 'subject.display',
    patientDob: 'subject.birthDate',
    hcpcCode: 'code.coding[0].code',
    priority: 'priority',
    orderingPhysicianName: 'requester.display',
    clinicalNote: 'note[0].text',
    externalResourceId: 'id',
    externalResourceType: 'resourceType',
    icd10Codes: { fromArray: 'reasonCode', path: 'coding[0].code' },
  },
};

/**
 * Map a raw FHIR resource (from any EHR) into Curavend's canonical
 * internal order. Uses the connection's mapping_profile if set, otherwise
 * the vendor's default mapping.
 */
export function mapResourceToOrder(connection: EhrConnection, resource: any): CanonicalOrder {
  const profile: Record<string, any> = connection.mappingProfile
    ? JSON.parse(connection.mappingProfile)
    : DEFAULT_MAPPINGS[connection.vendor];
  return applyMappingProfile(resource, profile);
}

/**
 * Verify the incoming webhook is genuinely from this EHR connection.
 *
 * v1 supports a simple `X-Curavend-Webhook-Signature` HMAC-SHA256 header
 * computed over the raw request body using the connection's webhook
 * secret. Caller passes the raw body string + signature header value.
 *
 * Returns:
 *   - true  if signature is valid OR no webhook secret is configured (dev/test)
 *   - false if the signature is wrong
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string | null | undefined,
  webhookSecret: string | null,
): Promise<boolean> {
  if (!webhookSecret) return true; // not enforced
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Constant-time compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

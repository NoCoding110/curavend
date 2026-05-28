/**
 * DocumentReference — push PDFs back to the Epic chart.
 *
 * Phase 2.J consumer. Called by:
 *   - manual admin trigger (POST /api/fhir/:connId/push-document)
 *   - the order-delivered queue handler (auto-push DWO + claim bundle)
 *
 * Per `EPIC_FHIR_REFERENCE.md` §3 line 93, DocumentReference.Create is the
 * primary supported write path. Each customer whitelists which LOINC doc-type
 * codes they accept; we read that from `conn.mappingProfile.documentReferenceLoincWhitelist`
 * and refuse to post if our chosen code isn't on the list.
 *
 * Uses Backend Services bearer (system/DocumentReference.write) by default
 * because the push runs asynchronously after delivery, outside any user session.
 */
import { fhirPost, type FhirCallContext } from './fhirClient';
import { AppError } from '../../lib/errors';
import type { EhrConnection } from '../ehrAdapter';
import type { Env } from '../../lib/env';

export interface PushDocumentInput {
  /** FHIR Patient.id this document belongs to. */
  patientId: string;
  /** Optional FHIR Encounter.id to scope the doc to a specific visit. */
  encounterId?: string;
  /** LOINC code identifying the document type — must be in the connection's whitelist. */
  loincCode: string;
  /** Human-readable display for the LOINC code (e.g. "Referral note"). */
  loincDisplay?: string;
  /** Title shown in the chart's document list. */
  title: string;
  /** Raw PDF bytes — will be base64-encoded into content.attachment.data. */
  pdfBytes: Uint8Array;
  /** Stable identifier for idempotency (e.g. `order-<id>-dwo-v1`). */
  idempotencyKey: string;
  /** Optional FHIR Practitioner.id for `author[]`. */
  authorPractitionerId?: string;
  /** Optional description (one-line summary). */
  description?: string;
}

export interface PushDocumentResult {
  /** FHIR DocumentReference.id assigned by Epic. */
  fhirId: string;
  /** Echo of the idempotency key we sent. */
  idempotencyKey: string;
}

/** LOINC codes Curavend defaults to when no per-customer whitelist is set. */
const DEFAULT_WHITELIST = [
  '57133-1', // Personal supplies of records
  '34108-1', // Outpatient note
  '11506-3', // Progress note
  '34117-2', // History and physical note
];

function whitelistFor(conn: EhrConnection): string[] {
  if (!conn.mappingProfile) return DEFAULT_WHITELIST;
  try {
    const mp = JSON.parse(conn.mappingProfile);
    if (Array.isArray(mp.documentReferenceLoincWhitelist) && mp.documentReferenceLoincWhitelist.length > 0) {
      return mp.documentReferenceLoincWhitelist;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_WHITELIST;
}

/** base64-encode a Uint8Array without going through atob/btoa size limits. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  // Chunk to avoid call-stack overflow on large PDFs.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(bin);
}

/**
 * POST a FHIR DocumentReference to Epic. Idempotent via FHIR's `If-None-Exist`
 * header keyed on our `idempotencyKey` — retrying won't create duplicates.
 *
 * Returns the assigned FHIR resource id. Throws AppError on validation failure
 * or Epic rejection.
 */
export async function createDocumentReference(
  env: Env,
  conn: EhrConnection,
  input: PushDocumentInput,
): Promise<PushDocumentResult> {
  // Validate the LOINC code is whitelisted for this customer.
  const allowed = whitelistFor(conn);
  if (!allowed.includes(input.loincCode)) {
    throw new AppError(
      400,
      `LOINC code ${input.loincCode} not in this customer's whitelist (${allowed.join(', ')}). Add it to mappingProfile.documentReferenceLoincWhitelist.`,
      'DOCREF_LOINC_NOT_WHITELISTED',
    );
  }

  const ctx: FhirCallContext = {
    env,
    conn,
    userId: '__system__', // unused in system mode
    mode: 'system',
    systemScope: 'system/DocumentReference.write',
  };

  const identifier = `https://curavend.io|${input.idempotencyKey}`;
  const body: Record<string, unknown> = {
    resourceType: 'DocumentReference',
    status: 'current',
    docStatus: 'final',
    identifier: [
      { system: 'https://curavend.io', value: input.idempotencyKey },
    ],
    type: {
      coding: [
        {
          system: 'http://loinc.org',
          code: input.loincCode,
          display: input.loincDisplay,
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
            code: 'clinical-note',
          },
        ],
      },
    ],
    subject: { reference: `Patient/${input.patientId}` },
    date: new Date().toISOString(),
    description: input.description,
    content: [
      {
        attachment: {
          contentType: 'application/pdf',
          data: bytesToBase64(input.pdfBytes),
          title: input.title,
          creation: new Date().toISOString(),
        },
      },
    ],
  };
  if (input.encounterId) {
    (body as Record<string, unknown>).context = {
      encounter: [{ reference: `Encounter/${input.encounterId}` }],
    };
  }
  if (input.authorPractitionerId) {
    (body as Record<string, unknown>).author = [
      { reference: `Practitioner/${input.authorPractitionerId}` },
    ];
  }

  const created = await fhirPost<{ id: string; resourceType: 'DocumentReference' }>(
    ctx,
    'DocumentReference',
    body,
    {
      // FHIR conditional-create: skip the POST if a DocumentReference with this
      // identifier already exists. Epic returns the existing resource id.
      'If-None-Exist': `identifier=${identifier}`,
    },
  );
  return { fhirId: created.id, idempotencyKey: input.idempotencyKey };
}

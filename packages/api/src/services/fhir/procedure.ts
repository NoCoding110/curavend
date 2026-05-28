/**
 * Procedure — push HCPC charges back to Epic for charge capture.
 *
 * Phase 2.K consumer. Fires when an order transitions to ORDER_COMPLETED.
 * For each line item, posts a Procedure resource keyed by the HCPC code so
 * Epic Resolute Professional Billing picks up the charge.
 *
 * Per `EPIC_FHIR_REFERENCE.md` line 92: customer-gated — most hospital billing
 * teams want to review external charges before billing. We post with `status:
 * completed` but the customer's workflow decides whether it auto-bills or sits
 * in a review queue.
 *
 * Customer opts in via `mappingProfile.procedureWriteEnabled: true`. Default
 * disabled — we never push without explicit opt-in.
 */
import { fhirPost, type FhirCallContext } from './fhirClient';
import { AppError } from '../../lib/errors';
import type { EhrConnection } from '../ehrAdapter';
import type { Env } from '../../lib/env';

export interface PushProcedureInput {
  patientId: string;
  encounterId: string;
  hcpcCode: string;
  hcpcDisplay?: string;
  /** ISO 8601 — when the procedure / supply delivery happened. */
  performedDateTime: string;
  quantity?: number;
  performerPractitionerId?: string;
  /** Stable id for retry idempotency (e.g. `order-<id>-item-<orderItemId>`). */
  idempotencyKey: string;
}

export interface PushProcedureResult {
  fhirId: string;
  idempotencyKey: string;
}

const HCPCS_SYSTEM = 'https://bluebutton.cms.gov/resources/codesystem/hcpcs';

function isEnabled(conn: EhrConnection): boolean {
  if (!conn.mappingProfile) return false;
  try {
    const mp = JSON.parse(conn.mappingProfile);
    return mp.procedureWriteEnabled === true;
  } catch {
    return false;
  }
}

export async function createProcedure(
  env: Env,
  conn: EhrConnection,
  input: PushProcedureInput,
): Promise<PushProcedureResult> {
  if (!isEnabled(conn)) {
    throw new AppError(
      400,
      'Procedure write-back is disabled for this connection. Set mappingProfile.procedureWriteEnabled = true to opt in.',
      'PROCEDURE_WRITE_DISABLED',
    );
  }
  const ctx: FhirCallContext = {
    env,
    conn,
    userId: '__system__',
    mode: 'system',
    systemScope: 'system/Procedure.write',
  };

  const identifier = `https://curavend.io|${input.idempotencyKey}`;
  const body: Record<string, unknown> = {
    resourceType: 'Procedure',
    status: 'completed',
    identifier: [
      { system: 'https://curavend.io', value: input.idempotencyKey },
    ],
    code: {
      coding: [
        {
          system: HCPCS_SYSTEM,
          code: input.hcpcCode,
          display: input.hcpcDisplay,
        },
      ],
    },
    subject: { reference: `Patient/${input.patientId}` },
    encounter: { reference: `Encounter/${input.encounterId}` },
    performedDateTime: input.performedDateTime,
  };
  if (input.performerPractitionerId) {
    (body as Record<string, unknown>).performer = [
      { actor: { reference: `Practitioner/${input.performerPractitionerId}` } },
    ];
  }
  if (input.quantity && input.quantity > 1) {
    // FHIR doesn't have a native quantity field on Procedure — encode it as a
    // note so the billing reviewer sees it. Customers who care about per-unit
    // billing typically use ChargeItem instead.
    (body as Record<string, unknown>).note = [
      { text: `Quantity: ${input.quantity}` },
    ];
  }

  const created = await fhirPost<{ id: string; resourceType: 'Procedure' }>(
    ctx,
    'Procedure',
    body,
    { 'If-None-Exist': `identifier=${identifier}` },
  );
  return { fhirId: created.id, idempotencyKey: input.idempotencyKey };
}

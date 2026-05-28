/**
 * connectionRegistry — load EhrConnection rows from D1 and resolve their
 * secrets out of Worker env. Kept separate from `ehrAdapter.ts` so that
 * file stays pure (no DB/env coupling) and easy to unit-test.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { ehrConnections } from '@curavend/db';
import type { Env } from '../lib/env';
import type { EhrConnection } from './ehrAdapter';

/** Look up an EhrConnection by id. Returns null if missing or inactive. */
export async function loadConnection(
  env: Env,
  connectionId: string,
): Promise<EhrConnection | null> {
  const db = getDb(env.DB);
  const [row] = await db
    .select()
    .from(ehrConnections)
    .where(eq(ehrConnections.id, connectionId))
    .limit(1);
  if (!row) return null;
  if (row.isActive !== 1) return null;
  return row as unknown as EhrConnection;
}

/** Look up an EhrConnection by FHIR base URL (used to resolve `iss` → conn during EHR Launch). */
export async function loadConnectionByIssuer(
  env: Env,
  iss: string,
): Promise<EhrConnection | null> {
  const db = getDb(env.DB);
  const normalized = iss.replace(/\/$/, '');
  // Try with and without trailing slash — Epic isn't consistent.
  const [row] =
    (await db
      .select()
      .from(ehrConnections)
      .where(eq(ehrConnections.fhirBaseUrl, normalized))
      .limit(1)) ??
    (await db
      .select()
      .from(ehrConnections)
      .where(eq(ehrConnections.fhirBaseUrl, normalized + '/'))
      .limit(1));
  if (!row) return null;
  if (row.isActive !== 1) return null;
  return row as unknown as EhrConnection;
}

/**
 * Find the first active EPIC connection for a hospital. Used by the
 * CDS-Hooks prefill endpoint where no specific connectionId is known —
 * we auto-select the hospital's only (or first) Epic link.
 * Returns null if the hospital has no active EPIC connection.
 */
export async function loadEpicConnectionForHospital(
  env: Env,
  hospitalId: string,
): Promise<EhrConnection | null> {
  const db = getDb(env.DB);
  const [row] = await db
    .select()
    .from(ehrConnections)
    .where(
      and(
        eq(ehrConnections.hospitalId, hospitalId),
        eq(ehrConnections.vendor, 'EPIC'),
        eq(ehrConnections.isActive, 1),
      ),
    )
    .limit(1);
  if (!row) return null;
  return row as unknown as EhrConnection;
}

/**
 * Resolve a Worker secret by env-var name reference.
 * Returns null if the ref is empty/undefined or the env var doesn't exist.
 */
export function resolveSecret(
  env: Env,
  ref: string | null | undefined,
): string | null {
  if (!ref) return null;
  const val = (env as unknown as Record<string, string | undefined>)[ref];
  return val ?? null;
}

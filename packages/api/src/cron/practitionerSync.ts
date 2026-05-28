/**
 * Nightly Practitioner directory sync.
 *
 * Walks every active EHR connection that supports Backend Services
 * (`auth_mode != SHARED_SECRET / API_KEY`, vendor=EPIC for v1) and pulls
 * the full Practitioner list into KV so we can answer "who is NPI 123…"
 * locally — without burning a FHIR call on every order.
 *
 * Storage:
 *   epic:practitioners:{connId}            JSON {syncedAt, count} — last run summary
 *   epic:practitioner:{connId}:{practId}   per-Practitioner DTO (TTL 30d)
 *   epic:practitioner-by-npi:{connId}:{npi}  → practId (TTL 30d)
 *
 * Run by the daily 0 8 * * * cron. Errors per connection are logged but
 * never halt the sweep — one customer's outage shouldn't poison another's.
 */
import { fhirGet, type FhirCallContext } from '../services/fhir/fhirClient';
import { getDb } from '../lib/db';
import { ehrConnections } from '@curavend/db';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../lib/env';
import type { EhrConnection } from '../services/ehrAdapter';

const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';
const KV_TTL_S = 60 * 60 * 24 * 30; // 30 days
const PAGE_SIZE = 100;
const MAX_PAGES = 100; // 10 000 practitioners per connection cap

interface FhirPractitioner {
  resourceType: 'Practitioner';
  id: string;
  active?: boolean;
  identifier?: Array<{ system?: string; value?: string }>;
  name?: Array<{
    given?: string[];
    family?: string;
    prefix?: string[];
    suffix?: string[];
  }>;
  telecom?: Array<{ system?: string; value?: string }>;
}

interface FhirBundle {
  resourceType: 'Bundle';
  type: string;
  entry?: Array<{ resource: FhirPractitioner }>;
  link?: Array<{ relation: string; url: string }>;
}

interface CachedPractitioner {
  id: string;
  npi?: string;
  given: string[];
  family?: string;
  prefix?: string[];
  suffix?: string[];
  name: string;
  email?: string;
  phone?: string;
  active: boolean;
  syncedAt: string;
}

interface SyncResult {
  connectionsAttempted: number;
  connectionsSucceeded: number;
  connectionsFailed: number;
  totalPractitionersSynced: number;
  errors: Array<{ connectionId: string; message: string }>;
}

function mapPractitioner(p: FhirPractitioner): CachedPractitioner {
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
    active: p.active !== false,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Sync one connection's Practitioner directory. Paginates by following
 * `Bundle.link[rel=next]` up to MAX_PAGES.
 */
async function syncOne(
  env: Env,
  conn: EhrConnection,
): Promise<{ count: number }> {
  const ctx: FhirCallContext = {
    env,
    conn,
    userId: '__system__',
    mode: 'system',
    systemScope: 'system/Practitioner.read',
  };

  let nextPath: string | null = `Practitioner?_count=${PAGE_SIZE}`;
  let page = 0;
  let total = 0;

  while (nextPath && page < MAX_PAGES) {
    const bundle: FhirBundle = await fhirGet<FhirBundle>(ctx, nextPath);
    const entries = bundle.entry ?? [];

    for (const entry of entries) {
      if (entry.resource?.resourceType !== 'Practitioner') continue;
      const dto = mapPractitioner(entry.resource);
      // Skip inactive Practitioners — we don't need them in the picker.
      if (!dto.active) continue;
      total++;

      // Cache by id
      await env.KV.put(
        `epic:practitioner:${conn.id}:${dto.id}`,
        JSON.stringify(dto),
        { expirationTtl: KV_TTL_S },
      );
      // Reverse-lookup by NPI (skip if no NPI on record)
      if (dto.npi) {
        await env.KV.put(
          `epic:practitioner-by-npi:${conn.id}:${dto.npi}`,
          dto.id,
          { expirationTtl: KV_TTL_S },
        );
      }
    }

    // Follow Bundle.link[rel=next] for pagination
    const next: string | null =
      bundle.link?.find((l: { relation: string; url: string }) => l.relation === 'next')?.url ?? null;
    if (next) {
      // The link is absolute. fhirGet wants a path relative to fhirBaseUrl.
      // Strip the base prefix; fall back to the absolute URL if it doesn't match.
      if (conn.fhirBaseUrl && next.startsWith(conn.fhirBaseUrl)) {
        nextPath = next.slice(conn.fhirBaseUrl.length).replace(/^\//, '');
      } else {
        nextPath = next;
      }
    } else {
      nextPath = null;
    }
    page++;
  }

  // Mark sync summary
  await env.KV.put(
    `epic:practitioners:${conn.id}`,
    JSON.stringify({ syncedAt: new Date().toISOString(), count: total }),
    { expirationTtl: KV_TTL_S * 2 },
  );

  return { count: total };
}

export async function handlePractitionerSync(env: Env): Promise<SyncResult> {
  const result: SyncResult = {
    connectionsAttempted: 0,
    connectionsSucceeded: 0,
    connectionsFailed: 0,
    totalPractitionersSynced: 0,
    errors: [],
  };

  const db = getDb(env.DB);
  // Backend Services is only supported for EPIC (v1). When we add Cerner/Athena
  // we'll widen this filter.
  const rows = await db
    .select()
    .from(ehrConnections)
    .where(
      and(
        eq(ehrConnections.isActive, 1),
        eq(ehrConnections.vendor, 'EPIC'),
      ),
    )
    .all();

  for (const row of rows) {
    if (!row.fhirBaseUrl || !row.authClientId) {
      // Connection not fully configured — skip silently.
      continue;
    }
    result.connectionsAttempted++;
    const conn: EhrConnection = {
      id: row.id,
      hospitalId: row.hospitalId,
      vendor: row.vendor as EhrConnection['vendor'],
      authMode: row.authMode as EhrConnection['authMode'],
      fhirBaseUrl: row.fhirBaseUrl,
      authClientId: row.authClientId,
      authSecretEnvRef: row.authSecretEnvRef,
      sharedSecretEnvRef: row.sharedSecretEnvRef,
      apiKeyEnvRef: row.apiKeyEnvRef,
      webhookSecretEnvRef: row.webhookSecretEnvRef,
      mappingProfile: row.mappingProfile,
    };

    try {
      const { count } = await syncOne(env, conn);
      result.connectionsSucceeded++;
      result.totalPractitionersSynced += count;
      console.log(
        `[cron/practitionerSync] ${conn.id} (${row.name}): synced ${count} practitioners`,
      );
    } catch (err) {
      result.connectionsFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ connectionId: conn.id, message: msg });
      console.error(
        `[cron/practitionerSync] ${conn.id} failed: ${msg.slice(0, 200)}`,
      );
    }
  }

  return result;
}

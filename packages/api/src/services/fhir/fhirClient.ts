/**
 * fhirClient — shared HTTP layer for typed FHIR resource services.
 *
 * Handles:
 *   - token resolution (user-delegated; backend-services mode arrives in 2.L)
 *   - one-shot 401 retry after refresh
 *   - Accept: application/fhir+json
 *   - structured error mapping (Epic's OperationOutcome.issue[].diagnostics → AppError)
 *   - cheap pagination via `link[rel=next]` follow
 *
 * Every typed service (patient.ts, encounter.ts, coverage.ts, …) consumes
 * `fhirGet` / `fhirSearch` / `fhirPost` from here — nothing else in Curavend
 * should `fetch()` Epic directly.
 */
import { AppError } from '../../lib/errors';
import { safeFetch } from '../../lib/safeFetch';
import { getSmartConfig } from './smartDiscovery';
import { getValidAccessToken } from './tokenStore';
import { getBackendAccessToken } from './backendServicesAuth';
import type { Env } from '../../lib/env';
import type { EhrConnection } from '../ehrAdapter';

export interface FhirCallContext {
  env: Env;
  conn: EhrConnection;
  /** User-delegated mode: the Curavend userId whose stored token to use. */
  userId: string;
  /** When 'system', uses Backend Services client_credentials JWT instead of the user-delegated token. */
  mode?: 'user' | 'system';
  /** Required when mode === 'system'. Space-separated scope set requested from Epic. */
  systemScope?: string;
}

export interface FhirSearchBundle<T = unknown> {
  resourceType: 'Bundle';
  type: 'searchset';
  total?: number;
  entry?: Array<{ resource: T; fullUrl?: string }>;
  link?: Array<{ relation: string; url: string }>;
}

/** Internal: assemble the base URL with a trailing slash stripped. */
function baseUrl(conn: EhrConnection): string {
  if (!conn.fhirBaseUrl) throw new AppError(500, 'Connection has no fhirBaseUrl', 'FHIR_CONFIG');
  return conn.fhirBaseUrl.replace(/\/$/, '');
}

/** Internal: get a valid access token for the call (user-delegated OR Backend Services). */
async function tokenFor(ctx: FhirCallContext): Promise<string> {
  if (!ctx.conn.fhirBaseUrl) {
    throw new AppError(500, 'Connection has no fhirBaseUrl', 'FHIR_CONFIG');
  }
  if (ctx.mode === 'system') {
    if (!ctx.systemScope) {
      throw new AppError(
        500,
        'systemScope required when mode is "system"',
        'FHIR_SYSTEM_SCOPE_MISSING',
      );
    }
    return await getBackendAccessToken(ctx.env, ctx.conn, ctx.systemScope);
  }
  const smart = await getSmartConfig(ctx.env, ctx.conn.fhirBaseUrl);
  const tok = await getValidAccessToken(ctx.env, ctx.conn, ctx.userId, smart.token_endpoint);
  if (!tok) {
    throw new AppError(
      401,
      'Not connected to Epic for this connection — re-launch required',
      'EPIC_NOT_CONNECTED',
    );
  }
  return tok;
}

/** Parse an OperationOutcome to extract a human-readable error message. */
function extractOperationOutcomeMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.resourceType === 'OperationOutcome' && Array.isArray(parsed.issue)) {
      const msgs = parsed.issue
        .map((i: { diagnostics?: string; details?: { text?: string } }) =>
          i.diagnostics ?? i.details?.text,
        )
        .filter(Boolean);
      if (msgs.length > 0) return msgs.join(' | ');
    }
  } catch {
    /* not JSON — fall through */
  }
  return body.slice(0, 300);
}

/**
 * GET a single FHIR resource by `Type/id` path.
 * Auto-refreshes once on 401.
 */
export async function fhirGet<T = unknown>(
  ctx: FhirCallContext,
  resourcePath: string,
): Promise<T> {
  const token = await tokenFor(ctx);
  const url = `${baseUrl(ctx.conn)}/${resourcePath}`;
  let res = await safeFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/fhir+json',
    },
  });
  if (res.status === 401) {
    // Force refresh + retry once.
    const fresh = await tokenFor(ctx);
    res = await safeFetch(url, {
      headers: {
        Authorization: `Bearer ${fresh}`,
        Accept: 'application/fhir+json',
      },
    });
  }
  if (res.status === 404) {
    throw new AppError(404, `Resource not found: ${resourcePath}`, 'FHIR_NOT_FOUND');
  }
  if (!res.ok) {
    const detail = extractOperationOutcomeMessage(await res.text());
    throw new AppError(
      502,
      `Epic FHIR ${res.status}: ${detail}`,
      'FHIR_UPSTREAM_ERROR',
    );
  }
  return (await res.json()) as T;
}

/**
 * Search FHIR resources by type with query params.
 * Returns the raw Bundle; callers map `entry[].resource` to DTOs.
 */
export async function fhirSearch<T = unknown>(
  ctx: FhirCallContext,
  resourceType: string,
  params: Record<string, string | number | undefined>,
): Promise<FhirSearchBundle<T>> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.set(k, String(v));
  }
  return await fhirGet<FhirSearchBundle<T>>(ctx, `${resourceType}?${q}`);
}

/**
 * POST a new FHIR resource. Used by Phase 2 write-back (DocumentReference,
 * Procedure). Returns the server-assigned resource (includes id).
 */
export async function fhirPost<T = unknown>(
  ctx: FhirCallContext,
  resourceType: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<T> {
  const token = await tokenFor(ctx);
  const url = `${baseUrl(ctx.conn)}/${resourceType}`;
  let res = await safeFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/fhir+json',
      'Content-Type': 'application/fhir+json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const fresh = await tokenFor(ctx);
    res = await safeFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fresh}`,
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok && res.status !== 201) {
    const detail = extractOperationOutcomeMessage(await res.text());
    throw new AppError(
      502,
      `Epic FHIR ${res.status}: ${detail}`,
      'FHIR_UPSTREAM_ERROR',
    );
  }
  return (await res.json()) as T;
}

/** Walk every page of a search Bundle, accumulating resources. Caps at maxPages to bound runtime. */
export async function fhirSearchAll<T = unknown>(
  ctx: FhirCallContext,
  resourceType: string,
  params: Record<string, string | number | undefined>,
  maxPages = 5,
): Promise<T[]> {
  const out: T[] = [];
  let bundle = await fhirSearch<T>(ctx, resourceType, params);
  let page = 1;
  while (true) {
    for (const e of bundle.entry ?? []) out.push(e.resource);
    const nextLink = bundle.link?.find((l) => l.relation === 'next');
    if (!nextLink || page >= maxPages) break;
    // The next-link URL is absolute; we still need to add auth header.
    const token = await tokenFor(ctx);
    const res = await safeFetch(nextLink.url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/fhir+json' },
    });
    if (!res.ok) break;
    bundle = (await res.json()) as FhirSearchBundle<T>;
    page++;
  }
  return out;
}

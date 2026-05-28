/**
 * Epic / FHIR — multi-tenant SMART on FHIR adapter.
 *
 * Driven entirely by the `ehrConnections` table (vendor=EPIC). Per-(connection,
 * user) tokens live in KV under `epic:token:{connId}:{userId}`; per-tenant SMART
 * configuration is discovered on first use and cached 24h.
 *
 * Endpoints (all require ?connectionId=... except /redirect which carries it
 * via signed state, and /launch which resolves it from `iss`):
 *
 *   GET    /authorize-url     — start Standalone Launch, returns Epic auth URL
 *   GET    /redirect          — OAuth callback (public — Epic POSTs unauthenticated)
 *   GET    /launch            — EHR Launch entry point (public — Epic redirects clinician here)
 *   GET    /token-status      — connected? when does the token expire?
 *   GET    /smart-config      — debug: show cached SMART configuration
 *   GET    /patient/:id       — read a Patient resource (full services arrive in 1.E)
 *   POST   /sync              — DEPRECATED. Returns 410.
 *   DELETE /disconnect        — clear stored tokens for the calling user
 */
import { Hono } from 'hono';
import { ValidationError, NotFoundError } from '../lib/errors';
import {
  loadConnection,
  loadConnectionByIssuer,
  loadEpicConnectionForHospital,
  resolveSecret,
} from '../services/connectionRegistry';
import { getSmartConfig } from '../services/fhir/smartDiscovery';
import { safeFetch } from '../lib/safeFetch';
import {
  makePkce,
  signState,
  verifyState,
  stashVerifier,
  popVerifier,
} from '../services/fhir/oauthFlow';
import {
  putToken,
  getToken,
  deleteToken,
  getValidAccessToken,
  type StoredToken,
} from '../services/fhir/tokenStore';
import type { FhirCallContext } from '../services/fhir/fhirClient';
import { readPatient, searchPatientByMrn } from '../services/fhir/patient';
import { readEncounter, activeEncountersForPatient } from '../services/fhir/encounter';
import { coveragesForPatient } from '../services/fhir/coverage';
import { activeConditionsForPatient } from '../services/fhir/condition';
import { readPractitioner } from '../services/fhir/practitioner';
import { createDocumentReference } from '../services/fhir/documentReference';
import { createProcedure } from '../services/fhir/procedure';
import { getOrMintConnectionKeypair } from '../services/fhir/backendServicesAuth';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

const DEFAULT_SCOPES = [
  'launch',
  'openid',
  'fhirUser',
  'offline_access',
  'user/Patient.read',
  'user/Encounter.read',
  'user/Practitioner.read',
  'user/PractitionerRole.read',
  'user/Location.read',
  'user/Organization.read',
  'user/Coverage.read',
  'user/Condition.read',
  'user/AllergyIntolerance.read',
  'user/MedicationRequest.read',
  'user/ServiceRequest.read',
  'user/DeviceRequest.read',
  'user/DocumentReference.read',
].join(' ');

/** Stable Worker URL for Epic's redirect_uri. Must exactly match what's registered on fhir.epic.com. */
function redirectUri(_env: Env): string {
  return 'https://curavend-api.metabilityllc1.workers.dev/api/fhir/redirect';
}

/** Read scopes from `mappingProfile.requestedScopes` if set, else use defaults. */
function scopesFor(mappingProfile: string | null): string {
  if (!mappingProfile) return DEFAULT_SCOPES;
  try {
    const mp = JSON.parse(mappingProfile);
    if (Array.isArray(mp.requestedScopes) && mp.requestedScopes.length > 0) {
      return mp.requestedScopes.join(' ');
    }
  } catch {
    /* malformed mapping profile — fall back to defaults */
  }
  return DEFAULT_SCOPES;
}

/** Sanitized SMART context blob — never includes tokens. Passed to SPA via URL hash. */
function buildLaunchCtx(connId: string, token: StoredToken): string {
  const ctx = {
    connId,
    patientId: token.patient,
    encounterId: token.encounter,
    fhirUser: token.fhirUser,
  };
  return btoa(JSON.stringify(ctx));
}

/** Extract the `fhirUser` claim from an ID token without verifying signature. */
function extractFhirUserFromIdToken(idToken: string): string | undefined {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    return decoded.fhirUser as string | undefined;
  } catch {
    return undefined;
  }
}

// ─── GET /authorize-url ─────────────────────────────────────────────────────
// Standalone Launch: user clicks "Connect to Epic" in EhrConnections admin.
// Returns the Epic authorization URL the SPA should redirect the browser to.
app.get('/authorize-url', async (c) => {
  const connectionId = c.req.query('connectionId');
  if (!connectionId) throw new ValidationError('connectionId query param required');

  const user = c.get('user');
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  if (!conn.fhirBaseUrl) throw new ValidationError('Connection has no fhirBaseUrl configured');
  if (!conn.authClientId) throw new ValidationError('Connection has no authClientId configured');

  const smart = await getSmartConfig(c.env, conn.fhirBaseUrl);
  const { verifier, challenge } = await makePkce();
  const nonce = crypto.randomUUID();
  await stashVerifier(c.env, nonce, verifier);
  const state = await signState(c.env, { connId: connectionId, userId: user.id, nonce });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: conn.authClientId,
    redirect_uri: redirectUri(c.env),
    scope: scopesFor(conn.mappingProfile),
    state,
    aud: conn.fhirBaseUrl,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return c.json({ url: `${smart.authorization_endpoint}?${params}` });
});

// ─── GET /launch ─────────────────────────────────────────────────────────────
// EHR Launch entry point. Epic redirects clinician here with ?iss=&launch=.
// PUBLIC — Epic doesn't carry our JWT; auth is bootstrapped via Epic's own
// authorize screen. Caller must come through PUBLIC_PATTERNS in auth.ts.
app.get('/launch', async (c) => {
  const iss = c.req.query('iss');
  const launchToken = c.req.query('launch');
  if (!iss) throw new ValidationError('iss query param required (Epic EHR Launch)');
  if (!launchToken) throw new ValidationError('launch query param required');

  const conn = await loadConnectionByIssuer(c.env, iss);
  if (!conn) {
    return c.json(
      {
        error: 'No active Epic connection found for this issuer',
        iss,
        hint: 'Hospital admin must register this Epic instance in EHR Connections first.',
      },
      404,
    );
  }
  if (!conn.fhirBaseUrl || !conn.authClientId) {
    return c.json({ error: 'Connection misconfigured' }, 500);
  }

  const smart = await getSmartConfig(c.env, conn.fhirBaseUrl);
  const { verifier, challenge } = await makePkce();
  const nonce = crypto.randomUUID();
  await stashVerifier(c.env, nonce, verifier);
  const state = await signState(c.env, {
    connId: conn.id,
    launchToken,
    iss,
    nonce,
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: conn.authClientId,
    redirect_uri: redirectUri(c.env),
    scope: scopesFor(conn.mappingProfile),
    state,
    aud: conn.fhirBaseUrl,
    launch: launchToken,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return c.redirect(`${smart.authorization_endpoint}?${params}`, 302);
});

// ─── GET /redirect ───────────────────────────────────────────────────────────
// OAuth callback. PUBLIC — Epic POSTs unauthenticated.
app.get('/redirect', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');

  if (errorParam) {
    return c.json(
      {
        error: 'Epic returned an error',
        epic_error: errorParam,
        epic_error_description: c.req.query('error_description') ?? null,
      },
      400,
    );
  }
  if (!code || !state) return c.json({ error: 'Missing code or state' }, 400);

  const parsed = await verifyState(c.env, state);
  if (!parsed) return c.json({ error: 'Invalid or expired state' }, 400);

  const verifier = await popVerifier(c.env, parsed.nonce);
  if (!verifier) return c.json({ error: 'PKCE verifier missing or already consumed' }, 400);

  const conn = await loadConnection(c.env, parsed.connId);
  if (!conn) return c.json({ error: 'Connection not found' }, 404);
  if (!conn.fhirBaseUrl) return c.json({ error: 'Connection misconfigured (no fhirBaseUrl)' }, 500);

  const smart = await getSmartConfig(c.env, conn.fhirBaseUrl);
  const clientSecret = resolveSecret(c.env, conn.authSecretEnvRef);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(c.env),
    client_id: conn.authClientId ?? '',
    code_verifier: verifier,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const tokenRes = await safeFetch(smart.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error('[epic] token exchange failed', tokenRes.status, errBody);
    return c.json(
      {
        error: 'Epic token exchange failed',
        status: tokenRes.status,
        detail: errBody.slice(0, 500),
      },
      502,
    );
  }

  const t = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    patient?: string;
    encounter?: string;
    id_token?: string;
  };

  const stored: StoredToken = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + t.expires_in * 1000,
    scope: t.scope ?? '',
    patient: t.patient,
    encounter: t.encounter,
    fhirUser: t.id_token ? extractFhirUserFromIdToken(t.id_token) : undefined,
    stored_at: Date.now(),
  };

  // For Standalone Launch, parsed.userId is set — bind tokens to that user.
  // For EHR Launch, parsed.userId is null — bind tokens to the fhirUser claim
  // (so subsequent reads find them). The SPA will need a Curavend user binding
  // separately, handled by the launch-bounce page in 1.C.
  const tokenOwner = parsed.userId ?? `fhir:${stored.fhirUser ?? 'anonymous'}`;
  await putToken(c.env, conn.id, tokenOwner, stored);

  // Redirect to SPA with sanitized context in URL hash (no token leaks).
  const ctx = buildLaunchCtx(conn.id, stored);
  const target = `${c.env.FRONTEND_URL}/fhir-launch-bounce#ctx=${ctx}`;
  return c.redirect(target, 302);
});

// ─── GET /token-status ──────────────────────────────────────────────────────
app.get('/token-status', async (c) => {
  const connectionId = c.req.query('connectionId');
  if (!connectionId) throw new ValidationError('connectionId query param required');
  const user = c.get('user');
  const tok = await getToken(c.env, connectionId, user.id);
  if (!tok) return c.json({ connected: false });
  return c.json({
    connected: true,
    expiresAt: new Date(tok.expires_at).toISOString(),
    expiresInSeconds: Math.max(
      0,
      Math.floor((tok.expires_at - Date.now()) / 1000),
    ),
    scope: tok.scope,
    patient: tok.patient ?? null,
    encounter: tok.encounter ?? null,
    fhirUser: tok.fhirUser ?? null,
  });
});

// ─── GET /smart-config ──────────────────────────────────────────────────────
// Diagnostic — show the cached SMART configuration for a connection.
app.get('/smart-config', async (c) => {
  const connectionId = c.req.query('connectionId');
  if (!connectionId) throw new ValidationError('connectionId query param required');
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  if (!conn.fhirBaseUrl) throw new ValidationError('Connection has no fhirBaseUrl');
  const smart = await getSmartConfig(c.env, conn.fhirBaseUrl);
  return c.json({ ok: true, smart, fhirBaseUrl: conn.fhirBaseUrl });
});

// ─── GET /patient/:patientId ────────────────────────────────────────────────
// Phase-1 transitional endpoint. Will be replaced by typed services in 1.E.
app.get('/patient/:patientId', async (c) => {
  const connectionId = c.req.query('connectionId');
  if (!connectionId) throw new ValidationError('connectionId query param required');
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  if (!conn.fhirBaseUrl) throw new ValidationError('Connection has no fhirBaseUrl');

  const user = c.get('user');
  const smart = await getSmartConfig(c.env, conn.fhirBaseUrl);
  const accessToken = await getValidAccessToken(
    c.env,
    conn,
    user.id,
    smart.token_endpoint,
  );
  if (!accessToken) {
    return c.json(
      {
        error: 'Not connected to Epic for this connection',
        code: 'EPIC_NOT_CONNECTED',
        hint: 'Call GET /api/fhir/authorize-url?connectionId=... and complete the flow.',
      },
      401,
    );
  }

  const { patientId } = c.req.param();
  const url = `${conn.fhirBaseUrl.replace(/\/$/, '')}/Patient/${encodeURIComponent(patientId)}`;
  const res = await safeFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/fhir+json',
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    return c.json(
      { error: 'Epic Patient fetch failed', status: res.status, detail: detail.slice(0, 500) },
      502,
    );
  }
  const p = (await res.json()) as {
    name?: Array<{ given?: string[]; family?: string }>;
    birthDate?: string;
    gender?: string;
    address?: unknown[];
    telecom?: unknown[];
    identifier?: unknown[];
  };
  const nameEntry = p.name?.[0] ?? {};
  return c.json({
    patientId,
    name: `${(nameEntry.given ?? []).join(' ')} ${nameEntry.family ?? ''}`.trim(),
    given: nameEntry.given ?? [],
    family: nameEntry.family ?? null,
    birthDate: p.birthDate ?? null,
    gender: p.gender ?? null,
    address: p.address?.[0] ?? null,
    telecom: p.telecom ?? [],
    identifier: p.identifier ?? [],
  });
});

// ─── Typed FHIR resource reads (Phase 1.E) ───────────────────────────────────
// Path shape: /api/fhir/:connectionId/<resource>...
// Authenticated; uses the calling user's stored token for the connection.

/**
 * Build a FhirCallContext for a connection-scoped read.
 *
 * Token lookup precedence (handles both Standalone and EHR Launch):
 *   1. `?fhirUser=...` query param (or `?owner=fhir:Practitioner/...`) — used by
 *      the SPA's launch-bounce flow when EHR Launch stored the token under the
 *      `fhir:<fhirUser>` owner key.
 *   2. Otherwise the calling Curavend user's id — Standalone Launch path.
 */
async function ctxFor(
  c: {
    env: Env;
    get: (k: 'user') => AuthUser;
    req: { param: (k: string) => string | undefined; query: (k: string) => string | undefined };
  },
  connectionId: string,
): Promise<FhirCallContext> {
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  const user = c.get('user');
  const explicitOwner = c.req.query('owner');
  const fhirUser = c.req.query('fhirUser');
  let userId = user.id;
  if (explicitOwner) {
    userId = explicitOwner;
  } else if (fhirUser) {
    userId = `fhir:${fhirUser}`;
  }
  return { env: c.env, conn, userId };
}

// GET /:connectionId/patient/:patientId — Patient demographics
app.get('/:connectionId/patient/:patientId', async (c) => {
  const { connectionId, patientId } = c.req.param();
  const ctx = await ctxFor(c, connectionId);
  return c.json(await readPatient(ctx, patientId));
});

// GET /:connectionId/patient?mrn=&system=  — search by MRN
app.get('/:connectionId/patient', async (c) => {
  const { connectionId } = c.req.param();
  const mrn = c.req.query('mrn');
  const system = c.req.query('system'); // optional — defaults to mappingProfile.mrnSystem
  if (!mrn) throw new ValidationError('mrn query param required');
  const ctx = await ctxFor(c, connectionId);
  const p = await searchPatientByMrn(ctx, mrn, system ?? undefined);
  return c.json({ patient: p });
});

// GET /:connectionId/encounter/:encounterId
app.get('/:connectionId/encounter/:encounterId', async (c) => {
  const { connectionId, encounterId } = c.req.param();
  const ctx = await ctxFor(c, connectionId);
  return c.json(await readEncounter(ctx, encounterId));
});

// GET /:connectionId/encounter?patient=:patientId  — active encounters
app.get('/:connectionId/encounter', async (c) => {
  const { connectionId } = c.req.param();
  const patientId = c.req.query('patient');
  if (!patientId) throw new ValidationError('patient query param required');
  const ctx = await ctxFor(c, connectionId);
  return c.json({ items: await activeEncountersForPatient(ctx, patientId) });
});

// GET /:connectionId/coverage?patient=:patientId
app.get('/:connectionId/coverage', async (c) => {
  const { connectionId } = c.req.param();
  const patientId = c.req.query('patient');
  if (!patientId) throw new ValidationError('patient query param required');
  const ctx = await ctxFor(c, connectionId);
  return c.json({ items: await coveragesForPatient(ctx, patientId) });
});

// GET /:connectionId/condition?patient=:patientId  — active conditions only
app.get('/:connectionId/condition', async (c) => {
  const { connectionId } = c.req.param();
  const patientId = c.req.query('patient');
  if (!patientId) throw new ValidationError('patient query param required');
  const ctx = await ctxFor(c, connectionId);
  return c.json({ items: await activeConditionsForPatient(ctx, patientId) });
});

// GET /:connectionId/practitioner/:practitionerId
app.get('/:connectionId/practitioner/:practitionerId', async (c) => {
  const { connectionId, practitionerId } = c.req.param();
  const ctx = await ctxFor(c, connectionId);
  return c.json(await readPractitioner(ctx, practitionerId));
});

/**
 * GET /:connectionId/deep-link?patientId=&encounterId=
 *
 * Phase 1.G — server-side renders the customer's `mappingProfile.deepLinkTemplate`
 * with `{patientId}` and `{encounterId}` placeholders. Returns null if not
 * configured (the SPA hides the "View in Epic" button in that case).
 *
 * Template lives in the connection's mappingProfile so each customer can
 * customize (e.g. Hyperspace launch URL vs. EpicWeb URL).
 */
app.get('/:connectionId/deep-link', async (c) => {
  const { connectionId } = c.req.param();
  const patientId = c.req.query('patientId');
  const encounterId = c.req.query('encounterId');
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  if (!conn.mappingProfile) return c.json({ url: null });
  try {
    const mp = JSON.parse(conn.mappingProfile);
    const template: string | undefined = mp.deepLinkTemplate;
    if (!template) return c.json({ url: null });
    let url = template;
    if (patientId) url = url.replace(/\{patientId\}/g, encodeURIComponent(patientId));
    if (encounterId) url = url.replace(/\{encounterId\}/g, encodeURIComponent(encounterId));
    // Reject if there are unfilled placeholders — likely a config error.
    if (/\{[^}]+\}/.test(url)) {
      return c.json({ url: null, error: 'Template has unfilled placeholders' });
    }
    return c.json({ url });
  } catch {
    return c.json({ url: null });
  }
});

/**
 * GET /:connectionId/launch-context-prefill
 *
 * Aggregate endpoint the SPA's launch bounce calls once on arrival. Pulls
 * Patient + active Encounter + active Coverage + active Conditions in parallel
 * so the wizard can hydrate with one round trip. Phase 1.F consumer.
 */
app.get('/:connectionId/launch-context-prefill', async (c) => {
  const { connectionId } = c.req.param();
  const patientId = c.req.query('patientId');
  const encounterId = c.req.query('encounterId');
  if (!patientId) throw new ValidationError('patientId query param required');
  const ctx = await ctxFor(c, connectionId);

  const [patient, encounters, coverages, conditions, encounter] = await Promise.all([
    readPatient(ctx, patientId).catch(() => null),
    activeEncountersForPatient(ctx, patientId).catch(() => []),
    coveragesForPatient(ctx, patientId).catch(() => []),
    activeConditionsForPatient(ctx, patientId).catch(() => []),
    encounterId ? readEncounter(ctx, encounterId).catch(() => null) : Promise.resolve(null),
  ]);

  return c.json({
    patient,
    encounter,        // populated only if encounterId was provided (EHR Launch)
    encounters,       // alternative — let SPA pick if no encounter from launch
    coverages,
    conditions,
  });
});

/**
 * POST /:connectionId/mint-keypair
 *
 * Phase 2.L — eagerly mint the Backend Services keypair for this connection,
 * so its public JWK appears at /.well-known/jwks.json before the customer
 * registers the URL with Epic. Idempotent.
 */
app.post('/:connectionId/mint-keypair', async (c) => {
  const { connectionId } = c.req.param();
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  const { kid, publicJwk } = await getOrMintConnectionKeypair(c.env, conn.id);
  return c.json({ kid, publicJwk });
});

/**
 * POST /:connectionId/push-document
 *
 * Phase 2.J — push a PDF as a FHIR DocumentReference. Body is multipart-like
 * JSON with PDF bytes base64-encoded so curl can hit this without binary
 * upload tooling.
 *
 *   { patientId, encounterId?, loincCode, loincDisplay?, title,
 *     pdfBytesBase64, idempotencyKey, authorPractitionerId?, description? }
 */
app.post('/:connectionId/push-document', async (c) => {
  const { connectionId } = c.req.param();
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  const body = (await c.req.json()) as {
    patientId?: string;
    encounterId?: string;
    loincCode?: string;
    loincDisplay?: string;
    title?: string;
    pdfBytesBase64?: string;
    idempotencyKey?: string;
    authorPractitionerId?: string;
    description?: string;
  };
  if (!body.patientId) throw new ValidationError('patientId required');
  if (!body.loincCode) throw new ValidationError('loincCode required');
  if (!body.title) throw new ValidationError('title required');
  if (!body.pdfBytesBase64) throw new ValidationError('pdfBytesBase64 required');
  if (!body.idempotencyKey) throw new ValidationError('idempotencyKey required');

  // Decode base64 → Uint8Array.
  const bin = atob(body.pdfBytesBase64);
  const pdfBytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pdfBytes[i] = bin.charCodeAt(i);

  const result = await createDocumentReference(c.env, conn, {
    patientId: body.patientId,
    encounterId: body.encounterId,
    loincCode: body.loincCode,
    loincDisplay: body.loincDisplay,
    title: body.title,
    pdfBytes,
    idempotencyKey: body.idempotencyKey,
    authorPractitionerId: body.authorPractitionerId,
    description: body.description,
  });
  return c.json(result);
});

/**
 * POST /:connectionId/push-procedure
 *
 * Phase 2.K — push an HCPC as a FHIR Procedure for charge capture.
 *
 *   { patientId, encounterId, hcpcCode, hcpcDisplay?, performedDateTime,
 *     quantity?, performerPractitionerId?, idempotencyKey }
 */
app.post('/:connectionId/push-procedure', async (c) => {
  const { connectionId } = c.req.param();
  const conn = await loadConnection(c.env, connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  const body = (await c.req.json()) as {
    patientId?: string;
    encounterId?: string;
    hcpcCode?: string;
    hcpcDisplay?: string;
    performedDateTime?: string;
    quantity?: number;
    performerPractitionerId?: string;
    idempotencyKey?: string;
  };
  if (!body.patientId) throw new ValidationError('patientId required');
  if (!body.encounterId) throw new ValidationError('encounterId required');
  if (!body.hcpcCode) throw new ValidationError('hcpcCode required');
  if (!body.performedDateTime) throw new ValidationError('performedDateTime required (ISO 8601)');
  if (!body.idempotencyKey) throw new ValidationError('idempotencyKey required');

  const result = await createProcedure(c.env, conn, {
    patientId: body.patientId,
    encounterId: body.encounterId,
    hcpcCode: body.hcpcCode,
    hcpcDisplay: body.hcpcDisplay,
    performedDateTime: body.performedDateTime,
    quantity: body.quantity,
    performerPractitionerId: body.performerPractitionerId,
    idempotencyKey: body.idempotencyKey,
  });
  return c.json(result);
});

/**
 * GET /cds-hooks-prefill
 *
 * Phase 2.M last-mile — called by the SPA when the clinician arrives at
 * /create-dme-order via the CDS Hooks order-sign deep-link.  Unlike the
 * EHR Launch path the user has no FHIR session token yet, so we:
 *   1. Resolve the hospital's first active EPIC connection (auto-select).
 *   2. Use Backend Services (system-mode) to call the prefill resources —
 *      no per-user OAuth token is required.
 *   3. Return the same LaunchContextPrefill shape so the wizard can reuse
 *      all existing field-mapping logic without changes.
 *
 * Query params: patientId (required), encounterId? (FHIR ids from the Epic
 * context that was included in the CDS Hooks response card link).
 */
app.get('/cds-hooks-prefill', async (c) => {
  const user = c.get('user');
  const patientId = c.req.query('patientId');
  if (!patientId) throw new ValidationError('patientId query param required');
  const encounterId = c.req.query('encounterId');

  // Auto-select the first active Epic connection for the hospital.
  const hospitalId = user.hospitalId;
  if (!hospitalId) {
    return c.json({ patient: null, encounter: null, encounters: [], coverages: [], conditions: [] });
  }
  const conn = await loadEpicConnectionForHospital(c.env, hospitalId);
  if (!conn) {
    // No Epic connection — return empty shell so the wizard still opens.
    return c.json({ patient: null, encounter: null, encounters: [], coverages: [], conditions: [] });
  }

  // Use system-mode (Backend Services) so we don't need the user to have
  // an active OAuth session. The fhirClient will call getBackendAccessToken.
  const ctx: FhirCallContext = {
    env: c.env,
    conn,
    userId: '__system__',
    mode: 'system',
    systemScope: [
      'system/Patient.read',
      'system/Encounter.read',
      'system/Coverage.read',
      'system/Condition.read',
    ].join(' '),
  };

  const [patient, encounters, coverages, conditions, encounter] = await Promise.all([
    readPatient(ctx, patientId).catch(() => null),
    activeEncountersForPatient(ctx, patientId).catch(() => []),
    coveragesForPatient(ctx, patientId).catch(() => []),
    activeConditionsForPatient(ctx, patientId).catch(() => []),
    encounterId ? readEncounter(ctx, encounterId).catch(() => null) : Promise.resolve(null),
  ]);

  return c.json({ patient, encounter, encounters, coverages, conditions });
});

// ─── POST /sync ──────────────────────────────────────────────────────────────
// DEPRECATED. CDS Hooks (Phase 2.M) is the real-time intake path; EHR Launch
// (1.C, 1.F) is the per-patient pull path.
app.post('/sync', (c) => {
  console.warn(
    '[fhir] /sync called — deprecated. See docs/EPIC_PHASE_1_2_PLAN.md webhook-free pull cadence.',
  );
  return c.json(
    {
      error: 'deprecated',
      detail:
        'POST /api/fhir/sync was replaced by CDS Hooks order-sign (real-time intake) and EHR Launch (per-patient pull).',
      code: 'FHIR_SYNC_DEPRECATED',
    },
    410,
  );
});

// ─── DELETE /disconnect ─────────────────────────────────────────────────────
app.delete('/disconnect', async (c) => {
  const connectionId = c.req.query('connectionId');
  if (!connectionId) throw new ValidationError('connectionId query param required');
  const user = c.get('user');
  await deleteToken(c.env, connectionId, user.id);
  return c.json({ success: true });
});

export default app;

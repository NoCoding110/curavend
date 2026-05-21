/**
 * Epic / FHIR integration.
 *
 * Set EPIC_CLIENT_ID, EPIC_CLIENT_SECRET, and EPIC_FHIR_BASE_URL as Worker
 * secrets (wrangler secret put) to activate. Endpoints return 503 when unconfigured.
 *
 * OAuth2 flow:
 *  1. Frontend links user to Epic's authorization URL.
 *  2. Epic redirects back to GET /api/fhir/redirect?code=...
 *  3. We exchange code for tokens and store in KV keyed by user.
 *  4. POST /api/fhir/sync polls Epic ServiceRequest resources and creates Curavend orders.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function notConfigured(): Response {
  return new Response(
    JSON.stringify({
      error: 'Epic FHIR integration is not configured.',
      required: ['EPIC_CLIENT_ID', 'EPIC_CLIENT_SECRET', 'EPIC_FHIR_BASE_URL'],
      hint: 'Set these as Worker secrets via `wrangler secret put <NAME>` to enable.',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

function isConfigured(env: Env): boolean {
  return !!(env.EPIC_CLIENT_ID && env.EPIC_CLIENT_SECRET && env.EPIC_FHIR_BASE_URL);
}

// ─── GET /api/fhir/authorize-url ─────────────────────────────────────────────
// Returns the Epic authorization URL for the frontend to redirect to.
app.get('/authorize-url', (c) => {
  if (!isConfigured(c.env)) return notConfigured();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.env.EPIC_CLIENT_ID!,
    redirect_uri: `${c.env.FRONTEND_URL?.replace('pages.dev', 'workers.dev') ?? ''}/api/fhir/redirect`,
    scope: 'launch/patient openid fhirUser patient/ServiceRequest.read patient/Patient.read',
    state: c.get('user')?.id ?? 'anonymous',
    aud: `${c.env.EPIC_FHIR_BASE_URL}/api/FHIR/R4`,
  });

  return c.json({ url: `${c.env.EPIC_FHIR_BASE_URL}/oauth2/authorize?${params}` });
});

// ─── GET /api/fhir/redirect ─────────────────────────────────────────────────
// Epic OAuth redirect handler. Exchanges code for tokens and stores in KV.
app.get('/redirect', async (c) => {
  if (!isConfigured(c.env)) return notConfigured();

  const code = c.req.query('code');
  const state = c.req.query('state'); // user ID passed through state param
  if (!code) {
    return c.json({ error: 'Missing authorization code from Epic' }, 400);
  }

  try {
    const tokenRes = await fetch(`${c.env.EPIC_FHIR_BASE_URL}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${c.env.FRONTEND_URL?.replace('pages.dev', 'workers.dev') ?? ''}/api/fhir/redirect`,
        client_id: c.env.EPIC_CLIENT_ID!,
        client_secret: c.env.EPIC_CLIENT_SECRET!,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[epic] token exchange failed:', errBody);
      return c.json({ error: 'Epic token exchange failed', detail: errBody }, 502);
    }

    const token = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      patient?: string;
    };

    // Store tokens in KV keyed by user ID (from state param)
    const userId = state ?? c.get('user')?.id;
    if (userId) {
      await c.env.KV.put(
        `epic:token:${userId}`,
        JSON.stringify({ ...token, stored_at: Date.now() }),
        { expirationTtl: token.expires_in + 60 },
      );
    }

    return c.json({ message: 'Epic authorization successful', patientId: token.patient });
  } catch (err) {
    console.error('[epic] redirect handler error:', err);
    return c.json({ error: 'Internal error during Epic OAuth' }, 500);
  }
});

// ─── GET /api/fhir/token-status ───────────────────────────────────────────
// Returns whether the current user has a stored Epic token.
app.get('/token-status', async (c) => {
  if (!isConfigured(c.env)) return notConfigured();
  const user = c.get('user');
  const stored = await c.env.KV.get(`epic:token:${user.id}`);
  return c.json({ connected: !!stored });
});

// ─── POST /api/fhir/sync ─────────────────────────────────────────────────────
// Polls Epic for new ServiceRequest resources and maps them to Curavend orders.
app.post('/sync', async (c) => {
  if (!isConfigured(c.env)) return notConfigured();

  const user = c.get('user');
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  // Retrieve stored token
  const storedRaw = await c.env.KV.get(`epic:token:${user.id}`);
  if (!storedRaw) {
    return c.json({ error: 'Not connected to Epic — complete OAuth flow first via /api/fhir/authorize-url' }, 401);
  }

  let token: { access_token: string; patient?: string };
  try {
    token = JSON.parse(storedRaw);
  } catch {
    return c.json({ error: 'Stored Epic token is malformed' }, 500);
  }

  try {
    // Fetch ServiceRequest resources for the linked patient
    const fhirUrl = `${c.env.EPIC_FHIR_BASE_URL}/api/FHIR/R4/ServiceRequest?status=active&_count=50`;
    const fhirRes = await fetch(fhirUrl, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: 'application/fhir+json',
      },
    });

    if (!fhirRes.ok) {
      const detail = await fhirRes.text();
      console.error('[epic] FHIR ServiceRequest fetch failed:', fhirRes.status, detail);
      return c.json({ error: 'FHIR ServiceRequest fetch failed', status: fhirRes.status }, 502);
    }

    const bundle = await fhirRes.json() as { entry?: { resource: any }[] };
    const entries = bundle.entry ?? [];
    let imported = 0;

    for (const entry of entries) {
      const req = entry.resource;
      if (req.resourceType !== 'ServiceRequest') continue;

      const fhirId = req.id as string;
      const epicIdentifier = 'FHIR-' + fhirId.slice(0, 8).toUpperCase();

      // Deduplicate by identifier prefix (FHIR orders get a recognizable FHIR- prefix)
      const existing: any = await db.run(sql`SELECT id FROM orders WHERE identifier = ${epicIdentifier} LIMIT 1`);
      if (existing.results?.[0]) continue;

      // Extract patient name from subject reference
      const patientDisplay = req.subject?.display ?? 'Unknown';

      // Extract HCPC codes from orderDetail.coding
      const codes: string[] = [];
      for (const detail of req.orderDetail ?? []) {
        for (const coding of detail.coding ?? []) {
          if (coding.code) codes.push(coding.code);
        }
      }

      // Map to a Curavend order (PENDING_VENDOR); store FHIR ref in notes
      const orderId = crypto.randomUUID();
      const fhirNotes = `FHIR ServiceRequest: ${fhirId}${codes.length ? ' | HCPC: ' + codes.join(', ') : ''}`;
      await db.run(sql`
        INSERT INTO orders (id, identifier, hospital_id, vendor_id, patient_name, status, order_sub_status, notes, created_at, updated_at)
        VALUES (${orderId}, ${epicIdentifier}, ${user.hospitalId ?? ''}, '', ${patientDisplay}, 'PENDING_VENDOR', 'ORDER_PENDING', ${fhirNotes}, ${now}, ${now})
      `);
      imported++;
    }

    return c.json({ imported, total: entries.length });
  } catch (err) {
    console.error('[epic] sync error:', err);
    return c.json({ error: 'FHIR sync failed', detail: String(err) }, 500);
  }
});

// ─── GET /api/fhir/patient/:patientId ───────────────────────────────────────
// Fetch patient demographics from Epic (used in encounter assessment pre-fill).
app.get('/patient/:patientId', async (c) => {
  if (!isConfigured(c.env)) return notConfigured();

  const user = c.get('user');
  const { patientId } = c.req.param();

  const storedRaw = await c.env.KV.get(`epic:token:${user.id}`);
  if (!storedRaw) return c.json({ error: 'Not connected to Epic' }, 401);

  const token: { access_token: string } = JSON.parse(storedRaw);

  const res = await fetch(`${c.env.EPIC_FHIR_BASE_URL}/api/FHIR/R4/Patient/${patientId}`, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/fhir+json' },
  });

  if (!res.ok) return c.json({ error: 'Epic Patient fetch failed', status: res.status }, 502);

  const patient = await res.json() as any;
  const nameEntry = patient.name?.[0] ?? {};
  const given = (nameEntry.given ?? []).join(' ');
  const family = nameEntry.family ?? '';

  return c.json({
    patientId,
    name: `${given} ${family}`.trim(),
    birthDate: patient.birthDate,
    gender: patient.gender,
    address: patient.address?.[0] ?? null,
    telecom: patient.telecom ?? [],
  });
});

// ─── DELETE /api/fhir/disconnect ────────────────────────────────────────────
app.delete('/disconnect', async (c) => {
  const user = c.get('user');
  await c.env.KV.delete(`epic:token:${user.id}`);
  return c.json({ success: true });
});

export default app;

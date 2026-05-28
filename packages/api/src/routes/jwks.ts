/**
 * /.well-known/jwks.json — public JWKS for SMART Backend Services.
 *
 * Customers register this URL once in their Epic app config; Epic then
 * validates our `client_assertion` JWTs against this list of public keys.
 *
 * Lazy: only connections that have minted a backend-services keypair appear.
 * (Calling getOrMintConnectionKeypair the first time inserts the public JWK
 * into KV; subsequent calls just read it.)
 *
 * Phase 2.L. Public route (auth bypassed via PUBLIC_PATTERNS in middleware/auth.ts).
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { ehrConnections } from '@curavend/db';
import { listPublicJwks } from '../services/fhir/backendServicesAuth';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env }>();

app.get('/.well-known/jwks.json', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ id: ehrConnections.id })
    .from(ehrConnections)
    .where(eq(ehrConnections.isActive, 1));
  const keys = await listPublicJwks(
    c.env,
    rows.map((r) => r.id),
  );
  // Long cache — keys rotate rarely, and we want Epic to keep the keys hot.
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ keys });
});

export default app;

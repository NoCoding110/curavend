# Curavend Epic FHIR Integration — Phase 1 + Phase 2 Implementation Plan

**Duration**: 10–14 weeks total (Phase 1: 4–6 weeks; Phase 2: 6–8 weeks)
**Authoritative reference**: `D:\Proxy IQ\curavend\docs\EPIC_FHIR_REFERENCE.md`

---

## Pre-flight: confirmed existing assets

All ten enumerated files were verified to exist at their stated paths:

| # | File | Notes |
|---|---|---|
| 1 | `packages/api/src/routes/fhir.ts` | Single-tenant, env-driven. 237 LOC. Refactor target for 1.A. |
| 2 | `packages/api/src/routes/ehr.ts` | Multi-tenant push adapter, 342 LOC, RBAC-gated, HMAC-verified ingest. |
| 3 | `packages/db/src/schema/ehrConnections.ts` | `ehrConnections` + `ehrIngestLog` tables. 110 LOC. |
| 4 | `packages/web/src/features/admin/pages/EhrConnections.tsx` | Admin UI. 426 LOC. |
| 5 | `packages/api/src/index.ts` | Confirmed: `app.route('/api/fhir', fhirRoutes)` at line 206; `app.route('/api/ehr', ehrRoutes)` at line 218; CDS Hooks at line 162 (`app.route('/', cdsHooksRoutes)`). |
| 6 | `packages/db/src/schema/orders.ts` | `orders` table has `patientName`, `patientBirthDate`, `patientGender`, `patientAddress`, `physicianId`, `facilityId`, `departmentId`, `epicOrderStatus`. |
| 7 | `packages/web/src/features/supplyOrderDetail/pages/CreateSupplyOrder.tsx` | 1,587 LOC wizard with session-storage draft, formulary lookup, routing preview. |
| 8 | `packages/web/src/features/supplyOrderDetail/pages/CreateDmeOrder.tsx` | 635 LOC wizard, 6 steps (patient / dx / docs / eligibility / PA / supplier). |
| 9 | `packages/db/src/schema/dmeDocuments.ts` + `packages/api/src/routes/dmeBundle.ts` | DWO + claim-bundle PDF generation. `dmeBundle.ts` is a route, not a separate service file. Hook point for 2.J is `GET /api/dme-bundle/:orderId/dwo.pdf` and `GET /:orderId/claim-bundle.pdf`. |
| 10 | `packages/api/src/routes/cdsHooks.ts` | Confirmed: 159 LOC, public, `order-select` only today. Returns info cards from `inventory_items` + `medicare_fee_schedule_items`. |

Additional context discovered:
- `packages/api/src/services/ehrAdapter.ts` (225 LOC) provides `applyMappingProfile`, `DEFAULT_MAPPINGS` per vendor, and `verifyWebhookSignature` HMAC-SHA256 helpers — reuse heavily.
- `packages/api/src/services/serviceAuthCache.ts` is a perfect template for per-tenant Backend Services JWT caching.
- `jose` is already imported at four call sites in the API; supports RS384 sign/verify natively in Workers.
- Migration cursor: latest is `0022_procurement_v3.sql`. Next available: `0023_*.sql`.
- Cron schedules in `packages/api/wrangler.toml`: `["*/15 * * * *", "0 8 * * *", "0 6 1 * *"]`.
- Auth middleware exempt patterns are in `packages/api/src/middleware/auth.ts` — `PUBLIC_PATHS`, `PUBLIC_PREFIXES`, and `PUBLIC_PATTERNS` (regex). The EHR ingest path is already exempted via regex; the new public Epic launch/redirect/JWKS routes must be added the same way.
- `packages/web/src/routes/AllRoutes.tsx` mounts `/create-order` and `/create-dme-order` — these are the URLs Epic launch will deep-link into.

---

## Phase 1 — Read + Launch (4–6 weeks)

Goal: any Curavend customer with an Epic Showroom-approved connection can launch from within Epic (or standalone), the wizard pre-fills from FHIR context, and we can read Patient/Encounter/Coverage/Condition/Practitioner without writing anything back.

### 1.A — Refactor `routes/fhir.ts` to multi-tenant

Replace env-var single-tenant flow with per-`ehrConnections.id` flow. Every request now carries (or resolves) a `connectionId` and tokens are stored at `epic:token:{connectionId}:{userId}`.

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/routes/fhir.ts` | Rewrite all six endpoints to accept `connectionId` (query or path), look up connection row, build redirect/token URLs from the row's `fhirBaseUrl`. Drop reliance on `EPIC_CLIENT_ID/SECRET/BASE_URL`. |
| `packages/api/src/lib/env.ts` | Mark `EPIC_*` env vars deprecated (keep for one release for fallback). Document new `EHR_CONN_<id>_CLIENT_SECRET` convention. |
| `packages/api/src/middleware/auth.ts` | Add new `PUBLIC_PATTERNS` regex for `/api/fhir/launch` and `/api/fhir/redirect` (Epic POSTs the redirect *unauthenticated* — the user has no Curavend session yet). |
| `packages/api/src/services/ehrAdapter.ts` | Add `loadConnection(env, db, connectionId)` helper + `resolveConnectionSecret(env, conn, slot)` that reads the right env var by name. |

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/services/fhir/oauthFlow.ts` | 220 | PKCE codeChallenge generation, state token (HMAC-signed with `JWT_SECRET`, carrying `{connectionId, userId, nonce, exp}`), token-exchange, refresh-token rotation, KV write at `epic:token:{connId}:{userId}`. |
| `packages/api/src/services/fhir/tokenStore.ts` | 90 | `getValidAccessToken(env, connectionId, userId)` — returns cached token, auto-refreshes within 5-min buffer, returns 401 marker if no refresh token. Mirrors `serviceAuthCache.ts` pattern. |

**Reuses**: `ehrConnections` row schema, `ehrAdapter.ts` helpers, existing `getDb(env.DB)` accessor, `jose.SignJWT` already imported elsewhere.

**Epic FHIR endpoints + scopes** (Standalone Launch, Clinician confidential client):
- Discovery: `GET {fhirBaseUrl}/.well-known/smart-configuration`
- Authorize: `{authorization_endpoint}?response_type=code&client_id=...&redirect_uri=https://curavend-api.metabilityllc1.workers.dev/api/fhir/redirect&aud={fhirBaseUrl}&scope=launch openid fhirUser offline_access user/Patient.read user/Encounter.read user/Practitioner.read user/PractitionerRole.read user/Location.read user/Organization.read user/Coverage.read user/Condition.read user/AllergyIntolerance.read user/MedicationRequest.read&state=...&code_challenge=...&code_challenge_method=S256`
- Token: `POST {token_endpoint}` with `grant_type=authorization_code` + `code_verifier`.

**Risk/blocker**: KV writes are *eventually* consistent. Two near-simultaneous refresh attempts on the same `(connId, userId)` can both succeed and clobber each other. Mitigation: use the existing `serviceAuthCache.ts` REFRESH_BUFFER_MS = 60 s pattern — refresh only when expiry is closer than 60 s, and accept the rare double-refresh as harmless (Epic invalidates the prior refresh-token, which we re-fetch on the next call). Document the race.

**Verification step**: in sandbox, run a full standalone-launch round trip against `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/` with test patient Camila Lopez. Confirm token row appears in KV under `epic:token:{newSandboxConnId}:{realUserId}` and `GET /api/fhir/patient/erXuFYUfucBZaryVksYEcMg3` returns demographics.

### 1.B — SMART discovery service

Centralized fetch + 24 h cache of `{iss}/.well-known/smart-configuration`. Required by every auth flow (EHR Launch, Standalone, even Backend Services for the `token_endpoint`).

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/services/fhir/smartDiscovery.ts` | 130 | `getSmartConfig(env, fhirBaseUrl)` — KV-cached at `smart-config:{sha256(fhirBaseUrl)}` with `expirationTtl: 86400`. Returns typed `{ authorization_endpoint, token_endpoint, introspection_endpoint?, jwks_uri?, capabilities, scopes_supported, response_types_supported, grant_types_supported, code_challenge_methods_supported }`. Falls back to bare-minimum derived endpoints (`{base}/oauth2/authorize` + `{base}/oauth2/token`) if discovery 404s (legacy Epic versions). |

**Reuses**: `env.KV`, `crypto.subtle.digest` (already used in `ehrAdapter.verifyWebhookSignature`).

**Epic FHIR endpoints**: `GET {fhirBaseUrl}/.well-known/smart-configuration` (per `EPIC_FHIR_REFERENCE.md` §2 line 35).

**Risk/blocker**: Worker CPU. Discovery is fast (~5 ms) but happens on cold start. The KV cache key uses the *full* `fhirBaseUrl` so a tenant typo (trailing slash, mixed case) bypasses the cache forever. Normalize via `new URL(fhirBaseUrl).toString()` before hashing.

**Verification**: `curl https://curavend-api.metabilityllc1.workers.dev/api/fhir/debug-discovery?fhirBaseUrl=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4` (admin-only) returns the parsed JSON.

### 1.C — EHR Launch endpoint

Epic clinician clicks "Launch Curavend" in chart → Epic redirects browser to our launch URL with `iss=` and `launch=` params. We resolve `iss → connectionId`, kick off PKCE auth, and Epic's auth screen brokers the token. After token exchange, redirect into the React app with patient/encounter context embedded in URL hash.

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/routes/fhir.ts` | Add `GET /api/fhir/launch?iss=&launch=` handler. Look up connection by `fhirBaseUrl === iss` (or by `mappingProfile.aliases[]` for tenants with multi-host setups). 404 if not found. Build PKCE redirect to Epic. |
| `packages/api/src/middleware/auth.ts` | Exempt `/api/fhir/launch` and `/api/fhir/redirect` via `PUBLIC_PATTERNS`. |
| `packages/web/src/routes/AllRoutes.tsx` | Add `/fhir-launch-bounce` route that consumes URL-hash context and redirects to `/create-dme-order?fhirContext=…` or `/create-order?fhirContext=…`. |

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/web/src/features/landing/pages/FhirLaunchBounce.tsx` | 80 | Reads `window.location.hash`, base64url-decodes the context blob (signed by API with `JWT_SECRET`), dispatches to Redux auth store, navigates to the appropriate wizard. |

**Reuses**: `applyMappingProfile`, Drizzle `eq` predicates, `corsMiddleware` (already accepts `FRONTEND_URL`).

**Epic FHIR endpoints + scopes**: same as 1.A but adds `launch` parameter, requires `launch` scope at minimum. Add `online_access` if the customer's Epic doesn't allow `offline_access` (varies per tenant per `EPIC_FHIR_REFERENCE.md` §2a line 47).

**Risk/blocker**: Hono middleware ordering. The current `index.ts` mounts auth-protected routes globally with `app.use('/api/*', authMiddleware())` at line 175. The launch endpoints are at `/api/fhir/launch` and `/api/fhir/redirect` — both match the `/api/*` prefix. Solution: rely on the existing `PUBLIC_PATTERNS` regex check in `auth.ts` (already used for `/api/ehr/:id/ingest`). Add regex `/^\/api\/fhir\/(launch|redirect)$/`.

**Verification**: simulate Epic launch with `curl -L "https://curavend-api.metabilityllc1.workers.dev/api/fhir/launch?iss=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4&launch=test-launch-token"` — expect a 302 to Epic's `authorize` endpoint with the right `redirect_uri` and `state`.

### 1.D — Standalone Launch (refactored from existing 1.A work)

The current `/authorize-url` endpoint becomes per-connection. Frontend admin clicks "Connect this Epic connection to my user account" on `EhrConnections.tsx`, hits `GET /api/fhir/authorize-url?connectionId={id}`, browser is redirected, comes back via the redirect handler (1.A), token stored under `(connId, userId)`.

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/routes/fhir.ts` | `/authorize-url` now requires `?connectionId=` query param; falls back to legacy env-var flow when omitted (deprecation grace period). |
| `packages/web/src/features/admin/pages/EhrConnections.tsx` | Add a "Connect to Epic" button on each EPIC-vendor connection row when the caller's token is missing. Calls `/api/fhir/authorize-url?connectionId={id}`, opens result URL in same window. |

**Reuses**: existing token-status endpoint (also made per-connection in 1.A).

**Risk/blocker**: when a user has tokens for two Epic connections at the same hospital (e.g. sandbox + prod), the UI must show *which* one. Add a `tokenStatus: { connected: boolean, expiresAt?: string }` lookup on every connection card render.

**Verification**: connect against sandbox, see green "Connected" badge with TTL countdown.

### 1.E — Typed FHIR resource services

One service file per Epic resource, each exporting typed read functions that take `(env, connectionId, userId, …args)` and return typed objects (not raw FHIR JSON). This is what every other backend service consumes — the rest of Curavend should *never* touch raw FHIR.

**Files to CREATE** (all under `packages/api/src/services/fhir/`)

| Path | ~LOC | Purpose |
|---|---|---|
| `patient.ts` | 110 | `readPatient(env, conn, userId, patientId)` + `searchPatientByMrn(env, conn, userId, { mrn, system })`. Maps FHIR Patient → `{ id, mrn, given, family, dob, gender, phone, email, address: {line, city, state, postalCode} }`. |
| `encounter.ts` | 95 | `readEncounter(…, encId)`, `activeEncountersForPatient(…, patientId)`. Returns `{ id, status, class, periodStart, locationId, departmentId, practitionerId }`. |
| `practitioner.ts` | 75 | `readPractitioner(…, id)` + helper to extract NPI from `identifier[]` (system = `http://hl7.org/fhir/sid/us-npi`). |
| `practitionerRole.ts` | 80 | `rolesForPractitioner(…, practitionerId)` — returns dept (`organization`), specialty, location bindings. |
| `location.ts` | 60 | `readLocation`, `searchLocations` (for facility lookup). |
| `organization.ts` | 60 | `readOrganization` — tenant root + payor orgs. |
| `coverage.ts` | 95 | `coveragesForPatient(…, patientId)` — returns `{ payerId, payerName, memberId, groupId, planName, periodStart, periodEnd, classCodes }`. Used by PA flow. |
| `condition.ts` | 90 | `activeConditionsForPatient(…, patientId)` — filters `clinicalStatus = active`, returns `[{ icd10, snomed?, onsetDate, recordedDate }]`. Feeds the wizard's diagnosis selector. |
| `allergyIntolerance.ts` | 75 | `allergiesForPatient(…)` — informational only Phase 1. |
| `medicationRequest.ts` | 85 | `activeMedsForPatient(…)` — **read-only**, per `EPIC_FHIR_REFERENCE.md` §3 line 88. Surfaces concomitant meds for clinical context (e.g. anticoagulants relevant to DME wound-care). |
| `serviceRequest.ts` | 100 | `readServiceRequest`, `activeServiceRequestsForPatient`. Phase 1 *read* only. Replaces the inline parsing in current `routes/fhir.ts` `/sync`. |
| `deviceRequest.ts` | 90 | `readDeviceRequest`, `activeDeviceRequestsForPatient`. **READ ONLY** per `EPIC_FHIR_REFERENCE.md` line 90 + line 193 flag — "DeviceRequest.Create is not reliably supported via FHIR." Phase 3 will look at HL7v2 ORM. |
| `fhirClient.ts` | 140 | Shared low-level: `fhirGet(env, conn, userId, resourcePath, query?)` — token resolution, retry-on-401 (refresh + retry once), `Accept: application/fhir+json`, structured error mapping into Curavend's `AppError` taxonomy. |

**Reuses**: `tokenStore.ts` from 1.A, existing `AppError`/`NotFoundError` from `lib/errors`.

**Epic FHIR endpoints + scopes** (subset; see `EPIC_FHIR_REFERENCE.md` §3 table):
- `GET {base}/Patient/{id}` — `user/Patient.read`
- `GET {base}/Patient?identifier={system}|{mrn}` — `user/Patient.read`
- `GET {base}/Encounter/{id}` — `user/Encounter.read`
- `GET {base}/Encounter?patient={pid}&status=in-progress` — `user/Encounter.read`
- `GET {base}/Coverage?patient={pid}` — `user/Coverage.read`
- `GET {base}/Condition?patient={pid}&clinical-status=active` — `user/Condition.read`
- `GET {base}/Practitioner/{id}` — `user/Practitioner.read`
- `GET {base}/PractitionerRole?practitioner={id}` — `user/PractitionerRole.read`

**Risk/blocker**: per-tenant MRN OID variance. Per `EPIC_FHIR_REFERENCE.md` §6 line 170, every Epic tenant has a unique MRN system OID like `urn:oid:1.2.840.114350.1.13.X.Y.Z`. Don't hardcode. Read from `ehrConnections.mappingProfile.mrnSystem`. Add to admin UI as a required field for EPIC connections.

**Verification**: against sandbox, `curl -H "Authorization: Bearer …" https://curavend-api.metabilityllc1.workers.dev/api/fhir/{connId}/patient/erXuFYUfucBZaryVksYEcMg3` returns Camila Lopez. Then `curl …/encounter?patient=erXuFYUfucBZaryVksYEcMg3` returns her active encounter.

### 1.F — Pre-fill `CreateSupplyOrder` + `CreateDmeOrder` from Epic context

When the wizard is mounted with `?fhirContext=…` (set by the launch bounce in 1.C) or when the user clicks a "Pull from Epic" button mid-wizard, hydrate fields from the typed services.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/web/src/features/landing/lib/useFhirLaunchContext.ts` | 130 | Hook: reads `fhirContext` query param OR `sessionStorage[curavend_fhir_context]`. Decodes signed JWT. Returns `{ connectionId, patientId, encounterId, practitionerId, isFromEpic: boolean }`. Memoized. |
| `packages/web/src/api/fhirContext.ts` | 110 | Thin axios wrappers: `getPatient(connId, patientId)`, `getEncounter(connId, encId)`, `getActiveConditions(connId, patientId)`, etc. — all call the new `/api/fhir/{connectionId}/…` endpoints. |
| `packages/web/src/features/supplyOrderDetail/components/FromEpicBadge.tsx` | 35 | Small Ant Design `Tag` ("From Epic — locked") used to badge prepopulated fields. Wraps an `Input`/`Select`/`DatePicker` with `disabled` + a tooltip. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/web/src/features/supplyOrderDetail/pages/CreateSupplyOrder.tsx` | At step 1 (Patient Info), if `useFhirLaunchContext().isFromEpic`, call `getPatient` + `getActiveConditions`, prefill `patientForm` fields, wrap them in `FromEpicBadge`. The existing `loadDraft()` sessionStorage path should be skipped (Epic context is the source of truth). |
| `packages/web/src/features/supplyOrderDetail/pages/CreateDmeOrder.tsx` | Same pattern, but additionally pre-pick the diagnosis (ICD-10) from `activeConditionsForPatient` and surface a chooser if multiple. |
| `packages/api/src/routes/fhir.ts` | Add proxy endpoints `GET /api/fhir/:connectionId/patient/:patientId`, `…/encounter/:encId`, `…/condition?patient={pid}` etc. that wrap the typed services from 1.E. |

**Reuses**: existing Ant Design `Form.useForm()` + `patientForm.setFieldsValue()` pattern; existing draft sessionStorage helpers (now branched on Epic vs. local).

**Risk/blocker**: per `EPIC_FHIR_REFERENCE.md` §2a line 42, "Trust these context claims — do not re-query to verify the patient." But to pre-fill, we *must* fetch. So: trust the IDs (don't re-validate identity), but do fetch the demographic resource. If the user is mid-launch and clicks a different patient in Epic, our cached context goes stale — add a `Verify with Epic` button that re-fetches.

**Verification**: in sandbox, do EHR launch from Camila Lopez chart → land on `/create-dme-order` → assert name = "Camila Lopez", DOB pre-filled, gender pre-filled, all locked with "From Epic" badges.

### 1.G — "View in Epic" deep-link on `SupplyOrderDetail`

Once an order is associated with an Epic patient (via `orders.patientId` populated from a FHIR launch), show a button that opens the Epic chart in a new tab. Some Epic tenants expose a deep-link URL pattern; others don't. The pattern goes into `ehrConnections.mappingProfile.deepLinkTemplate` (e.g. `https://epic.cust.org/inside/chart?fhirPatientId={patientId}`).

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/web/src/features/supplyOrderDetail/pages/SupplyOrderDetail.tsx` | Add a small action button in `ActionBar` that, when the order has a `patientId` AND the connection's `mappingProfile.deepLinkTemplate` is set, opens the rendered template in a new tab. Hidden otherwise. |
| `packages/api/src/routes/orders.ts` | When returning an order, include `epicDeepLinkUrl` if applicable. Resolved server-side so the template never leaks unrelated `mappingProfile` keys to the client. |

**Reuses**: existing `ordersApi.get(orderId)` round trip; `mappingProfile` JSON column.

**Risk/blocker**: not all hospitals enable deep linking; some open `https://epic.cust.org/EpicCare/launch.aspx?patientId=…` with required headers. We render only a generic template — set up per tenant during onboarding (Phase 1.I docs).

**Verification**: configure a fake `deepLinkTemplate` against a sandbox connection, see button appear on order detail.

### 1.H — Upgrade `EhrConnections.tsx` admin page

The existing page already supports CRUD. Add Epic-specific affordances driven by `vendor === 'EPIC'`.

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/web/src/features/admin/pages/EhrConnections.tsx` | (1) When `vendor === 'EPIC'` and `authMode === 'OAUTH2_USER_DELEGATED'`, show "Connect to Epic" button (per 1.D). (2) Show a SMART discovery health badge — green when `GET /api/fhir/{id}/smart-config-status` returns 200, yellow if stale (>24h), red on failure. (3) Add a "Scope set" multi-select chooser pre-populated from a curated list (see 1.E scopes). Persist as `mappingProfile.requestedScopes`. (4) Add a "Test patient read" button that calls `GET /api/fhir/{id}/patient/{testPatientId}` (uses Camila Lopez in sandbox) and surfaces result inline. |
| `packages/api/src/routes/fhir.ts` | Add `GET /api/fhir/:connectionId/smart-config-status` (admin-only via `rbac()`) — returns `{ ok, cachedAt, capabilities[], scopes_supported[] }`. |

**Reuses**: existing connection-card UI, existing `rbac` middleware, Ant Design `Select mode="multiple"`.

**Risk/blocker**: a misconfigured scope set fails *only* at Epic's auth screen, not in our backend. Surface Epic's error response (URL-encoded `error_description` query param on redirect) in the UI so admins can debug.

**Verification**: create a sandbox connection, click "Test patient read" → green checkmark with Camila Lopez's name.

### 1.I — Help-center docs (Epic admin runbook)

Two help-center articles ship in Phase 1. The hospital Epic admin reads them and follows the workflow.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/web/src/features/helpCenter/content/epic-showroom-listing.md` | 350 | "How to list Curavend on your Epic Showroom" — for *Curavend* staff prepping a customer activation. Covers Showroom listing form, scope justification matrix, ONC 45 CFR 170.407 metadata, sandbox demo prep with Camila Lopez/Derrick Lin. |
| `packages/web/src/features/helpCenter/content/epic-customer-connection.md` | 420 | "Onboarding your Epic connection" — for *hospital* Epic admins. Walks through Customer Connection Request, redirect URI registration, scope approval, JWKS URL provisioning (for Phase 2 Backend Services), test launch with a designated clinician account. |
| `packages/web/src/features/helpCenter/pages/EpicAdminRunbook.tsx` | 110 | React page that loads + renders both `.md` files via `react-markdown`. Sidebar links by section. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/web/src/features/helpCenter/pages/HelpCenter.tsx` | Add "Epic Integration" category with two articles. |
| `packages/web/src/routes/AllRoutes.tsx` | Add `/help/epic` route → `EpicAdminRunbook`. |
| `packages/web/package.json` | Add `react-markdown` dep if not already present (verify in next-touch). |

**Reuses**: existing HelpCenter UI scaffold.

**Risk/blocker**: docs go stale fast — pin a "Last verified" date footer; add a "Report inaccuracy" link that opens a support ticket.

**Verification**: a hospital admin can complete the Connection Request workflow using only these two articles, with no Curavend support call.

---

## Phase 2 — Write + CDS Hooks (6–8 weeks)

Goal: push DWO PDFs and procedure (charge-capture) Procedures back into Epic via FHIR, mint per-tenant Backend Services JWTs for headless cron, upgrade CDS Hooks to multi-hook with suggestion + app-link cards, and run a nightly Practitioner-directory sync.

### 2.J — DocumentReference write-back

Push the DWO PDF (and on a later trigger, the full claim bundle) into the patient's chart as a `DocumentReference`. This is the **primary** write path per `EPIC_FHIR_REFERENCE.md` §3 line 93.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/services/fhir/documentReference.ts` | 220 | `createDocumentReference(env, connId, { patientId, encounterId?, docType, loincCode, pdfBytes, filename, authorPractitionerId?, description? })`. Posts a FHIR DocumentReference with `content[0].attachment.data` = base64 PDF, `type.coding = [{ system: loinc, code: loincCode }]`, `category[0].coding = [{ system: 'http://terminology.hl7.org/CodeSystem/document-classcodes', code: 'clinical-note' }]`, `status = current`, `docStatus = final`. Returns the created resource ID. |
| `packages/api/src/cron/dmeDocumentPush.ts` | 140 | Queue worker, triggered when an order's `orderSubStatus` transitions to `DELIVERED` (already an event in `queues/orderEvents.ts`). Calls `dmeBundle.ts` to generate the claim-bundle PDF, then `documentReference.ts` to push it. Writes the returned Epic FHIR resource ID to a new `orders.epicDocumentReferenceId` column. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/routes/dmeBundle.ts` | Add `POST /api/dme-bundle/:orderId/push-to-epic` — admin-triggered, optional manual override (default flow is queue-driven). |
| `packages/api/src/queues/orderEvents.ts` | In `handleOrderStatusChanged`, when `orderSubStatus === 'DELIVERED'` and order has `patientId` + a linked Epic `ehrConnections` row, enqueue a `dme.push_dwo_to_epic` event. |
| `packages/api/src/index.ts` | Add the new queue event handler in the `queue` switch. |

**Reuses**: existing `renderHtmlToPdf` (via `services/pdfService.ts`), `mergePdfs`, `dmeDwoTemplate.ts`. All Phase 1 services (`tokenStore`, `fhirClient`).

**Epic FHIR endpoint + scope**:
- `POST {base}/DocumentReference` — `system/DocumentReference.write` (Backend Services) OR `user/DocumentReference.write` (user-context). Per `EPIC_FHIR_REFERENCE.md` line 93, Backend Services is preferred so cron can push without a live clinician session.
- Required body keys: `resourceType`, `status`, `type` (LOINC), `subject` (Patient ref), `content[0].attachment` (`contentType: 'application/pdf'`, `data: base64`, `title`, `creation`).

**Per-customer LOINC whitelist**: stored in `mappingProfile.documentReferenceLoincWhitelist` — Curavend default is `["57133-1" (Referral note), "11506-3" (Progress note), "34117-2" (History and physical note)]`, but each customer's chart-review process may restrict further. The push fails with a clear error if the chosen LOINC isn't whitelisted.

**Risk/blocker**:
1. **Worker payload size**: a 50-page claim bundle could be 8 MB PDF → 11 MB base64. Cloudflare Workers can handle this in memory but each `crypto.subtle` operation on it consumes CPU time. Run the push from the *queue consumer* (which has a generous time budget on paid plan — 30 s bundled CPU) rather than from a request handler.
2. **Idempotency**: if the queue retries, we'd create duplicate DocumentReferences. Use FHIR `If-None-Exist: identifier=https://curavend.io|order-{orderId}-dwo-v{n}` to make the create idempotent.
3. **Customer activation gate**: per `EPIC_FHIR_REFERENCE.md` line 98, every write scope requires per-customer enablement. Phase 2.J ships *capability*, but go-live requires the customer to approve `system/DocumentReference.write`. Document this in 2.O.

**Verification**: in sandbox, mark a test order DELIVERED, observe queue event consumed, verify a new DocumentReference exists by `GET {base}/DocumentReference?patient={pid}&identifier=https://curavend.io|order-{id}-dwo-v1`.

### 2.K — Procedure write-back (charge capture)

When a DME order completes and HCPC codes ship, mint a FHIR Procedure resource on the encounter so the billing team sees the charge in Epic Resolute Professional Billing.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/services/fhir/procedure.ts` | 180 | `createProcedure(env, connId, { patientId, encounterId, hcpcCode, hcpcDescription, performedDate, performerPractitionerId?, locationId? })`. Posts FHIR Procedure with `code.coding[0] = { system: 'https://www.cms.gov/Medicare/Coding/MedHCPCSGenInfo', code: hcpcCode, display: hcpcDescription }`, `status = completed`. Returns resource ID. |
| `packages/api/src/cron/procedurePush.ts` | 95 | Queue worker — fires when `orderSubStatus === 'ORDER_COMPLETED'`. Iterates `orderItems` rows, posts one Procedure per HCPC. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/queues/orderEvents.ts` | In `handleOrderStatusChanged`, on `ORDER_COMPLETED`, enqueue `dme.push_procedure_to_epic` per order line. |
| `packages/db/src/schema/orders.ts` | Add new column `epicProcedureResourceIds` (TEXT, JSON array of `{ orderItemId, fhirId }`). Migration `0023`. |

**Reuses**: same Backend Services token + fhirClient pattern as 2.J.

**Epic FHIR endpoint + scope**:
- `POST {base}/Procedure` — `system/Procedure.write`. Per `EPIC_FHIR_REFERENCE.md` line 92 — "CPT/HCPCS write-back path; customer-gated."

**Risk/blocker**: many customers do *not* want external systems writing Procedures (it short-circuits their charge-review workflow). Make this **opt-in per connection** via `mappingProfile.procedureWriteEnabled: true`. Default false. UI affordance in `EhrConnections.tsx`.

**Verification**: complete a sandbox order with HCPC E0143, `GET {base}/Procedure?patient={pid}&code=https://www.cms.gov/Medicare/Coding/MedHCPCSGenInfo|E0143` returns one resource.

### 2.L — Backend Services JWT (per-tenant)

Required by 2.J, 2.K, 2.N — anything headless. Per `EPIC_FHIR_REFERENCE.md` §2c, we sign an assertion JWT with RS384 and exchange for a bearer.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/services/fhir/backendServicesAuth.ts` | 280 | (a) `getOrMintConnectionKeypair(env, connId)` — checks KV for `epic:keypair:{connId}`. If missing, generates RSA-2048 keypair via `crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-384' }, true, ['sign'])`, exports private as PKCS8 + encrypts with `env.ENCRYPTION_KEY` (existing AES-GCM cipher in `fernetCipher.ts`), persists encrypted private + plaintext public JWK in KV. (b) `mintClientAssertion(env, connId)` — builds JWT `{ iss: clientId, sub: clientId, aud: tokenEndpoint, jti, exp: now+300 }`, signs with the connection's private key via `jose.SignJWT(...).setProtectedHeader({ alg: 'RS384', kid: connId })`. (c) `getBackendAccessToken(env, connId, scope)` — POSTs `grant_type=client_credentials&client_assertion_type=…&client_assertion={jwt}&scope={scope}` to the token endpoint, KV-caches under `epic:bsv-token:{connId}:{scope_hash}` for `expires_in - 60` seconds. |
| `packages/api/src/routes/jwks.ts` | 70 | Public route `GET /.well-known/jwks.json` — iterates all active `ehrConnections` with EPIC vendor, reads each public JWK from KV, returns `{ keys: [{ ...jwk, kid: connId, alg: 'RS384', use: 'sig' }] }`. Customer's Epic admin registers `https://curavend-api.metabilityllc1.workers.dev/.well-known/jwks.json` once on fhir.epic.com per `EPIC_FHIR_REFERENCE.md` line 50. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/index.ts` | Mount `app.route('/', jwksRoutes)` in the public section. |
| `packages/api/src/middleware/auth.ts` | Add `/.well-known/jwks.json` to `PUBLIC_PATHS`. |
| `packages/api/src/services/fhir/fhirClient.ts` | Add a `mode: 'user' | 'system'` parameter on `fhirGet` / `fhirPost`. `'system'` calls `getBackendAccessToken` instead of `getValidAccessToken`. |

**Reuses**: `crypto.subtle` (native to Workers), `jose.SignJWT` with `kid` in protected header, `fernetCipher.ts` for at-rest encryption of private keys, `serviceAuthCache.ts` pattern for the bearer-token caching.

**Epic FHIR endpoints**:
- Discovery (re-used from 1.B).
- Token: `POST {token_endpoint}` with body:
  ```
  grant_type=client_credentials
  client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
  client_assertion={signedRs384Jwt}
  scope=system/Patient.read system/DocumentReference.write system/Procedure.write system/Practitioner.read system/PractitionerRole.read
  ```

**Risk/blocker** (the biggest in the whole plan):
1. **Worker CPU limit on key generation**: RSA-2048 keypair generation can take 100–400 ms of CPU time. Bundled paid plans allow 30 s, so per-connection one-time generation fits. Free plan (50 ms) would not. Document Cloudflare Workers Paid as a hard requirement.
2. **KV encryption at rest**: D1 + KV are not encrypted client-side by default. We layer AES-GCM via `fernetCipher.ts` so a KV exfiltration doesn't leak private keys. The `env.ENCRYPTION_KEY` is itself a Worker secret.
3. **JWKS rotation**: when we want to rotate, we cannot remove the old key for ~60 seconds (Epic caches the JWKS). Add a `keyVersion` to each connection, surface "Rotate JWKS" button in admin UI that publishes the new key, leaves old key live for 24 h, then prunes. Phase 2 ships *initial mint*; rotation UX is Phase 3.
4. **Subtle Crypto in Workers**: `RSASSA-PKCS1-v1_5` with `SHA-384` is required for `RS384`. `jose` v5+ handles this directly; confirm package version in `packages/api/package.json` (next-touch task — anything <5 needs upgrade).

**Verification**:
1. Register `https://curavend-api.metabilityllc1.workers.dev/.well-known/jwks.json` on fhir.epic.com sandbox app.
2. From a Worker REPL or test endpoint: `await getBackendAccessToken(env, sandboxConnId, 'system/Patient.read')` returns a bearer.
3. `fhirGet(env, sandboxConnId, null, 'Patient/erXuFYUfucBZaryVksYEcMg3', {}, { mode: 'system' })` returns Camila Lopez.

### 2.M — CDS Hooks server (multi-hook upgrade)

Existing `routes/cdsHooks.ts` already serves `order-select` for the public anonymous case. Phase 2 expands to all four Epic-supported hooks (`patient-view`, `order-select`, `order-sign`, `appointment-book`) and adds *Suggestion* + *App Link* card types per `EPIC_FHIR_REFERENCE.md` §4 line 128–131.

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/routes/cdsHooks.ts` | (1) Add `patient-view`, `order-sign`, `appointment-book` handlers each as separate `POST /cds-services/curavend-{hookName}` endpoints. (2) Expand `/cds-services` discovery to list all four. (3) Add `prefetch` declarations per hook (Patient, Encounter, draftOrders, Coverage, Conditions). (4) For each hook, parse `fhirAuthorization.access_token` if present and use it for inline FHIR lookups (per spec — Epic *gives* you a token good for the hook duration). (5) On `order-sign` cards: return Information ("Curavend has covered substitute for $X less"), Suggestion (FHIR Bundle to swap the resource to the cheaper item — formulary engine already has this data), and App Link (`type: "smart"`, URL = `https://curavend-web.pages.dev/fhir-launch-bounce#…` carrying the patient + encounter context). (6) Reuse the existing formulary service (`packages/api/src/services/` — extend `formulary.ts` route or its underlying service to expose a `bestSubstitute(hcpc)` helper). |

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/services/fhir/cdsHookCards.ts` | 240 | Card builders: `infoCard()`, `suggestionCardSwapHcpc()`, `appLinkCard()`, `priorAuthRequiredCard()`, `preferredVendorCard()`. Pure functions. Easy to unit-test (when we get tests). |
| `packages/api/src/services/fhir/cdsHookContext.ts` | 130 | Shared parsing of the inbound hook payload: extracts HCPC codes from `draftOrders.entry[].resource.code.coding` for ServiceRequest/DeviceRequest/MedicationRequest, normalizes patient/encounter IDs, resolves the matching `ehrConnections` row by `fhirServer === fhirBaseUrl`. |

**Reuses**: existing inventory/fee-schedule queries; new formulary helper.

**Epic FHIR endpoints + scopes**: CDS Hooks discovery is *public* (no auth on Epic's side). The hook *payload* carries `fhirAuthorization.access_token` which we use to make follow-on reads — that token has the scope Epic decided per the customer's enablement (typically `system/*.read`).

**Risk/blocker**:
1. **Latency budget**: Epic times out hook responses at ~5 seconds. Every DB query and FHIR call counts. Keep the hot path under 1 second: pre-fetch declarations are cheap (Epic does the FHIR lookup before calling us); use them.
2. **Card schema drift**: CDS Hooks 1.x → 2.0 transition is ongoing. Stay on 1.0 cards (which Epic accepts) until customers demand 2.0.
3. **Suggestion application**: Epic clinicians may *click* the suggestion but Epic may apply only partial changes (e.g. accept the swap but discard the price annotation). The Suggestion Bundle must be self-contained, no narrative dependencies.

**Verification**: Epic Sandbox CDS Hooks sandbox at `cds-hooks.org/sandbox` — register our discovery URL, fire `order-sign` synthetically with a draft ServiceRequest containing E0143 → see one info card with substitute, one app-link card.

### 2.N — Nightly Practitioner directory sync (cron)

Use Backend Services JWT to nightly pull `Practitioner` + `PractitionerRole` for the tenant, upsert into a new local `ehrPractitioners` table. Lets us populate physician pickers in our wizards from real Epic data instead of admin re-typing NPIs.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/api/src/cron/practitionerSync.ts` | 230 | For each active `ehrConnections` row with `vendor='EPIC'` and `mappingProfile.practitionerSyncEnabled === true`: page through `GET {base}/Practitioner?_count=200` + `GET {base}/PractitionerRole?_count=200`, upsert each into `ehrPractitioners`. Throttle: max 10 connections per cron run; rest are deferred to next run (write `connectionId` + `nextSyncAt` to a cursor table or just rely on `lastSuccessAt`). |
| `packages/db/src/schema/ehrPractitioners.ts` | 60 | New schema: `{ id (curavend uuid), connectionId, epicPractitionerId, npi, given, family, prefix, suffix, specialtyCodes (JSON), departmentIds (JSON), email, phone, fhirRoleIds (JSON), lastSyncedAt }`. Unique on `(connectionId, epicPractitionerId)`. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/api/src/index.ts` | In the `'0 8 * * *'` cron case, add `ctx.waitUntil(handlePractitionerSync(env))`. |
| `packages/db/src/schema/index.ts` | `export * from './ehrPractitioners';` |
| `packages/db/src/migrations/0023_epic_practitioner_directory.sql` | New table per the new schema. |

**Reuses**: 2.L for token acquisition; existing cron orchestration pattern (mirror `dmeposExpiry.ts`).

**Epic FHIR endpoints + scopes**:
- `GET {base}/Practitioner?_count=200&_offset=…` — `system/Practitioner.read`.
- `GET {base}/PractitionerRole?_count=200&_offset=…` — `system/PractitionerRole.read`.

**Risk/blocker**:
1. **Cron CPU budget**: bundled Worker cron has the same 30 s CPU cap as a paid request. A large tenant (5,000 practitioners, 25 pages) might exceed it. Mitigate by splitting per-connection across multiple cron runs (10 per night) and persisting page cursors.
2. **Epic pagination quirks**: Epic returns `link[rel=next]` URLs sometimes with absolute Epic-internal hostnames, sometimes relative. Normalize.
3. **Throttling**: per `EPIC_FHIR_REFERENCE.md` §5 line 146 — exponential backoff on 429. Wrap each FHIR call.

**Verification**: after one cron run against sandbox, `SELECT COUNT(*) FROM ehrPractitioners WHERE connectionId = ?` returns ≥ Epic's known sandbox practitioner count (small, ~20).

### 2.O — Per-customer Epic activation runbook (docs extension)

Extends 1.I with the steps the *Curavend onboarding engineer* runs to activate Phase 2 features at a new customer.

**Files to CREATE**

| Path | ~LOC | Purpose |
|---|---|---|
| `packages/web/src/features/helpCenter/content/epic-phase2-activation.md` | 600 | Sections: (a) JWKS registration with customer's Epic Vendor Services contact, (b) Backend Services scope justification template (`system/DocumentReference.write`, `system/Procedure.write`, `system/Practitioner.read`, `system/PractitionerRole.read`) with the *why* for each, (c) CDS Hooks service registration in customer's Hyperspace, per-hook enablement workflow, (d) Showroom listing checklist, (e) joint go-live test plan (3 weeks: connectivity → read → CDS → write → production cutover). |
| `packages/web/src/features/helpCenter/content/epic-scope-matrix.md` | 200 | Tabular matrix mapping every Curavend feature → required Epic scopes → whether read or write, plus 1-line business justification. Sized for one screen. |

**Files to MODIFY**

| Path | Change |
|---|---|
| `packages/web/src/features/helpCenter/pages/EpicAdminRunbook.tsx` | Add the two new articles to the sidebar TOC. |

**Reuses**: HelpCenter scaffold from 1.I.

**Risk/blocker**: customer Epic admins move slowly (3–12 months per `EPIC_FHIR_REFERENCE.md` §1 line 27). Set sales expectations.

**Verification**: a Curavend onboarding engineer can walk a hospital admin through a fresh Phase 2 activation in under 10 calendar days of admin-bound work using these docs.

---

## Cross-cutting concerns

### Schema migrations needed

All migrations go into `packages/db/src/migrations/`. Three files in this plan, numbered sequentially after `0022`:

**`0023_epic_phase1_metadata.sql`** (Phase 1)
```sql
-- Add Epic-write-back metadata columns to orders
ALTER TABLE orders ADD COLUMN epic_document_reference_id TEXT;
ALTER TABLE orders ADD COLUMN epic_procedure_resource_ids TEXT; -- JSON array
ALTER TABLE orders ADD COLUMN epic_connection_id TEXT;
ALTER TABLE orders ADD COLUMN fhir_patient_id TEXT;
ALTER TABLE orders ADD COLUMN fhir_encounter_id TEXT;
CREATE INDEX orders_epic_conn_idx ON orders (epic_connection_id);
CREATE INDEX orders_fhir_patient_idx ON orders (fhir_patient_id);
```

**`0024_epic_practitioner_directory.sql`** (Phase 2.N)
```sql
CREATE TABLE ehr_practitioners (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL,
  epic_practitioner_id TEXT NOT NULL,
  npi TEXT,
  given TEXT,
  family TEXT,
  prefix TEXT,
  suffix TEXT,
  specialty_codes TEXT,        -- JSON array
  department_ids TEXT,         -- JSON array
  email TEXT,
  phone TEXT,
  fhir_role_ids TEXT,          -- JSON array
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX ehr_practitioners_uq ON ehr_practitioners (connection_id, epic_practitioner_id);
CREATE INDEX ehr_practitioners_npi_idx ON ehr_practitioners (npi);
```

**`0025_epic_token_metadata.sql`** (Phase 2.L)
```sql
-- Per-connection FHIR write event log (separate from ehr_ingest_log which is push-direction only)
CREATE TABLE fhir_write_log (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL,
  order_id TEXT,
  resource_type TEXT NOT NULL,    -- DocumentReference | Procedure
  fhir_resource_id TEXT,          -- assigned by Epic
  status TEXT NOT NULL,            -- ATTEMPTED | SUCCESS | FAILED
  error_message TEXT,
  http_status INTEGER,
  request_id TEXT,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX fhir_write_log_conn_idx ON fhir_write_log (connection_id);
CREATE INDEX fhir_write_log_order_idx ON fhir_write_log (order_id);
CREATE INDEX fhir_write_log_attempted_idx ON fhir_write_log (attempted_at);
```

Corresponding Drizzle schemas in `packages/db/src/schema/`: extend `orders.ts`, create `ehrPractitioners.ts`, create `fhirWriteLog.ts`, export each from `schema/index.ts`.

### Secret management — Worker secrets

Naming convention (matches existing `EHR_CONN_*` pattern in `ehrConnections.authSecretEnvRef` examples):

```
EHR_CONN_<connectionIdShort>_CLIENT_SECRET     # confidential client_secret (Standalone Launch user-delegated)
EHR_CONN_<connectionIdShort>_WEBHOOK_SECRET    # HMAC for inbound webhooks (existing pattern)
```

`<connectionIdShort>` = first 8 chars of the UUID, uppercased, hyphens dropped. Example for `connId = a3f8b2e1-…`: env var name is `EHR_CONN_A3F8B2E1_CLIENT_SECRET`.

Set via:
```
wrangler secret put EHR_CONN_A3F8B2E1_CLIENT_SECRET --env production
```

The `ehrConnections` row stores only the *name* (`authSecretEnvRef = 'EHR_CONN_A3F8B2E1_CLIENT_SECRET'`). Resolution at request time via `(env as any)[conn.authSecretEnvRef]` — already implemented in `routes/ehr.ts` at line 216. Reuse.

For Backend Services keypairs (2.L), private keys live in `env.KV` (encrypted via `fernetCipher` keyed by `env.ENCRYPTION_KEY`), not as Worker secrets. Rationale: per-connection keypair generation is dynamic; you'd otherwise have to push a new Worker secret on every connection create, which is operational pain.

### Webhook-free pull cadence

Per `EPIC_FHIR_REFERENCE.md`, **Epic does not push** new orders to external systems via webhook. Curavend gets data into the system via four mechanisms:

| Mechanism | Trigger | Use case | Phase |
|---|---|---|---|
| **CDS Hook (`order-sign`)** | Real-time, clinician about to sign | Most timely intake. Returns app-link card; clinician clicks → lands in Curavend with launch context | 2.M |
| **EHR Launch** | Clinician clicks button in Epic chart | Per-patient lookup; wizard prefilled | 1.C, 1.F |
| **Standalone Launch** | User opens Curavend, clicks "Connect to Epic" | Less common; only used by power users + admins | 1.D |
| **Backend Services cron** | Schedule (`0 8 * * *`) | Nightly Practitioner directory sync; future bulk export | 2.L, 2.N |

The legacy `POST /api/fhir/sync` polling endpoint in current `routes/fhir.ts` is **deprecated** in Phase 1.A — kept for one release with a deprecation log warning, removed in Phase 3. The right replacement is CDS Hook + Launch.

The existing `/api/ehr/:connectionId/ingest` webhook (in `routes/ehr.ts`) remains the *generic push path* — used by Cerner, Athena, eCW which do support outbound webhooks. It is **not** an Epic path.

### Multi-customer rollout sequencing

```
Week  0 –  6 : Phase 1 build (sandbox-only)
Week  6 –  8 : Phase 1 sandbox demo with design partner #1 customer Epic admin (read-only)
Week  8 – 14 : Phase 2 build (sandbox-only, including JWKS infra)
Week 14 – 16 : Design partner #1 Customer Connection Request + scope approval
Week 16 – 20 : Joint go-live test plan (read first, then DocumentReference write, then CDS hooks)
Week 20+     : Design partner #1 production. Begin design partner #2 onboarding (3–12 weeks per Epic norm).
```

Phase 1 sandbox-only proof prevents wasted effort if a design partner can't get over the Connection Request hump. **Do not deploy Phase 2 to a customer's production tenant until the customer has signed off on Phase 2 scope set in writing.**

### Out of scope (Phase 3+)

Explicit non-goals so we don't accidentally promise these:

- **DeviceRequest.Create via FHIR** — flagged unreliable in `EPIC_FHIR_REFERENCE.md` line 193. Phase 3 will attack this via HL7v2 ORM through a per-customer Mirth/Rhapsody bridge.
- **ServiceRequest.Create for labs** — supported by Epic but a separate workflow scope; sits in lab feature roadmap.
- **Bulk `$export`** — useful for analytics; >1,000-patient discouragement makes it Phase 3+. We pull per-patient deltas in the meantime.
- **Multi-EHR write parity** — Cerner / Meditech / Athena have their own write APIs (Cerner uses HL7 FHIR R4 too but tenant-gated; Meditech uses Expanse APIs; Athena uses their proprietary API). Phase 1+2 cover Epic only.
- **SMART v2 granular scopes** (`patient/Patient.rs?_id=…`) — overkill for current use; Phase 1+2 use `.read/.write/.cruds` shorthand.
- **JWKS key rotation UX** — Phase 2 ships initial mint + manual rotate via env override; UX rotation is Phase 3.

### Risks & constraints (Curavend-specific stack callouts)

| Risk | Where | Mitigation |
|---|---|---|
| Worker CPU 30 s bundled cap | 2.L keypair gen, 2.J PDF base64 | Run heavy work from queue consumer (longer budget than request handler); never block a fetch handler on PDF assembly. |
| KV eventual consistency | 1.A token refresh, 2.L bearer cache | Accept rare double-refresh; document race; never use KV as a lock. |
| D1 read replica lag | All FHIR-derived order lookups | D1 globally distributes — reads might lag writes by ~100 ms. The "View in Epic" link reading `epicDocumentReferenceId` could 404 briefly after queue push completes. Mitigate by reading via the primary on cache-miss. |
| Per-tenant MRN OID variance | 1.E patient search | Store OID in `mappingProfile.mrnSystem`; required field in admin form for EPIC vendors. |
| Hono middleware ordering for public Epic callbacks | 1.A, 1.C, 2.L | All new public paths go in `PUBLIC_PATTERNS` regex array in `middleware/auth.ts` — same mechanism already used for `/api/ehr/:id/ingest`. |
| `crypto.subtle.generateKey` is unavailable on Workers free | 2.L | Hard-document Paid plan dependency. |
| Hono error handler swallows raw Epic errors | All FHIR services | Wrap every `fhirClient` call in a try/catch that extracts Epic's `OperationOutcome.issue[].diagnostics` and rethrows as `AppError` with that detail string. |
| `react-markdown` may not be in `web/package.json` | 1.I, 2.O | Audit & add if missing (next-touch). |
| Rate limit: Epic throttles unrelated to ours | 2.N cron | Exponential backoff in `fhirClient`; cap concurrency to 4. |
| Cron 30 s cap × tenant count | 2.N for >10 active connections | Round-robin: process 10 connections per nightly run, rotate via cursor table; full directory refresh weekly per tenant minimum. |

### Verification protocol

**Sandbox phase** (Phase 1 + 2 build): every feature gates on green checks against `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/` with Epic's published test patients (Camila Lopez, Derrick Lin, Desiree Powell).

**Continuous synthetic canary** (post Phase 1.E): a queue-triggered job runs every 6 h that fetches a known sandbox patient via the typed services. Alerts via existing Sentry binding (`SENTRY_DSN`) if any step fails.

**First-customer pilot acceptance criteria**:
1. Three clinicians at the customer successfully complete EHR Launch from chart → wizard → order in one week.
2. Zero errors logged in `fhir_write_log` across 10 DocumentReference pushes.
3. CDS Hook fires on `order-sign` with median latency < 1.2 s, p99 < 3 s.
4. Practitioner sync completes within nightly cron window (one run, no carry-over).

---

### Critical Files for Implementation

The five files most critical to landing this plan. Phase 1 cannot ship without (1), (2), and (3); Phase 2 cannot ship without (4) and (5):

- `D:\Proxy IQ\curavend\packages\api\src\routes\fhir.ts` (refactor — the single hottest file)
- `D:\Proxy IQ\curavend\packages\api\src\services\ehrAdapter.ts` (extend with connection loader + secret resolver)
- `D:\Proxy IQ\curavend\packages\api\src\middleware\auth.ts` (add `PUBLIC_PATTERNS` regex entries for `/api/fhir/launch`, `/api/fhir/redirect`, `/.well-known/jwks.json`)
- `D:\Proxy IQ\curavend\packages\api\src\routes\cdsHooks.ts` (multi-hook expansion — current is single-hook stub)
- `D:\Proxy IQ\curavend\packages\db\src\schema\ehrConnections.ts` (no schema change, but reading paths and `mappingProfile` JSON conventions extend significantly — anchor for all per-tenant config)

# 07 — Integrations & EHR Workflows

Scope: every workflow that connects Curavend to an external clinical or
financial system — Epic / SMART-on-FHIR launch & OAuth, FHIR resource reads,
write-backs (DocumentReference, Procedure), CDS Hooks, SMART Backend Services
(JWT + JWKS), per-tenant EHR connection registry, the generic HMAC ingest
webhook, Stripe / Resend billing & delivery webhooks, the integration
retry/dead-letter framework, and PO transmission to vendor connectors.

All Epic behaviour is driven by the `ehr_connections` D1 table (one row per
tenant×vendor). Per-(connection,user) OAuth tokens live in Cloudflare KV
(`epic:token:{connId}:{userId}`); per-connection Backend-Services keypairs and
bearer tokens also live in KV. Mount prefixes (from `packages/api/src/index.ts`):
`/api/fhir` (fhir.ts), `/api/ehr` (ehr.ts), `/` (cdsHooks.ts — PUBLIC),
`/` (jwks.ts — PUBLIC), `/api/webhooks` (webhooks.ts — PUBLIC), `/api/integrations`
(integrations.ts — admin-only).

`EHR_VENDORS` enum (`packages/db/src/schema/ehrConnections.ts:22`): `EPIC`,
`CERNER`, `MEDITECH`, `ATHENA`, `ALLSCRIPTS`, `ECW`, `GENERIC_FHIR_R4`.
`EHR_AUTH_MODES` enum (`:33`): `OAUTH2_CLIENT_CREDENTIALS`,
`OAUTH2_USER_DELEGATED`, `SHARED_SECRET`, `API_KEY`, `MTLS`. Epic is the only
vendor with live OAuth / write-back / Backend-Services code today; the others
are registry + generic-FHIR-ingest only.

## Workflow index

- **W7-01** — EHR Launch (SMART launch → OAuth → land on Curavend wizard)
- **W7-02** — Standalone / Provider OAuth launch ("Connect to Epic")
- **W7-03** — Pre-fill order wizard from Epic context (launch-context-prefill)
- **W7-04** — Typed FHIR resource reads (Patient / Encounter / Coverage / Condition / Practitioner)
- **W7-05** — "View in Epic" deep link
- **W7-06** — DocumentReference write-back (DWO / claim PDF → Epic chart)
- **W7-07** — Procedure write-back (charge-capture HCPC → Epic encounter)
- **W7-08** — CDS Hooks order-select / order-sign → prefill deep-link
- **W7-09** — SMART Backend Services JWT + JWKS hosting
- **W7-10** — Register / configure a per-tenant EHR connection
- **W7-11** — Generic FHIR ingest webhook (HMAC) → PENDING order
- **W7-12** — Stripe billing webhook
- **W7-13** — Resend (Svix) delivery / bounce webhook + unsubscribe
- **W7-14** — Integration log retry / abort / dead-letter (operator tooling)
- **W7-15** — PO transmission via connector (EDI / API / PunchOut / Email / Portal)

---

### W7-01: EHR Launch (SMART launch → OAuth → land on Curavend wizard)
- **Actors:** Clinician inside Epic (Hyperspace/EpicWeb); System (Worker)
- **Trigger:** Epic redirects the clinician to `GET /api/fhir/launch?iss=&launch=` (PUBLIC route)
- **Entry points:** `GET /api/fhir/launch`, `GET /api/fhir/redirect`, SPA bounce `/{FRONTEND_URL}/fhir-launch-bounce#ctx=...`
- **Permissions / tenant scope:** Public (no Curavend JWT — Epic does not carry it). Connection resolved from `iss` via `loadConnectionByIssuer` (tries with and without trailing slash); 404 if no active EPIC connection registered for that issuer.
- **Steps:**
  1. `/launch` requires `iss` + `launch`; resolves connection by issuer.
  2. Runs SMART discovery (`getSmartConfig`, cached 24h), generates PKCE verifier/challenge (`makePkce`), stashes verifier under a `nonce` (`stashVerifier`), signs `state` (`signState`) carrying `{connId, launchToken, iss, nonce}`.
  3. 302-redirects browser to Epic `authorization_endpoint` with `response_type=code`, `aud=fhirBaseUrl`, `launch`, `code_challenge`, scope (`scopesFor(mappingProfile)` → `mappingProfile.requestedScopes` or `DEFAULT_SCOPES`).
  4. Epic authenticates clinician, redirects back to `GET /api/fhir/redirect?code=&state=`.
  5. `/redirect` verifies `state` (`verifyState`), pops the PKCE verifier (`popVerifier`, single-use), loads connection, resolves client secret via `resolveSecret(env, conn.authSecretEnvRef)`, POSTs the authorization-code grant to `token_endpoint`.
  6. Stores token in KV via `putToken`. Owner key: EHR-Launch path has no `userId`, so token is bound to `fhir:<fhirUser>` (extracted unverified from `id_token`).
  7. Builds a sanitized context blob (`buildLaunchCtx` — connId, patientId, encounterId, fhirUser; never tokens), base64-encodes it, 302s to `${FRONTEND_URL}/fhir-launch-bounce#ctx=...`.
- **State machine:** n/a (token presence in KV is the only state). PKCE verifier is single-use.
- **Side effects:** KV writes (`epic:token:...`, verifier, SMART config cache); no DB writes.
- **Related services:** smartDiscovery, oauthFlow, tokenStore, connectionRegistry; SPA `FhirLaunchBounce.tsx`, `useFhirLaunchContext.ts`.
- **Source:** `packages/api/src/routes/fhir.ts:161-300`; `services/fhir/oauthFlow.ts`, `tokenStore.ts`, `smartDiscovery.ts`, `connectionRegistry.ts:29`.

### W7-02: Standalone / Provider OAuth launch ("Connect to Epic")
- **Actors:** Hospital admin / clinician in Curavend; System
- **Trigger:** User clicks "Connect to Epic" in the EHR Connections admin page (`EhrConnections.tsx`)
- **Entry points:** `GET /api/fhir/authorize-url?connectionId=` (authenticated), `GET /api/fhir/redirect` (PUBLIC), `GET /api/fhir/token-status`, `DELETE /api/fhir/disconnect`
- **Permissions / tenant scope:** `authorize-url` requires an authenticated Curavend user (`c.get('user').id`); token is bound to that user id. `redirect` is public.
- **Steps:**
  1. SPA calls `authorize-url`; server runs SMART discovery + PKCE, signs `state` with `{connId, userId, nonce}` (note: `userId` present, unlike EHR Launch), returns the Epic authorize URL.
  2. SPA redirects browser; Epic authenticates; callback hits the same `/redirect` handler as W7-01.
  3. Because `parsed.userId` is set, the token owner is the Curavend `userId` (not `fhir:...`).
  4. `token-status` reports `connected`, `expiresAt`, scope, patient/encounter/fhirUser. `disconnect` deletes the stored token (`deleteToken`).
- **State machine:** n/a.
- **Side effects:** KV token store keyed by Curavend userId.
- **Related services:** same as W7-01; `EhrConnections.tsx`.
- **Source:** `packages/api/src/routes/fhir.ts:125-155, 208-321, 742-748`.

### W7-03: Pre-fill order wizard from Epic context
- **Actors:** Clinician (post-launch); System
- **Trigger:** SPA launch-bounce calls the aggregate prefill endpoint after arriving from W7-01/W7-02
- **Entry points:** `GET /api/fhir/:connectionId/launch-context-prefill?patientId=&encounterId=`; also `GET /api/fhir/cds-hooks-prefill` (system-mode variant, see W7-08)
- **Permissions / tenant scope:** Authenticated. `ctxFor()` resolves the token owner: `?owner=` → explicit; else `?fhirUser=` → `fhir:<fhirUser>` (EHR-Launch path); else the calling Curavend user id (Standalone path).
- **Steps:**
  1. Requires `patientId`.
  2. Fires Patient + active Encounters + active Coverages + active Conditions in parallel (`Promise.all`), plus the specific Encounter if `encounterId` given. Each call is `.catch()`-guarded so one failure doesn't blank the wizard.
  3. Returns `{ patient, encounter, encounters, coverages, conditions }` — the SPA hydrates the CreateSupplyOrder wizard.
- **State machine:** n/a.
- **Side effects:** Read-only FHIR calls (user-delegated token).
- **Related services:** patient, encounter, coverage, condition, fhirClient.
- **Source:** `packages/api/src/routes/fhir.ts:413-433 (ctxFor), 535-557`.

### W7-04: Typed FHIR resource reads
- **Actors:** Clinician / Curavend UI; System
- **Trigger:** SPA / API calls per-resource read endpoints
- **Entry points:**
  - `GET /api/fhir/:connectionId/patient/:patientId`
  - `GET /api/fhir/:connectionId/patient?mrn=&system=` (search by MRN)
  - `GET /api/fhir/:connectionId/encounter/:encounterId` and `?patient=` (active)
  - `GET /api/fhir/:connectionId/coverage?patient=`
  - `GET /api/fhir/:connectionId/condition?patient=` (active only)
  - `GET /api/fhir/:connectionId/practitioner/:practitionerId`
  - Legacy: `GET /api/fhir/patient/:patientId?connectionId=` (Phase-1 transitional, raw fetch)
- **Permissions / tenant scope:** Authenticated; token owner resolved by `ctxFor` (W7-03).
- **Steps:** Each delegates to a typed service (`readPatient`, `searchPatientByMrn`, `readEncounter`, `activeEncountersForPatient`, `coveragesForPatient`, `activeConditionsForPatient`, `readPractitioner`) which uses `fhirClient` (`fhirGet`/`fhirSearch`): resolves token, sets `Accept: application/fhir+json`, retries once on 401 after token refresh, maps `OperationOutcome.issue[].diagnostics` → `AppError`.
- **State machine:** n/a.
- **Side effects:** Read-only.
- **Related services:** fhir/{patient,encounter,coverage,condition,practitioner,fhirClient}.ts.
- **Source:** `packages/api/src/routes/fhir.ts:436-492`; `services/fhir/fhirClient.ts:97-147`.

### W7-05: "View in Epic" deep link
- **Actors:** Curavend user viewing a supply-order detail
- **Trigger:** UI renders the `ViewInEpicButton`; SPA calls the deep-link endpoint
- **Entry points:** `GET /api/fhir/:connectionId/deep-link?patientId=&encounterId=`
- **Permissions / tenant scope:** Authenticated; connection loaded by id.
- **Steps:**
  1. Reads `mappingProfile.deepLinkTemplate` (per-customer; lets each site pick Hyperspace vs EpicWeb URL). Returns `{url:null}` if not configured (button hidden).
  2. Substitutes `{patientId}` / `{encounterId}` placeholders (URL-encoded). If any unfilled `{...}` remain → returns `{url:null, error:'Template has unfilled placeholders'}`.
- **State machine:** n/a.
- **Side effects:** None.
- **Related services:** connectionRegistry; SPA `ViewInEpicButton.tsx`, `FromEpicBadge.tsx`.
- **Source:** `packages/api/src/routes/fhir.ts:504-526`.

### W7-06: DocumentReference write-back (DWO / claim PDF → Epic chart)
- **Actors:** System (post-delivery auto-push) or admin (manual)
- **Trigger:** `POST /api/fhir/:connectionId/push-document` (manual/admin) — also intended to be invoked by the order-delivered queue handler to auto-push DWO + claim bundle
- **Entry points:** `POST /api/fhir/:connectionId/push-document`; service `createDocumentReference`
- **Permissions / tenant scope:** Connection loaded by id. Uses **Backend Services** system token (`mode:'system'`, scope `system/DocumentReference.write`) — runs without a user session.
- **Steps:**
  1. Body: `{ patientId, encounterId?, loincCode, loincDisplay?, title, pdfBytesBase64, idempotencyKey, authorPractitionerId?, description? }` — all required fields validated.
  2. LOINC code must be in the customer whitelist (`mappingProfile.documentReferenceLoincWhitelist`, else `DEFAULT_WHITELIST` = `57133-1, 34108-1, 11506-3, 34117-2`); rejects with `DOCREF_LOINC_NOT_WHITELISTED` otherwise.
  3. Builds a FHIR `DocumentReference` (status `current`, docStatus `final`, category `clinical-note`, PDF base64 in `content.attachment.data`).
  4. POSTs with conditional-create header `If-None-Exist: identifier=https://curavend.io|<idempotencyKey>` so retries don't duplicate. Returns `{ fhirId, idempotencyKey }`.
- **State machine:** n/a (idempotency via FHIR identifier).
- **Side effects:** Creates/links one Epic DocumentReference.
- **Related services:** documentReference.ts, fhirClient.ts (`fhirPost`), backendServicesAuth.ts.
- **Source:** `packages/api/src/routes/fhir.ts:584-622`; `services/fhir/documentReference.ts:88-174`.

### W7-07: Procedure write-back (charge-capture HCPC → Epic encounter)
- **Actors:** System (on order completion) or admin
- **Trigger:** `POST /api/fhir/:connectionId/push-procedure`; intended on order transition to `ORDER_COMPLETED`, one Procedure per line item
- **Entry points:** `POST /api/fhir/:connectionId/push-procedure`; service `createProcedure`
- **Permissions / tenant scope:** Backend Services system token, scope `system/Procedure.write`. **Opt-in only:** `mappingProfile.procedureWriteEnabled === true` required, else `PROCEDURE_WRITE_DISABLED` (default disabled).
- **Steps:**
  1. Body: `{ patientId, encounterId, hcpcCode, hcpcDisplay?, performedDateTime, quantity?, performerPractitionerId?, idempotencyKey }`.
  2. Builds FHIR `Procedure` (status `completed`, HCPCS system `https://bluebutton.cms.gov/resources/codesystem/hcpcs`, subject/encounter refs). Quantity >1 encoded as a `note` (FHIR Procedure has no native quantity).
  3. Conditional-create via `If-None-Exist` identifier. Returns `{ fhirId, idempotencyKey }`.
- **State machine:** n/a.
- **Side effects:** Creates one Epic Procedure (charge feed → Resolute PB); customer workflow decides auto-bill vs review.
- **Related services:** procedure.ts, fhirClient.ts, backendServicesAuth.ts.
- **Source:** `packages/api/src/routes/fhir.ts:632-663`; `services/fhir/procedure.ts:51-112`.

### W7-08: CDS Hooks order-select / order-sign → prefill deep-link
- **Actors:** Clinician in Epic; System (PUBLIC CDS Hooks server)
- **Trigger:** Epic invokes the CDS Hooks endpoints when a clinician selects/signs orders
- **Entry points (mounted at `/`, PUBLIC):**
  - `GET /cds-services` (discovery; lists `curavend-dme` (order-select) + `curavend-order-sign` (order-sign))
  - `POST /cds-services/curavend-dme` (order-select)
  - `POST /cds-services/curavend-order-sign` (order-sign)
  - `GET /api/fhir/cds-hooks-prefill?patientId=&encounterId=` (SPA last-mile, authenticated)
- **Permissions / tenant scope:** CDS endpoints PUBLIC per spec (no auth). `cds-hooks-prefill` is authenticated and auto-selects the hospital's first active EPIC connection (`loadEpicConnectionForHospital`).
- **Steps:**
  1. **order-select:** extracts HCPCS (regex `^[A-Z]\d{4}`) from `draftOrders`, looks up `inventory_items` + `medicare_fee_schedule_items`, returns info cards with "Create Order in Curavend" links (or fee-only / fallback card). Never fails — returns empty cards on DB error.
  2. **order-sign:** extracts signed HCPCS; if none, returns empty `cards[]` (stays silent). Otherwise builds a deep link to `https://curavend-web.pages.dev/create-dme-order?source=cds-hooks&patientId=&encounterId=&fhirUser=&hcpcs=...` and returns a single card "Generate DWO + Claim Bundle in Curavend".
  3. SPA arrives at `/create-dme-order`, calls `cds-hooks-prefill`, which uses **system-mode** Backend Services (scopes `system/Patient.read|Encounter.read|Coverage.read|Condition.read`) — no per-user OAuth needed — and returns the same prefill shape as W7-03.
- **State machine:** n/a.
- **Side effects:** Read-only DB lookups; system-mode FHIR reads in the prefill step.
- **Related services:** cdsHooks.ts, connectionRegistry.ts:58 (`loadEpicConnectionForHospital`), fhir read services.
- **Source:** `packages/api/src/routes/cdsHooks.ts` (whole file); `routes/fhir.ts:680-721`.

### W7-09: SMART Backend Services JWT + JWKS hosting
- **Actors:** System (write-backs, Practitioner sync); Epic (validates JWT against JWKS); admin (eager mint)
- **Trigger:** Any system-mode FHIR call (`getBackendAccessToken`); Epic fetches `GET /.well-known/jwks.json`; admin `POST /api/fhir/:connectionId/mint-keypair`
- **Entry points:** `GET /.well-known/jwks.json` (jwks.ts, PUBLIC); `POST /api/fhir/:connectionId/mint-keypair`; service `backendServicesAuth.ts`
- **Permissions / tenant scope:** JWKS public; per-connection keypairs. Requires Worker secret `FERNET_KEY` (else `BACKEND_SERVICES_NOT_CONFIGURED`).
- **Steps:**
  1. First mint per connection: generate RS384 RSA-2048 keypair (jose), store public JWK in KV (`epic:jwks:{connId}:public`) and Fernet-encrypted PKCS8 private key (`epic:jwks:{connId}:private`). `kid = connId`. Idempotent.
  2. `mintClientAssertion`: signs JWT (`alg RS384`, `kid`, `iss=sub=client_id`, `aud=token_endpoint`, `jti`, `exp=now+240s`).
  3. `getBackendAccessToken`: client_credentials grant with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`; caches bearer in KV `epic:bsv-token:{connId}:{sha256(scope)[:16]}` (TTL = expires_in − 60s).
  4. `/.well-known/jwks.json` lists public JWKs only for active connections that have minted a keypair (lazy); `Cache-Control: public, max-age=300`.
- **State machine:** n/a (KV cache lifecycle).
- **Side effects:** KV keypair + bearer-token cache.
- **Related services:** backendServicesAuth.ts, fernetCipher, smartDiscovery, jwks.ts.
- **Source:** `services/fhir/backendServicesAuth.ts` (whole file); `routes/jwks.ts`; `routes/fhir.ts:566-572`.

### W7-10: Register / configure a per-tenant EHR connection
- **Actors:** Platform admin / Account Manager / Facility Account Manager
- **Trigger:** EHR Connections admin UI CRUD
- **Entry points:** `GET/POST /api/ehr/connections`, `GET/PATCH/DELETE /api/ehr/connections/:id`, `GET /api/ehr/connections/:id/recent-logs`
- **Permissions / tenant scope:** `rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER','FACILITY_ACCOUNT_MANAGER')`. Admins / Account Managers see all; hospital-scoped managers see only their `hospitalId` and are blocked cross-tenant (`ForbiddenError`). Non-admin create is locked to caller's hospital.
- **Steps:** Validates `vendor` ∈ `EHR_VENDORS` and `authMode` ∈ `EHR_AUTH_MODES`; stores `fhirBaseUrl`, `authClientId`, secret **env-var references** (never raw secrets in D1), and JSON `mappingProfile`. `isActive` defaults 1. recent-logs returns last 50 `ehr_ingest_log` rows.
- **State machine:** `isActive` 1/0 toggle.
- **Side effects:** `ehr_connections` rows.
- **Related services:** ehrAdapter.ts, connectionRegistry.ts.
- **Source:** `packages/api/src/routes/ehr.ts:38-197, 326-340`; schema `packages/db/src/schema/ehrConnections.ts`.

### W7-11: Generic FHIR ingest webhook (HMAC) → PENDING order
- **Actors:** External EHR (Cerner/Meditech/Athena/etc.) outbound webhook; System
- **Trigger:** EHR POSTs a FHIR resource to the ingest endpoint
- **Entry points:** `POST /api/ehr/:connectionId/ingest` (PUBLIC — bypasses auth)
- **Permissions / tenant scope:** No JWT. Per-connection HMAC: `verifyWebhookSignature(rawBody, x-curavend-webhook-signature, secret)` where secret = `env[conn.webhookSecretEnvRef]`. Connection must be `isActive=1`.
- **Steps:**
  1. Invalid signature → log `ehr_ingest_log` status `FAILED`, return 401.
  2. Parse JSON; map via `mapResourceToOrder(conn, resource)`. Mapping error → log `FAILED`, 422.
  3. No patient name resolved → log `SKIPPED`, 200.
  4. Else insert an `orders` row: status `PENDING`, `orderSubStatus='NEW_ORDER'`, identifier `EHR-<connId8>-<resourceId12>`, mapped demographics/ICD-10/priority/requester/note. Log `PROCESSED` with `mappedOrderId`; update connection `lastSuccessAt`.
- **State machine:** Ingest log status: `FAILED | SKIPPED | PROCESSED`. New order enters the normal order lifecycle at `PENDING / NEW_ORDER`.
- **Side effects:** Order row + ingest-log row + connection success/error timestamps.
- **Related services:** ehrAdapter.ts (`mapResourceToOrder`, `verifyWebhookSignature`).
- **Source:** `packages/api/src/routes/ehr.ts:205-323`.

### W7-12: Stripe billing webhook
- **Actors:** Stripe; System
- **Trigger:** `POST /api/webhooks/stripe`
- **Entry points:** `POST /api/webhooks/stripe` (PUBLIC)
- **Permissions / tenant scope:** PUBLIC; **fails closed** if `STRIPE_WEBHOOK_SECRET` unset (503). Verifies HMAC-SHA256 `t.<body>` signature (constant-time compare) with ±300s replay tolerance.
- **Steps (by `event.type`):**
  - `checkout.session.completed`: if `metadata.invoiceType==='vendor_invoice'` → set invoice `INVOICE_PAID` (payment date/amount/intent/session) and enqueue `invoice.paid`. Else subscription flow → set subscription `ACTIVE`, insert `payment_history`.
  - `customer.subscription.updated`: map Stripe status → `ACTIVE | PAST_DUE | CANCELLED | UNPAID | PENDING`.
  - `customer.subscription.deleted`: → `CANCELLED`.
  - `invoice.payment_succeeded`: insert `payment_history` SUCCEEDED.
  - `invoice.payment_failed`: subscription → `PAST_DUE`.
- **State machine:** invoice → `INVOICE_PAID`; subscription → `ACTIVE/PAST_DUE/CANCELLED/UNPAID/PENDING`.
- **Side effects:** DB updates; enqueues `invoice.paid` (→ W8 queue, file 08 W8-16).
- **Related services:** EVENTS_QUEUE; invoiceEvents handler.
- **Source:** `packages/api/src/routes/webhooks.ts:78-221`.

### W7-13: Resend (Svix) delivery / bounce webhook + unsubscribe
- **Actors:** Resend (via Svix); email recipients; System
- **Trigger:** `POST /api/webhooks/resend`; `GET /api/webhooks/unsubscribe?token=`
- **Entry points:** `POST /api/webhooks/resend` (PUBLIC), `GET /api/webhooks/unsubscribe` (PUBLIC)
- **Permissions / tenant scope:** PUBLIC; fails closed if `RESEND_WEBHOOK_SECRET` unset (503). Svix HMAC over `${id}.${timestamp}.${body}` (secret base64-decoded after stripping `whsec_`), ±5min tolerance. Unsubscribe token = base64url(payload)+HMAC suffix signed with `JWT_SECRET`.
- **Steps:**
  1. Map event suffix → delivery status (`DELIVERED|BOUNCED|COMPLAINED|OPENED|CLICKED|FAILED`), update `notification_delivery_log` by `externalMessageId`.
  2. Hard bounce / complaint → insert into `unsubscribes` (source `BOUNCE`/`COMPLAINT`) to protect sender reputation.
  3. `/unsubscribe` verifies token HMAC, inserts `unsubscribes` (source `USER_LINK`), returns an HTML confirmation page.
- **State machine:** delivery-log status transitions as above.
- **Side effects:** `notification_delivery_log` updates, `unsubscribes` inserts.
- **Related services:** notificationDeliveryLog, unsubscribes schemas.
- **Source:** `packages/api/src/routes/webhooks.ts:233-432`.

### W7-14: Integration log retry / abort / dead-letter (operator tooling)
- **Actors:** Platform admin (ops)
- **Trigger:** Integration Log admin UI
- **Entry points:** `GET /api/integrations/log` (filter by status/entityType/entityId/connector), `GET /api/integrations/log/:id`, `POST /api/integrations/log/:id/retry`, `POST /api/integrations/log/:id/abort`
- **Permissions / tenant scope:** Admin-only (`assertAdmin` — `user.userType==='ADMIN'`), not tenant-facing.
- **Steps:**
  1. retry: rejects if already `SUCCESS`; else sets status `RETRYING`, `nextRetryAt=now` so the 15-min retry cron picks it up (file 08 W8-03).
  2. abort: `abortIntegrationCall` → status `TERMINAL_FAILURE` with reason.
- **State machine:** `RETRYING` (re-armed) / `TERMINAL_FAILURE` (aborted). Cron drives `RETRYING → DEAD_LETTER` past `MAX_ATTEMPTS=5`.
- **Side effects:** `integration_log` updates.
- **Related services:** lib/integrationLog.ts (`abortIntegrationCall`); cron/integrationRetry.ts.
- **Source:** `packages/api/src/routes/integrations.ts` (whole file).

### W7-15: PO transmission via connector (EDI / API / PunchOut / Email / Portal)
- **Actors:** Procurement user / System; vendor (ACK)
- **Trigger:** PO "Send" action calls `transmitPo`; vendor ACK calls `ackPo`
- **Entry points:** service `transmitPo(env, poId, {method?, byUserId?})`, `ackPo(d1, poId)`
- **Permissions / tenant scope:** Method param → else vendor `preferredPoTransmissionMethod` → else `EMAIL`. Outbound fetch via `safeFetch` (SSRF-guarded).
- **Steps:**
  1. Bump `transmissionAttempts`, set PO `transmissionState='SENDING'`.
  2. Dispatch to adapter: `EDI` (X12 850 envelope), `API` (JSON POST, optional Bearer from `poTransmissionCredentials`), `PUNCHOUT` (cXML OrderRequest), `EMAIL` (renders HTML — currently records intent, returns 202), `PORTAL` (no-op, always 200).
  3. Write one `po_transmission_log` row per attempt (request/response samples capped 500 chars, durationMs).
  4. Set PO `transmissionState='SENT'|'FAILED'` (+ `transmittedAt` / `transmissionError`).
  5. On **first** successful send only, post GL encumbrance via `postPoCommit` (retries don't re-post). GL failure logged, never fails transmission.
  6. `ackPo` flips `SENT → ACKED` (`vendorAckAt`).
- **State machine:** `NOT_SENT → SENDING → SENT|FAILED`; `SENT → ACKED`.
- **Side effects:** PO state, transmission log, optional outbound HTTP, GL journal entry.
- **Related services:** poTransmissionService.ts, glService (`postPoCommit`), safeFetch.
- **Source:** `packages/api/src/services/poTransmissionService.ts` (whole file).

---

## Notes / ambiguities

- W7-06/W7-07 expose only the manual `POST .../push-document` / `push-procedure`
  routes in `fhir.ts`. The service doc-comments say they are also called by the
  order-delivered queue handler / on `ORDER_COMPLETED`, but `queues/orderEvents.ts`
  does not currently import `createDocumentReference` / `createProcedure` — the
  auto-push wiring appears not yet connected. Flagged as not-verified.
- `POST /api/fhir/sync` is **deprecated** — returns HTTP 410 `FHIR_SYNC_DEPRECATED`
  (`fhir.ts:726-739`).
- `redirectUri()` is hard-coded to
  `https://curavend-api.metabilityllc1.workers.dev/api/fhir/redirect`
  and must match the Epic app registration exactly.
- PUBLIC routing for `/api/ehr/:connectionId/ingest`, the CDS endpoints, JWKS, and
  the webhooks depends on `PUBLIC_PATTERNS` in `middleware/auth.ts` (referenced in
  comments; not re-verified here).

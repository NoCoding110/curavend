# Epic Customer Activation Runbook (Phase 1)

For: Curavend implementation engineers + the hospital's Epic Vendor Services / Interconnect admins.
Phase: 1 (read-only — Patient, Encounter, Coverage, Condition, Practitioner). Phase 2 (write-back, CDS Hooks) requires its own activation pass.

---

## Sandbox proof (Curavend side, before any customer call)

1. Log into `https://fhir.epic.com/Developer/Apps` as Curavend's developer account.
2. Create a new app: `Curavend (Sandbox)`, audience = **Clinicians or Administrative Users**, SMART on FHIR v2 = **R4**.
3. Incoming APIs: enable `Patient.Read/Search`, `Encounter.Read/Search`, `Coverage.Read/Search`, `Condition.Read/Search`, `Practitioner.Read/Search`, `PractitionerRole.Read/Search`, `Location.Read`, `Organization.Read`, `AllergyIntolerance.Read/Search`, `MedicationRequest.Read/Search`, `ServiceRequest.Read/Search`, `DeviceRequest.Read/Search`, `DocumentReference.Read`.
4. **Redirect URI** (exact): `https://curavend-api.metabilityllc1.workers.dev/api/fhir/redirect`
5. **Launch URI**: `https://curavend-api.metabilityllc1.workers.dev/api/fhir/launch`
6. Persistent refresh tokens: **Yes**.
7. Save → copy the **Non-Production Client ID**.

On the Curavend side:
1. Sign in as ADMIN, open **Admin → EHR Connections**.
2. Click **New Connection**, fill in:
   - Name: `Epic Sandbox`
   - Vendor: `EPIC`
   - Auth mode: `OAUTH2_USER_DELEGATED`
   - FHIR base URL: `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/`
   - Client ID: the sandbox client ID from above
   - Hospital: any test hospital
3. After save, the row shows a **Connect to Epic** button. Click it → Epic auth screen → log in with a sandbox test clinician → land back on Curavend with a green **Connected to Epic** badge.
4. Test the end-to-end: from the Orders page → click **Create Supply Order** with `?fhirContext=1` appended (or trigger via the bounce page) → wizard should pre-fill with the sandbox patient (Camila Lopez).

If any step fails, click the **SMART config** button on the connection — confirms the OAuth endpoints Epic discovery returned.

---

## Customer activation workflow (per hospital)

### Phase A — Showroom listing (Curavend owns this, ~2 weeks)

1. From `https://vendorservices.epic.com/Showroom`, create or update Curavend's listing.
2. Submit ONC 45 CFR 170.407 metadata: app name, developer, intended users, purpose, BAA contact.
3. Provide a scope justification matrix — see `docs/EPIC_PHASE_1_2_PLAN.md` §2.O for the template. For Phase 1, request only **read** scopes; Phase 2 expands to write.
4. Reference the sandbox app's Non-Production Client ID for evaluator access.

### Phase B — Customer Connection Request (customer-side, 2–8 weeks)

The hospital's Epic admin (Vendor Services or Interconnect team) submits a Customer Connection Request inside their tenant for the Curavend production listing. They need from Curavend:

- App name + version
- Production client ID (issued at fhir.epic.com after Showroom listing approval)
- Exact redirect URI: `https://curavend-api.metabilityllc1.workers.dev/api/fhir/redirect`
- Launch URI: `https://curavend-api.metabilityllc1.workers.dev/api/fhir/launch`
- Per-scope justification matrix (Phase A output)

The customer's Epic admin then:

1. Approves Curavend in ConnectionHub.
2. Whitelists the redirect URI in their Interconnect environment (Hyperspace IT activity).
3. Enables the requested scopes on their tenant (may trim Curavend's request).
4. Returns to Curavend:
   - **Their FHIR base URL** (looks like `https://epic.theirhospital.org/Interconnect-FHIR-Prd/api/FHIR/R4/`)
   - The **production client ID** assigned to Curavend on their tenant
   - Their tenant's **MRN system OID** (used for MRN-based patient lookup; format: `urn:oid:1.2.840.114350.1.13.X.Y.Z`)
   - The **client secret** if Epic provisioned a confidential client (delivered via secure channel — Curavend Worker secret, never paste into chat)
   - Optional: a **deep-link template** for the **View in Epic** button (e.g. `https://epic.theirhospital.org/EpicWeb/Chart?fhirPatientId={patientId}`)

### Phase C — Curavend tenant setup (Curavend implementation engineer, 1 day)

1. In Curavend admin → **EHR Connections**, create a new row:
   - Name: `<Customer Name> — Epic Production`
   - Vendor: `EPIC`
   - Auth mode: `OAUTH2_USER_DELEGATED`
   - FHIR base URL: (from customer)
   - Client ID: (production client ID for this tenant)
   - Hospital: the customer's hospital
   - Mapping profile (JSON):
     ```json
     {
       "mrnSystem": "urn:oid:1.2.840.114350.1.13.X.Y.Z",
       "deepLinkTemplate": "https://epic.theirhospital.org/EpicWeb/Chart?fhirPatientId={patientId}",
       "requestedScopes": ["launch", "openid", "fhirUser", "offline_access", "user/Patient.read", "..."]
     }
     ```
2. If the customer provisioned a client secret, set it as a Worker secret:
   ```
   wrangler secret put EHR_CONN_<connectionIdShort>_CLIENT_SECRET
   ```
   Then patch the row to set `authSecretEnvRef = 'EHR_CONN_<connectionIdShort>_CLIENT_SECRET'`.
3. Click **SMART config** to verify discovery returns the customer's actual authorize/token endpoints (not the sandbox fallback).
4. Click **Connect to Epic** to do the first OAuth round trip yourself as a designated test clinician at the customer.

### Phase D — Joint go-live test (Curavend + customer, 1 week)

1. Three clinicians at the customer EHR-launch Curavend from a chart → confirm wizard pre-fills.
2. Validate Patient demographics match Epic chart.
3. Confirm at least one active Coverage was retrieved (drives PA flow).
4. Confirm at least one active Condition (ICD-10) was retrieved (drives medical-necessity).
5. Run a real order end-to-end. Verify it appears in Curavend orders list with `epicConnectionId` and `fhirPatientId` populated.
6. Click **View in Epic** from the order detail → confirm Epic chart opens correctly.

Pass criteria: zero auth failures, zero `EPIC_NOT_CONNECTED` errors after launch, sub-3s wizard prefill latency p95.

---

## Common gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| `EPIC_NOT_CONNECTED` after click-through | Refresh token disabled by customer; user must re-launch every ~60 min | Customer's Epic admin must enable `offline_access` on the app registration |
| 404 on `/api/fhir/launch?iss=...` | The `iss` Epic sent doesn't match any active `ehrConnections.fhir_base_url` | Verify the customer's FHIR base URL exactly matches; mind trailing slashes |
| Wizard pre-fill returns blank patient | MRN OID mismatch — the patient lookup found nothing | Verify `mappingProfile.mrnSystem` exactly matches the OID used in that Epic tenant for MRNs |
| `Cannot set headers after they are sent` in token exchange | Stale browser session — PKCE verifier was popped already | User must restart the launch; verifier is one-shot |
| `View in Epic` button missing | No `deepLinkTemplate` configured | Add `mappingProfile.deepLinkTemplate` with `{patientId}` and/or `{encounterId}` placeholders |
| Customer rejects a scope at security review | Common for `user/MedicationRequest.read` (PHI-heavy) | Drop the scope from `mappingProfile.requestedScopes` and re-launch; downgrade affected features gracefully |

---

## Architectural facts a customer's Epic team will ask

- **Where do tokens live?** Cloudflare KV, keyed by `(connectionId, userId)`. Refresh tokens persist for the configured refresh-token TTL.
- **Where does Curavend host its JWKS?** `https://curavend-api.metabilityllc1.workers.dev/.well-known/jwks.json` (active in Phase 2 only; Phase 1 uses user-delegated OAuth and does not need JWKS).
- **What's the auth flow?** SMART on FHIR v2 PKCE for both Standalone and EHR Launch. Client secret optional (we support both public and confidential clients).
- **What audit data does Curavend persist?** Every Patient/Encounter/Coverage/Condition read is logged with `ehr_ingest_log.connection_id`. The Worker logs each OAuth exchange to Sentry with the user, connection, and scope set.
- **PHI handling**: tokens go in KV (auto-encrypted by Cloudflare KMS at rest); orders carry only Patient/Encounter FHIR IDs (no full Patient resource is persisted in D1).
- **Tenant isolation**: every FHIR read goes through `loadConnection()` which enforces `hospitalId` scoping; cross-tenant reads are not possible from the application layer.

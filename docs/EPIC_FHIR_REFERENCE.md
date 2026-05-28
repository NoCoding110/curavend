# Epic FHIR Integration Reference (Curavend Planning)

Last verified: May 2026. Endpoints and behaviors are tenant-specific — always discover, never hardcode.

---

## 1. App Registration (fhir.epic.com)

Register apps at `fhir.epic.com/Developer/Apps`. Each registration mints **two client IDs**: non-production (sandbox) and production. They are not interchangeable.

**App categories** (chosen at registration; cannot be changed later):
- **Patients (Patient-facing)** — MyChart-style standalone, public client + PKCE
- **Clinicians or Administrative Users (Clinician-facing)** — EHR launch or standalone, confidential client
- **Backend Systems (no user context)** — JWT/private-key client_credentials flow

**Registration fields required**: app name, description, redirect URI(s) (exact match — no wildcards), launch URI (for EHR launch), client type (public vs confidential), FHIR version (R4 strongly recommended; DSTU2/STU3 legacy only), and the **pre-approved scope list**. Scopes cannot be expanded at runtime — you must re-register or amend.

**Sandbox vs Production**:
- *Sandbox*: shared synthetic data at `fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/`. Test patients (Camila Lopez, Derrick Lin, etc.) are documented under the "Sandbox Test Data" page. No PHI permitted.
- *Production*: a real customer's Interconnect tenant. The same registration on fhir.epic.com surfaces a **production client ID** that the customer must then *activate* against their instance.

**Customer activation workflow ("ConnectionHub" / Showroom / Vendor Services)**:
1. Developer registers app on fhir.epic.com and gets it working in sandbox.
2. Developer lists the app on **Showroom** (`vendorservices.epic.com/Showroom`, formerly App Orchard / Connection Hub) once at least one live customer is committed.
3. The customer's Epic administrator opens a **Customer Connection Request**: they enable the developer's production client ID on *their* Interconnect tenant, approve (or trim) requested scopes, configure launch contexts, and add the redirect URIs to their allow-list.
4. Joint go-live: endpoint whitelist + clinical workflow validation.
5. Typical 3–12 months per customer. **There is no "deploy once, works everywhere" path.** Each hospital is a separate activation.

Epic also collects 45 CFR 170.407 metadata (app name, developer, purpose, intended users) for ONC certification reporting.

---

## 2. Authentication Flows

All Epic OAuth flows discover endpoints via `{iss}/.well-known/smart-configuration` (Epic Aug-2021 or later). Tokens are short-lived (~60 min); refresh-token lifetime is configurable by customer at "download time."

### 2a. EHR Launch (clinician in Epic launches Curavend)
- Epic hits your registered launch URI with `?iss={fhirBase}&launch={opaqueToken}`.
- App fetches `/.well-known/smart-configuration` → gets `authorization_endpoint`, `token_endpoint`.
- App redirects to `authorization_endpoint` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `aud={iss}`, `launch={launch}`, `code_challenge`, `code_challenge_method=S256` (PKCE required).
- After auth, exchange code at token endpoint. Token response includes context claims: `patient`, `encounter`, `fhirUser` (Practitioner reference), `need_patient_banner`, `smart_style_url`.
- **Trust these context claims** — do not re-query to "verify" the patient.

### 2b. Standalone Launch (user comes to Curavend first, signs in via Epic)
- Same as above minus the `launch` param. User picks/authorizes patient inside Epic's auth screen.
- Patient apps use public client + PKCE; clinician apps typically confidential client.
- Refresh tokens issued only when `offline_access` scope is requested and approved.

### 2c. Backend Services (cron/headless, no user)
- Pre-register a **public key** (or JWKS URL) on fhir.epic.com for the production client ID. Key length >= 2048 bits, alg RS384 or ES384.
- At runtime: build a signed JWT with claims `iss=client_id`, `sub=client_id`, `aud={token_endpoint}`, `jti`, `exp` (<=5 min).
- POST to token endpoint:
  ```
  grant_type=client_credentials
  client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
  client_assertion={signed JWT}
  scope=system/Patient.read system/Observation.read ...
  ```
- Response: bearer access token (~5 min). Re-mint per call window. No refresh tokens for backend.

### Scope Syntax (SMART v2 — Epic accepts both v1 and v2)
- `patient/{Resource}.{c|r|u|d|s}` — limited to launch-context patient
- `user/{Resource}.{c|r|u|d|s}` — what the launching user can see
- `system/{Resource}.{c|r|u|d|s}` — backend, no user filter
- Examples: `patient/*.read`, `user/Practitioner.read`, `system/Encounter.read`, `system/DocumentReference.write`
- Granular v2 codes: `c`=create, `r`=read, `u`=update, `d`=delete, `s`=search. v1 still works: `.read`, `.write`, `.*`.

### Tenant-specific issuers
- Sandbox: `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/`
- Production: each customer has a unique base, e.g. `https://epic.somehospital.org/Interconnect-FHIR-Prd/api/FHIR/R4/`. Never assume a host pattern.

---

## 3. FHIR Resources Relevant to Curavend (DME / Lab / Supply Chain)

Epic R4. WRITE = supported via FHIR Create/Update (often gated by customer activation + Epic security review). USCDI v3 marked where US Core profile applies.

| Resource | Read | Write | Typical Scope | USCDI v3 | Notes |
|---|---|---|---|---|---|
| Patient | Yes | Limited (demographics) | `patient/Patient.read`, `system/Patient.read` | Yes | MRN search via `identifier`. |
| Encounter | Yes | No (read-only in Epic) | `user/Encounter.read`, `system/Encounter.read` | Yes | Source for `encounter.class`, location, period. |
| Practitioner | Yes | No | `user/Practitioner.read` | Yes | Use `fhirUser` claim as authoritative identity. |
| PractitionerRole | Yes | No | `user/PractitionerRole.read` | Yes | For NPI + dept lookup. |
| Location | Yes | No | `user/Location.read` | Yes | Maps to Epic departments. |
| Organization | Yes | No | `user/Organization.read` | Yes | Tenant root + payer orgs. |
| Condition | Yes | Limited (Problem List add) | `patient/Condition.read` | Yes | Diagnoses for medical-necessity logic. |
| AllergyIntolerance | Yes | Yes (Create) | `patient/AllergyIntolerance.read`, `.write` | Yes | Write requires customer approval. |
| MedicationRequest | Yes | **No** standard write | `patient/MedicationRequest.read` | Yes | Inpatient/outpatient orders — read-only via FHIR. New meds use Epic's order-entry, not FHIR Create. |
| **ServiceRequest** | Yes | **Yes** (Lab/Imaging) | `user/ServiceRequest.read`, `system/ServiceRequest.write` | Yes (US Core ServiceRequest) | Lab/imaging order create supported; tenant must enable. Reference `ServiceRequest.Create` API spec on fhir.epic.com. |
| **DeviceRequest** | Yes | **Limited / partner** | `user/DeviceRequest.read` | Partial | DME orders — read works; Create is not broadly available, often requires a custom Epic build or HL7v2 ORM instead. **Flag for planning.** |
| Coverage | Yes | No | `patient/Coverage.read`, `user/Coverage.read` | Yes | Payor + plan ID; for eligibility flows. |
| Procedure | Yes | Yes (charge capture) | `patient/Procedure.read`, `system/Procedure.write` | Yes | CPT/HCPCS write-back path; customer-gated. |
| **DocumentReference** | Yes | **Yes (PDF push)** | `patient/DocumentReference.read`, `system/DocumentReference.write` | Yes | Primary path for pushing DWO PDFs back to chart. Use `DocumentReference.Create` with embedded Base64 PDF in `content.attachment.data` (or Binary reference). Customer must whitelist doc type/category. |
| Observation | Yes | Yes (vitals, labs) | `patient/Observation.read`, `system/Observation.write` | Yes | `Observation.Create` documented for vitals; lab results typically read-only from external apps. |
| DiagnosticReport | Yes | No (typically) | `patient/DiagnosticReport.read` | Yes | Lab/radiology results. |
| Questionnaire / QuestionnaireResponse | Yes | Yes (Bundle) | `patient/QuestionnaireResponse.write` | No | Useful for capturing custom intake; can be bundled with DocumentReference. |

**Rule of thumb**: assume *read* is available, assume *write* requires per-customer enablement and may take weeks. Treat DeviceRequest write as "probably not via FHIR — plan for HL7v2 ORM or Epic-side build."

---

## 4. CDS Hooks Support in Epic

Epic supports CDS Hooks natively. **Hooks Epic invokes**:
- `patient-view` — clinician opens chart
- `order-select` — order picked but not signed (fires per order in basket)
- `order-sign` — clinician about to sign one or more orders (best place to inject medical-necessity / prior-auth / formulary alerts)
- `appointment-book` — scheduling future encounters

Not all Epic versions support all hooks; `order-dispatch` and `encounter-discharge` are **not** generally supported in Epic native.

**Request payload (from Epic to your CDS service)**:
```json
{
  "hook": "order-sign",
  "hookInstance": "uuid",
  "fhirServer": "https://epic.customer.org/.../FHIR/R4",
  "fhirAuthorization": { "access_token": "...", "scope": "system/*.read", "expires_in": 300 },
  "context": {
    "userId": "Practitioner/123",
    "patientId": "abc",
    "encounterId": "enc-1",
    "draftOrders": { "resourceType": "Bundle", "entry": [ /* ServiceRequest/DeviceRequest/MedicationRequest */ ] }
  }
}
```

**Response (cards Curavend returns)**:
- **Information card**: summary + detail markdown + indicator (`info` | `warning` | `critical`).
- **Suggestion card**: proposes resource changes (e.g., swap to a covered substitute) that the clinician can one-click accept; Epic applies the FHIR change.
- **App link card** (`links[].type: "smart"`): deep-launches Curavend back into Epic chart context with the current launch token — primary mechanism to send a clinician from an alert into the Curavend UI without losing patient context.

Register the CDS service at `{base}/cds-services` discovery endpoint. Epic customer admins enable each service per workflow.

---

## 5. Bulk FHIR Export (`$export`)

Supported. Epic implements the HL7 Bulk Data Access IG (Flat FHIR / NDJSON).

- Endpoints: `Group/{id}/$export` (population), `Patient/$export` (all patients the client can see), `$export` at system root.
- Auth: **Backend Services JWT only** with `system/*.read` scopes.
- Async pattern: kickoff returns `202` + `Content-Location` polling URL; poll until 200 returns manifest of NDJSON file URLs.
- **Throttling reality**:
  - Epic explicitly discourages exports of >1,000 patients as a regular pattern.
  - Customer-specific rate limits; budget for exponential backoff.
  - Initial exports can take hours; schedule overnight.
  - File URLs are short-lived; download immediately.
- Useful for cohort analytics, not for real-time per-patient lookups (use direct FHIR read for that).

---

## 6. Per-Tenant Configuration

For each Curavend hospital customer, collect and store:

| Config | Example | Source |
|---|---|---|
| FHIR base URL (R4) | `https://epic.cust.org/Interconnect-FHIR-Prd/api/FHIR/R4/` | Customer's Epic admin / Interconnect team |
| OAuth issuer (`iss`) | same as FHIR base (Epic conflates) | discovery |
| SMART config URL | `{iss}/.well-known/smart-configuration` | discovery |
| `authorization_endpoint` | from smart-configuration | discovery |
| `token_endpoint` | from smart-configuration | discovery |
| Production client ID | per-tenant assignment | Showroom activation |
| Approved scope set | what customer actually enabled | Showroom activation |
| JWKS URL (backend) | Curavend-hosted, we publish; customer registers it once | Curavend infra |
| Customer tenant identifier | OID for MRN system (e.g., `urn:oid:1.2.840.114350.1.13.X.Y.Z`) | Customer |
| Redirect URI(s) | exact match registered on both sides | Curavend + customer |
| Refresh-token TTL | configurable per app | Epic customer admin |
| OID system values | MRN, FIN, dept, flowsheet row IDs | Customer (every tenant differs) |

**Architecture implication**: build a tenant directory ("connection registry") keyed by customer; never hardcode any of the above. Adding a hospital = config row + secret, never a redeploy.

---

## 7. Documentation Bookmarks

1. `https://fhir.epic.com/` — root portal (login + app management)
2. `https://fhir.epic.com/Documentation?docId=oauth2` — OAuth 2.0 / SMART spec for Epic (includes Backend OAuth 2.0 Guide subsection)
3. `https://fhir.epic.com/Documentation?docId=epiconfhir` — Epic-on-FHIR overview, extensions, OID patterns
4. `https://fhir.epic.com/Specifications` — per-resource API specs (search by resource: Patient, ServiceRequest, DocumentReference, Observation, etc.)
5. `https://fhir.epic.com/Sandbox` — sandbox endpoints + test patient list
6. `https://fhir.epic.com/Developer/Apps` — your app registry (production + non-production client IDs, JWKS upload)
7. `https://vendorservices.epic.com/Showroom` — customer-facing listing + ConnectionHub workflow
8. `https://open.epic.com/` — non-FHIR/legacy interfaces (HL7v2, web services) — useful when FHIR write isn't supported
9. `https://www.hl7.org/fhir/smart-app-launch/` — upstream SMART spec (canonical scope syntax, launch flow)
10. `https://cds-hooks.org/` — upstream CDS Hooks spec (hook definitions, card schema)

---

## Plan-Affecting Flags (call-outs)

- **DeviceRequest.Create is not reliably supported via FHIR**. DME order push-back likely needs HL7v2 ORM or per-customer Epic build. Do not assume Curavend can write DME orders into Epic over FHIR.
- **MedicationRequest is read-only** from external apps for new orders; rely on Epic's order-entry UI + CDS Hooks suggestion cards to nudge prescribing.
- **Every customer = separate activation** (3–12 months). Cannot pre-bundle "Epic integration" as a SKU; sell as a services engagement.
- **Scopes are frozen at registration** per tenant. Adding a scope later = customer re-approval. Be generous up-front but realistic — overly broad scopes get cut by security review.
- **No PHI in sandbox.** Demo flows must use Epic's test patients.
- **Bulk export >1,000 patients is discouraged** — design Curavend analytics around delta queries + per-patient reads where possible.

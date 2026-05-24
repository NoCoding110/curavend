# Workflow 13 — Configure an EHR Feed

## At a glance

| | |
|---|---|
| **What** | Wire an external EHR (Epic, Cerner, Athena, Meditech, eCW, Allscripts) to push orders into Curavend via FHIR webhook. |
| **Persona** | Platform admin or hospital admin with admin rights. |
| **Prerequisites** | EHR vendor's FHIR base URL, auth credentials (OAuth2 client_id/secret, Basic creds, Bearer token, or webhook signing secret) loaded as Worker env vars. |
| **Estimated time** | 30-60 minutes including round-trip validation with the EHR team. |

---

## Steps

### A — Stash credentials as Worker secrets first

1. The connection record stores credentials **by env-var name reference** (e.g. `"EPIC_BGH_CLIENT_SECRET"`), not literal values. Set the secret on the Worker first.
2. From a terminal:
   ```bash
   cd packages/api
   wrangler secret put EPIC_BGH_CLIENT_SECRET --env production
   ```
3. Paste the value when prompted. Repeat for every secret this connection needs.

### B — Open the EHR connections admin page

4. Sign in as admin and go to **`/admin/ehr-connections`**.
5. The page shows a 2-pane layout: **Connections sidebar** on the left, **Detail pane** on the right.
6. Click **New connection** (top of the sidebar).

   ![Step 6](../images/wf-ehr-step-6.png)

### C — Fill the connection form

7. The create drawer asks for:
   - **Name** — short label (e.g. _"Boston General — Epic Prod"_).
   - **Vendor** — picker: `EPIC`, `CERNER`, `ATHENA`, `MEDITECH`, `ECW`, `ALLSCRIPTS`, `GENERIC_FHIR_R4`. Choosing a vendor pre-loads its `DEFAULT_MAPPINGS` profile from `services/ehrAdapter.ts`.
   - **Hospital** — the target tenant.
   - **FHIR base URL** — full URL to the EHR's FHIR R4 endpoint (e.g. `https://fhir.epic.com/api/FHIR/R4/`).
   - **Auth mode** — `OAUTH2`, `BASIC`, `BEARER`, `WEBHOOK_ONLY`.
   - **Auth secret refs** — depending on auth mode:
     - `OAUTH2` → `clientIdRef`, `clientSecretRef`, `tokenUrl`, optional `scope`.
     - `BASIC` → `usernameRef`, `passwordRef`.
     - `BEARER` → `tokenRef`.
     - `WEBHOOK_ONLY` → `webhookSecretRef` (HMAC signing key).
   - **Mapping profile** — JSON; defaults to the vendor preset. Override fields like `subject.display`, `code.coding[0].code` if your EHR's payload deviates from the standard.

   ![Step 7](../images/wf-ehr-step-7.png)

8. Click **Save**. The connection appears in the sidebar with status `INACTIVE`.

### D — Copy the webhook URL

9. With the connection selected, the right pane shows two tabs: **Webhook URL** and **Recent Ingests**.
10. The **Webhook URL** tab shows:
    - The full POST URL (e.g. `https://curavend-api.metabilityllc1.workers.dev/api/ehr/{connectionId}/ingest`).
    - The required HTTP method (`POST`).
    - The required signature header (`X-Curavend-Signature: sha256=<hmac>`), with constant-time verification on the Worker.
    - Sample curl using the configured signing secret.

    ![Step 10](../images/wf-ehr-step-10.png)

11. Hit **Copy** next to the URL. Send to the EHR integration team along with the signing secret (out-of-band — Slack/email, not committed).

### E — Activate

12. Click **Activate** in the connection header. Status flips `INACTIVE → ACTIVE`. Inbound webhooks are now accepted.

### F — Validate with a test ingest

13. Have the EHR team fire a test FHIR resource (a Bundle or single ServiceRequest). They should receive HTTP 200 with `{status: 'PROCESSED', orderId: '...'}`.
14. Switch to the **Recent Ingests** tab — the latest 50 inbound requests appear with status tags:
    - `PROCESSED` — green; an order was created.
    - `FAILED` — red; signature bad or mapping error.
    - `SKIPPED` — gray; e.g. duplicate idempotency key.
15. Click any row → see the raw inbound payload, the resolved fields, and the resulting order ID (if any).

### G — Monitor

16. Bookmark **`/admin/ehr-connections`** and check Recent Ingests after every business day for the first week.
17. The connection card shows `lastSuccessAt` + `lastErrorAt`. If `lastErrorAt > lastSuccessAt`, something's wrong — open the row and read the error.

---

## What happens behind the scenes

- Connections live in `ehr_connections`; every inbound request logged to `ehr_ingest_log`. Migration `0010_ehr_connections.sql`.
- The webhook route `POST /api/ehr/:connectionId/ingest` is added to the `PUBLIC_PATTERNS` regex in `middleware/auth.ts` so it bypasses JWT — but enforces per-connection HMAC via `verifyWebhookSignature()` (constant-time SHA-256).
- On a successful request, `services/ehrAdapter.ts applyMappingProfile()` walks the JSON-path map over the FHIR resource, produces a canonical Curavend order, and inserts a `PENDING` row in `orders`. The connection's `lastSuccessAt` is stamped.
- On failure (bad signature, missing required field, mapping error) the row in `ehr_ingest_log` is `FAILED` / `SKIPPED` with the error message.
- Secrets are resolved at request time via `(env as any)[ref]` — never stored in the DB.

---

## Verification

1. Recent Ingests tab shows your test payload with status `PROCESSED`.
2. **`/supply-orders`** lists the resulting order with status `PENDING` and source tag `EHR:{vendor}`.
3. `lastSuccessAt` on the connection row updates to within a minute of the test.
4. `GET /api/admin/integration-log?integrationType=EHR` shows the inbound row with the right HMAC verification status.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| EHR team gets `401 Invalid signature` | They're signing with the wrong secret, or you typo'd the env var name | Have them re-verify the secret; check the connection's `webhookSecretRef` and that `wrangler secret list` shows that name. |
| `400 Mapping error: required field "subject.display" not found` | The vendor's payload puts patient name somewhere else | Edit the connection's **Mapping profile** JSON, update `subject.display` to the right JSON path, save. |
| Order created but with empty patient name | Patient field maps to a path that's `null` on this payload | Same as above — patch the mapping. |
| Test ingest never fires from EHR side | They haven't enabled outbound webhooks yet, or their URL allow-list excludes Workers | Have them whitelist `*.workers.dev`. |
| `lastSuccessAt` never updates despite Recent Ingests showing `PROCESSED` | Cached page | Hard refresh. |
| OAuth2 token refresh fails | `tokenUrl` wrong or `scope` missing | Inspect Worker logs; fix the connection's auth fields. |

---

## Related

- Feature reference: [`features/16-ehr-connections.md`](../features/16-ehr-connections.md)
- Adjacent workflows: [`12-onboard-a-hospital.md`](./12-onboard-a-hospital.md), [`01-onboard-a-vendor.md`](./01-onboard-a-vendor.md)

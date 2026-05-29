# Clinical, DME & Lab — Workflow Reference

This document catalogs every workflow in the Clinical, DME (Durable Medical Equipment), and Lab domain of the Curavend healthcare supply-chain platform (Cloudflare Workers + Hono + Drizzle/D1). It covers the claim-readiness machinery for DME orders (document packets, DWO PDF generation, Medicare-compliant claim bundles, capped-rental billing), Medicare coverage tooling (LCD/NCD criteria evaluation, CMS PA-required HCPC lookup, CMS MCD scraping), DMEPOS supplier compliance tracking, the prior-authorization lifecycle state machine, clinical note templates, the referring-provider persona, and the full lab portal (lab orders + asset generation, FEFO consumable inventory with lots/movements/expiration, auto-consume on order create, auto-replenishment, and stock-movement audit search).

All routes below mount under `/api/*` and sit behind `authMiddleware()` (`packages/api/src/index.ts:210`), so every endpoint requires a valid authenticated user. Mount prefixes are confirmed at `packages/api/src/index.ts:240–298`. Role gates use the `rbac(...)` middleware or inline `user.role` / `user.userType` checks as noted per-workflow.

**Persona / role notation used below**
- **Admin (platform)** = `userType === 'ADMIN'` OR `role` in `ACCOUNT_MANAGER` / `ACCOUNT_MANAGER_USER`.
- **Facility / hospital personas** = `FACILITY_ACCOUNT_MANAGER`, `FACILITY_USER`, `ACCOUNT_MANAGER`, `ACCOUNT_MANAGER_USER`, `PHYSICIAN`, `VENDOR_ACCOUNT_MANAGER`, `PROVIDER_EXECUTIVE_ADMIN` (the `MANAGER_OR_USER` list in `priorAuths.ts:35–43`).
- **Lab personas** = `userType === 'LAB'` (labs portal) and/or `role` in `LAB_ACCOUNT_MANAGER` / `LAB_ACCOUNT_MANAGER_USER` (lab inventory).
- **Provider persona** = `userType === 'PROVIDER'` with `providerId`.

---

## Workflow index

| ID | Name |
|----|------|
| W5-01 | Create DME order extension (intake wizard finalize) |
| W5-02 | Auto-spawn rental periods after DME order |
| W5-03 | Monthly/daily rental billing cron (Medicare capped) |
| W5-04 | Manage / re-initialize rental period schedule |
| W5-05 | Assemble DME document packet (materialize requirements) |
| W5-06 | DME document upload / receive / reject / ad-hoc |
| W5-07 | DME document-requirement catalog admin |
| W5-08 | In-app DWO e-signature |
| W5-09 | Generate DWO PDF (single document) |
| W5-10 | Generate claim-ready bundle (DWO + docs + PA letter + POD → PDF) |
| W5-11 | LCD/NCD coverage check + auto-evaluation |
| W5-12 | LCD coverage check history + required-findings lookup |
| W5-13 | LCD/NCD ingest (JSON + CSV admin) |
| W5-14 | CMS Medicare Coverage Database scrape (admin ingest) |
| W5-15 | CMS PA-required HCPC list lookup + admin maintenance |
| W5-16 | Prior authorization lifecycle (state machine) |
| W5-17 | DMEPOS supplier compliance management |
| W5-18 | DMEPOS compliance expiry notifier cron |
| W5-19 | Clinical note templates |
| W5-20 | Referring-provider persona management + onboarding |
| W5-21 | Create lab order + TRF/kit asset generation |
| W5-22 | Lab order ingest (idempotent) + replay |
| W5-23 | Lab order approve / reject / QC-failure |
| W5-24 | Lab order PDF asset download + tracking export |
| W5-25 | Lab auto-consume inventory on order create (shortage warnings) |
| W5-26 | Lab inventory: consumables, lots, receiving, issuance, transfer |
| W5-27 | Lab inventory: expiration sweep cron |
| W5-28 | Lab auto-replenishment cron + demand forecast |
| W5-29 | Test → consumable mapping |
| W5-30 | Stock-movement audit search |
| W5-31 | Historical consumption backfill (admin) |
| W5-32 | Kit-letter catalog sync cron |

(32 workflows. The brief estimated 18–26; the extra count comes from splitting lab-order lifecycle sub-flows, lab ingest/replay, and the kit-letter cron into their own entries.)

---

## Prior-auth state machine (detail)

Statuses (`PRIOR_AUTH_STATUSES`, `packages/db/src/schema/priorAuths.ts:19–27`), exact order:
```
NEEDED, SUBMITTED, PENDING, APPROVED, DENIED, EXPIRED, CANCELLED
```

Allowed transitions (`packages/api/src/routes/priorAuths.ts:48–56`):
```
NEEDED    → SUBMITTED, CANCELLED
SUBMITTED → PENDING, APPROVED, DENIED, CANCELLED
PENDING   → APPROVED, DENIED, CANCELLED
APPROVED  → EXPIRED, CANCELLED
DENIED    → SUBMITTED            (resubmission)
EXPIRED   → SUBMITTED            (renewal)
CANCELLED → (terminal, none)
```
Transition side effects (`priorAuths.ts:283–289`): `SUBMITTED` stamps `submittedAt` (first time only); `APPROVED`/`DENIED` stamp `decisionAt`; `authNumber`, `quantityApproved`, `effectiveStartDate`, `effectiveEndDate` may be set during the transition. Every transition appends a `prior_auth_history` row (`fromStatus`, `toStatus`, `reason`, `changedBy`). Disallowed transitions throw `ForbiddenError` "Cannot transition from X to Y".

---

## DME claim-bundle assembly flow (detail)

Endpoint: `GET /api/dme-bundle/:orderId/claim-bundle.pdf` (`packages/api/src/routes/dmeBundle.ts:166–267`). Renders/merges, **in this exact order**, into a single submit-ready PDF via `pdfService.mergePdfs`:

1. **DWO** — `renderDwoHtml(...)` → Cloudflare Browser Rendering (`renderHtmlToPdf`, Letter format). Data assembled by `loadDwoData` from `orders` + `orderItems` + `dmeOrderExtensions` + `payors` + `hospitals` (`dmeBundle.ts:80–118`).
2. **Every RECEIVED `dme_order_documents`** — filtered `status = 'RECEIVED'` (`dmeBundle.ts:206–217`). PDFs pass through; PNG/JPG (e.g. wound photos) converted via `imageToPdf` in `bytesToPdf` (`dmeBundle.ts:36–53`); unsupported MIME skipped.
3. **PA approval letters** — from `prior_auths` rows with `status = 'APPROVED'` and `orderId` match, reading each row's `documentBlobKeys` JSON array from R2 (`dmeBundle.ts:219–240`).
4. **Delivery POD** — `orderShipments.podAttachment`; external `http(s)` URLs are skipped (can't merge), otherwise treated as an R2 blob key and converted to PDF (`dmeBundle.ts:242–257`).

If no PDFs are available, returns `404 {error:'No PDFs available to bundle'}`. Tenant guard: non-admin caller must own the order's hospital (`ConflictError` otherwise, `dmeBundle.ts:172–174`).

---

### W5-01: Create DME order extension (intake wizard finalize)
- **Actors:** Facility personas, Admin (tenant-guarded by order's hospital).
- **Trigger:** Wizard "finalize" step persists DME sidecar data for an order.
- **Entry points:** `packages/web/src/features/supplyOrderDetail/pages/CreateDmeOrder.tsx` · `POST /api/dme-documents/extension/:orderId`; read via `GET /api/dme-documents/extension/:orderId`.
- **Permissions / tenant scope:** Inline `isAdmin` else caller's `hospitalId` must match `orders.hospitalId` (`dmeDocuments.ts:279–281`).
- **Steps:**
  1. Upsert `dme_order_extensions` row (insert-then-update-on-conflict) with `lengthOfNeedMonths`, `careSetting`, `patientHeightIn`, `patientWeightLb`, `mobilityStatus`, `rentalType`, `estimatedStartDate`, `faceToFaceDate`, `cmsPaRequired` (0/1), `clinicalIndication` (`dmeDocuments.ts:285–318`).
  2. If `rentalType` is a rental (not `PURCHASE` / `NOT_APPLICABLE`), call `initializeRentalPeriods` (→ W5-02) with `monthlyRateUsd ?? 0`; errors are logged, not fatal (`dmeDocuments.ts:323–330`).
  3. Return `{orderId, ok:true, rentalPeriodsCreated}`.
- **State machine:** n/a (the order itself lives in the Orders domain).
- **Side effects:** Rental period rows spawned (W5-02). `rentalType` valid set = `RENTAL_TYPES` (`dmeDocuments.ts:209–216`): `PURCHASE`, `CAPPED_RENTAL`, `INEXPENSIVE_ROUTINELY`, `OXYGEN_RENTAL`, `PARENTERAL_ENTERAL`, `NOT_APPLICABLE`.
- **Related services/crons:** `cron/dmeRentalBilling.ts` (`initializeRentalPeriods`).
- **Source:** `packages/api/src/routes/dmeDocuments.ts:271–344`.

### W5-02: Auto-spawn rental periods after DME order
- **Actors:** System (invoked from W5-01 or W5-04).
- **Trigger:** DME extension upsert with a rental `rentalType`, or explicit re-init.
- **Entry points:** `initializeRentalPeriods(env, orderId, monthlyRateUsd)` · also `POST /api/dme-rental-periods/order/:orderId/initialize`.
- **Permissions / tenant scope:** Inherited from caller (W5-01 tenant guard; W5-04 init endpoint has no explicit guard beyond auth).
- **Steps:**
  1. Load `dme_order_extensions`; bail (`created:0`) if missing or `rentalType` is `PURCHASE`/`NOT_APPLICABLE`.
  2. `cap = RENTAL_CAPS[rentalType]` — `CAPPED_RENTAL:13`, `OXYGEN_RENTAL:36`, `INEXPENSIVE_ROUTINELY:1`, `PARENTERAL_ENTERAL:99`, `PURCHASE:1`, `NOT_APPLICABLE:0` (`dmeRentalBilling.ts:28–35`).
  3. `periodCount = min(cap, lengthOfNeedMonths ?? cap)`.
  4. **Idempotent:** delete existing `status='SCHEDULED'` periods for the order, then insert N periods of 30 days each from `estimatedStartDate` (or today).
- **State machine:** Each period starts `SCHEDULED`.
- **Side effects:** `dme_rental_periods` rows created.
- **Related services/crons:** `cron/dmeRentalBilling.ts`.
- **Source:** `packages/api/src/cron/dmeRentalBilling.ts:153–199`.

### W5-03: Daily rental billing cron (Medicare capped)
- **Actors:** System (daily cron `0 8 * * *`).
- **Trigger:** Scheduled; `handleRentalBilling(env)`.
- **Entry points:** `packages/api/src/cron/dmeRentalBilling.ts:37–144`.
- **Permissions / tenant scope:** System-level.
- **Steps:**
  1. Select `dme_rental_periods` where `status='SCHEDULED'` and `periodEnd <= today`.
  2. For each: load `orders` + `dme_order_extensions`; missing order → mark `SKIPPED`.
  3. Cap enforcement: if `periodNumber > cap`, mark `TERMINATED` (note: "equipment transfers to patient ownership"), `capped++`.
  4. Otherwise spawn an invoice (`invoices` + `invoiceItems` line code `RENTAL`) using `sequenceService` numbering (`INV-YYYY-NNNNNN`), `amountCents = round(monthlyRateUsd*100)`, then mark period `BILLED` with `invoiceId`.
- **State machine:** Rental-period statuses observed: `SCHEDULED → BILLED` (billed), `SCHEDULED → TERMINATED` (cap reached), `SCHEDULED → SKIPPED` (orphaned). Returns `{processed, billed, capped, errors}`.
- **Side effects:** Invoice + invoice-item rows; period status writes.
- **Related services/crons:** `services/sequenceService.ts`.
- **Source:** `packages/api/src/cron/dmeRentalBilling.ts:37–144`.

### W5-04: Manage / re-initialize rental period schedule
- **Actors:** Facility personas, Admin.
- **Trigger:** Order-detail rental-schedule UI.
- **Entry points:** `GET /api/dme-rental-periods/order/:orderId` · `PUT /api/dme-rental-periods/:id` · `POST /api/dme-rental-periods/order/:orderId/initialize`.
- **Permissions / tenant scope:** GET is tenant-guarded (`isAdmin` else `orders.hospitalId` match, `dmeRentalPeriods.ts:29–31`). `PUT` and `initialize` have **no explicit object-level tenant guard** beyond `authMiddleware` — *flagged ambiguity*.
- **Steps:** List periods ordered by `periodNumber`; PUT updates `monthlyRateUsd` / `notes`; initialize re-runs W5-02 (throws `ValidationError` if `created===0`).
- **State machine:** see W5-02 / W5-03 statuses.
- **Side effects:** Period row writes; re-init wipes SCHEDULED periods.
- **Related services/crons:** `cron/dmeRentalBilling.ts`.
- **Source:** `packages/api/src/routes/dmeRentalPeriods.ts`.

### W5-05: Assemble DME document packet (materialize requirements)
- **Actors:** Facility personas, Admin.
- **Trigger:** Order detail "materialize docs"; also wizard.
- **Entry points:** `POST /api/dme-documents/materialize/:orderId` · `GET /api/dme-documents/order/:orderId` (packet status).
- **Permissions / tenant scope:** `isAdmin` else order hospital match (`dmeDocuments.ts:53–55, 67–69`).
- **Steps:**
  1. `resolveDocumentRequirements` walks order `orderItems` HCPCs, looks up `dme_document_requirements` (`isRequired=1`) matching HCPC, filtered by `payorKindFilter` (null = any payor, else must match the order payor's `kind`), deduped by `documentType` (`dmeDocumentService.ts:38–88`).
  2. `materializeOrderDocuments` idempotently inserts one `dme_order_documents` row per missing `documentType` with status `MISSING`.
  3. `getDocPacketStatus` returns `{total, received, missing, rejected, complete, docs}` — `complete` requires `total>0 && missing===0 && rejected===0` (`dmeDocumentService.ts:131–149`).
- **State machine:** Doc statuses `DME_DOC_STATUSES` = `MISSING, RECEIVED, EXPIRED, REJECTED, NOT_APPLICABLE` (`dmeDocuments.ts:126`).
- **Side effects:** `dme_order_documents` rows.
- **Related services/crons:** `services/dmeDocumentService.ts`.
- **Source:** `packages/api/src/routes/dmeDocuments.ts:46–72`; `services/dmeDocumentService.ts`.

### W5-06: DME document upload / receive / reject / ad-hoc
- **Actors:** Facility personas, Admin; providers may "attest" via mark-received.
- **Trigger:** Order-detail document panel actions.
- **Entry points:** `POST /api/dme-documents/:docId/upload` · `POST /api/dme-documents/:docId/mark-received` · `POST /api/dme-documents/:docId/mark-rejected` · `POST /api/dme-documents/order/:orderId/ad-hoc` · `DELETE /api/dme-documents/:docId`.
- **Permissions / tenant scope:** `upload` is tenant-guarded via the doc's order (`dmeDocuments.ts:92–97`). `mark-received`, `mark-rejected`, `ad-hoc`, and `DELETE` have **no explicit object-level tenant guard** beyond auth — *flagged ambiguity*. `DELETE` only allowed for ad-hoc docs (no `requirementId`), else `ConflictError`.
- **Steps:** `upload` records `blobKey` (already in R2 via `/api/uploads`), sets `RECEIVED`, computes `expiresAt` from the requirement's `expiresDays + signedAt`. `mark-rejected` requires a `reason`. `ad-hoc` requires a `documentType` ∈ `DME_DOCUMENT_TYPES` (`DWO, SWO, CMN, FACE_TO_FACE, SLEEP_STUDY, OXIMETRY, LMN, PROGRESS_NOTES, PHOTO, AOB, DELIVERY_TICKET, PROOF_OF_DELIVERY, OTHER`, `dmeDocuments.ts:73–87`).
- **State machine:** `MISSING → RECEIVED` (upload / mark-received), `* → REJECTED` (mark-rejected).
- **Side effects:** R2-backed doc rows; feed the claim bundle (W5-10).
- **Related services/crons:** —
- **Source:** `packages/api/src/routes/dmeDocuments.ts:74–208`.

### W5-07: DME document-requirement catalog admin
- **Actors:** Admin only (`rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER')`).
- **Trigger:** Admin catalog UI.
- **Entry points:** `GET /api/dme-documents/requirements` (any auth, filter `?hcpcCode=`) · `POST /api/dme-documents/requirements` · `PUT /api/dme-documents/requirements/:id` · `DELETE /api/dme-documents/requirements/:id`.
- **Permissions / tenant scope:** Mutations admin-only; reads platform-wide.
- **Steps:** Create requires `hcpcCode` + `documentType` ∈ `DME_DOCUMENT_TYPES`; unique on `(hcpc_code, document_type, payor_kind_filter)` → `ConflictError` on dup. Fields: `isRequired`, `payorKindFilter`, `expiresDays`, `notes`.
- **State machine:** n/a.
- **Side effects:** Catalog rows drive W5-05.
- **Source:** `packages/api/src/routes/dmeDocuments.ts:210–269`; schema `dme_document_requirements` (`packages/db/src/schema/dmeDocuments.ts:100–119`).

### W5-08: In-app DWO e-signature
- **Actors:** Physician / facility persona, Admin (tenant-guarded).
- **Trigger:** "Sign DWO" in order detail.
- **Entry points:** `POST /api/dme-documents/extension/:orderId/dwo-sign`.
- **Permissions / tenant scope:** `isAdmin` else order hospital match (`dmeDocuments.ts:361–363`).
- **Steps:** Validate `dataUrl` is `data:image/png;base64,…` and `signedByName` present; decode PNG, store at R2 key `dwo-signatures/:orderId/:ts.png`; upsert `dme_order_extensions` with `dwoSignatureBlobKey`, `dwoSignedAt`, `dwoSignedByName`, `dwoSignedByNpi`.
- **State machine:** n/a.
- **Side effects:** R2 signature blob; signature embedded into DWO PDF (W5-09 reads `dwoSignatureBlobKey` via `loadSignatureDataUrl`).
- **Source:** `packages/api/src/routes/dmeDocuments.ts:346–398`.

### W5-09: Generate DWO PDF (single document)
- **Actors:** Facility personas, Admin.
- **Trigger:** Download / preview DWO.
- **Entry points:** `GET /api/dme-bundle/:orderId/dwo.pdf` (inline PDF).
- **Permissions / tenant scope:** `isAdmin` (`ACCOUNT_MANAGER` / `_USER`) else order hospital match → `ConflictError` (`dmeBundle.ts:125–127`).
- **Steps:** `loadDwoData` joins order/items/extension/payor/hospital; load signature data URL; `renderDwoHtml` → `renderHtmlToPdf(env.BROWSER, html, {format:'Letter'})`; return inline `DWO-<identifier>.pdf`.
- **State machine:** n/a.
- **Side effects:** Cloudflare Browser Rendering invocation.
- **Related services/crons:** `services/dmeDwoTemplate.ts` (`renderDwoHtml`), `services/pdfService.ts`.
- **Source:** `packages/api/src/routes/dmeBundle.ts:120–160`.

### W5-10: Generate claim-ready bundle (DWO + docs + PA letter + POD → PDF)
- **Actors:** Facility personas, Admin.
- **Trigger:** "Generate claim bundle" in order detail.
- **Entry points:** `GET /api/dme-bundle/:orderId/claim-bundle.pdf`.
- **Permissions / tenant scope:** Order hospital match (non-admin) → `ConflictError`.
- **Steps:** See **DME claim-bundle assembly flow** above (DWO → RECEIVED docs → APPROVED-PA `documentBlobKeys` → shipment POD), merged via `mergePdfs`. `404` if nothing to bundle.
- **State machine:** n/a (reads PA status `APPROVED` and doc status `RECEIVED`).
- **Side effects:** Browser Rendering + R2 reads; no writes.
- **Related services/crons:** `services/pdfService.ts` (`renderHtmlToPdf`, `mergePdfs`, `imageToPdf`), `services/dmeDwoTemplate.ts`.
- **Source:** `packages/api/src/routes/dmeBundle.ts:166–267`.

### W5-11: LCD/NCD coverage check + auto-evaluation
- **Actors:** Any authenticated user (typically facility / physician during wizard).
- **Trigger:** Wizard coverage check; "Run LCD check".
- **Entry points:** `POST /api/lcd/check` (body `{hcpcCode, icd10List?, setting?, orderId?, findings?}`).
- **Permissions / tenant scope:** Auth only (no role gate); result cached against caller `user.id`.
- **Steps:** `evaluateLcdCoverage` walks every `lcd_coverage_criteria` for the HCPC and decides per criterion (`lcdService.ts:62–278`):
  - `DIAGNOSIS_REQUIRED` — pass if any patient ICD-10 ∈ criterion list.
  - `DIAGNOSIS_EXCLUDED` — pass if none excluded.
  - `SETTING` — matched against `setting` (HOME etc.); unspecified → needs review.
  - `DOCUMENTATION` — heuristic doc-type mapping checked against RECEIVED `dme_order_documents` when `orderId` supplied (FACE_TO_FACE, LMN, OXIMETRY, SLEEP_STUDY, PHOTO, CMN, PROGRESS_NOTES).
  - `CLINICAL_FINDING_THRESHOLD` — auto-evaluated against `findings[findingName]` using operator `<=,<,>=,>,=,!=,BETWEEN`.
  - `CLINICAL_FINDING` / default — always needs clinician review.
  Then `persistLcdCheck` caches result.
- **State machine:** Decision = `LCD_DECISIONS` = `MEETS, DOES_NOT_MEET, UNKNOWN, NEEDS_CLINICAL_REVIEW` (`packages/db/src/schema/cmsLcd.ts:118`). `DOES_NOT_MEET` if any mandatory criterion failed; else `NEEDS_CLINICAL_REVIEW` if any null; else `MEETS`; `UNKNOWN` only when no criteria on file.
- **Side effects:** `lcd_check_results` row.
- **Related services/crons:** `services/lcdService.ts`.
- **Source:** `packages/api/src/routes/lcd.ts:33–57`; `services/lcdService.ts:62–298`.

### W5-12: LCD coverage check history + required-findings lookup
- **Actors:** Any authenticated user.
- **Entry points:** `GET /api/lcd/check-history/order/:orderId` · `GET /api/lcd/required-findings/:hcpc` · `GET /api/lcd/documents` · `GET /api/lcd/documents/:id/criteria`.
- **Permissions / tenant scope:** Auth only (no tenant scoping — *flagged: order-scoped history is readable by any authenticated user*).
- **Steps:** History returns cached `lcd_check_results` (newest first). Required-findings filters criteria of type `CLINICAL_FINDING_THRESHOLD` with a `findingName`, returning `{findingName, operator, threshold, threshold2, unit, description, citation}` so the wizard renders numeric inputs.
- **State machine:** n/a.
- **Source:** `packages/api/src/routes/lcd.ts:60–113`.

### W5-13: LCD/NCD ingest (JSON + CSV admin)
- **Actors:** Admin only (`rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER')`).
- **Entry points:** `POST /api/lcd/ingest` (body `{documents:[...]}`) · `POST /api/lcd/ingest-csv` (body `{csv}`).
- **Steps:** `ingestLcdJson` per-document deletes existing `lcd_documents` + `lcd_coverage_criteria` for that id (idempotent replace) then re-inserts. CSV path parses rows (quoted-field aware), groups by `lcd_id`, builds criteria from columns (`hcpc_code`, `criterion_type`, `icd10_codes` pipe-separated, `required_finding`, `is_mandatory`).
- **State machine:** n/a.
- **Side effects:** `lcd_documents` + `lcd_coverage_criteria` rows.
- **Related services/crons:** `services/lcdService.ts` (`ingestLcdJson`).
- **Source:** `packages/api/src/routes/lcd.ts:147–235`; `services/lcdService.ts:304–367`.

### W5-14: CMS Medicare Coverage Database scrape (admin ingest)
- **Actors:** Admin only.
- **Trigger:** Admin clicks "Fetch from CMS" per LCD.
- **Entry points:** `POST /api/lcd/fetch-from-cms` (body `{lcdId, autoIngest?}`).
- **Steps:** `fetchAndParseLcd` normalizes the id (`L33718`/`33718`), fetches `cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=N`, strips HTML, extracts title/contractor/jurisdiction/effective/revision dates, the "Coverage Indications…" section and "Documentation Requirements" section, plus HCPCS (`[A-V]\d{4}`, capped 30) and ICD-10 (capped 50) codes. Builds per-HCPC criteria: a `CLINICAL_FINDING` (narrative), a `DIAGNOSIS_REQUIRED` (if ICD-10s found), a `DOCUMENTATION` (if doc section found). If `autoIngest`, pipes through `ingestLcdJson`; otherwise returns parsed payload for admin review.
- **State machine:** n/a.
- **Side effects:** Outbound `fetch` to cms.gov; optional ingest writes.
- **Related services/crons:** `services/cmsMcdScraper.ts`, `services/lcdService.ts`.
- **Source:** `packages/api/src/routes/lcd.ts:115–145`; `services/cmsMcdScraper.ts:106–222`.

### W5-15: CMS PA-required HCPC list lookup + admin maintenance
- **Actors:** Reads any auth; writes Admin only.
- **Trigger:** Wizard checks if an HCPC requires CMS prior auth; admin maintains the list.
- **Entry points:** `GET /api/lcd/pa-required` · `GET /api/lcd/pa-required/:hcpc` · `POST /api/lcd/pa-required` (admin) · `DELETE /api/lcd/pa-required/:hcpc` (admin, soft `isActive=0`).
- **Steps:** Single-HCPC check returns `{hcpcCode, required:boolean, info}` from `cms_pa_required_hcpcs`. POST upserts (UNIQUE conflict → update + reactivate).
- **State machine:** n/a (active/inactive flag).
- **Side effects:** `cms_pa_required_hcpcs` rows.
- **Source:** `packages/api/src/routes/lcd.ts:237–304`.

### W5-16: Prior authorization lifecycle (state machine)
- **Actors:** Facility personas (`MANAGER_OR_USER` list), Admin. PHI-sensitive (hospital-owned).
- **Trigger:** PA created from DME wizard or standalone; transitioned as payor responds.
- **Entry points:** `packages/web/src/features/priorAuth` · `GET /api/prior-auths` (list, filters `status`/`payorId`/`orderId`) · `POST /api/prior-auths` (create → `NEEDED`) · `GET /api/prior-auths/:id` (detail + history, logs PHI access) · `PATCH /api/prior-auths/:id` · `POST /api/prior-auths/:id/transition` · `POST /api/prior-auths/:id/documents` (attach R2 `blobKey`) · `GET /api/prior-auths/summary/dashboard` (counts + expiringSoon).
- **Permissions / tenant scope:** `rbac(...MANAGER_OR_USER)`. Object-level `assertPaAccess`: admins see all; everyone else confined to their `hospitalId` and gets `NotFoundError` (not Forbidden) on mismatch to avoid leaking existence (`priorAuths.ts:64–73`). List query forces `1=0` for non-admin personas with no hospital tenant.
- **Steps:** Create requires `payorId`, `patientName`, `hcpcCode` (verifies payor exists); normalizes singular `icd10` → `icd10Codes`; inserts PA at `NEEDED` + initial history row. Transition validates target ∈ allowed set, writes status + history.
- **State machine:** See **Prior-auth state machine** section above. Statuses `NEEDED, SUBMITTED, PENDING, APPROVED, DENIED, EXPIRED, CANCELLED`.
- **Side effects:** `prior_auth_history` rows; `phiAuditService.logPhiAccess` on detail view; APPROVED PAs feed the claim bundle (W5-10). Dashboard "expiringSoon" = APPROVED with `effective_end_date` within next 30 days.
- **Related services/crons:** `services/phiAuditService.ts`.
- **Source:** `packages/api/src/routes/priorAuths.ts` (full file).

### W5-17: DMEPOS supplier compliance management
- **Actors:** Reads any auth; writes Admin only (`rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER')`).
- **Trigger:** Admin compliance UI; vendor accreditation tracking.
- **Entry points:** `GET /api/dmepos-compliance/` (vendors + summary) · `GET /api/dmepos-compliance/vendor/:vendorId` · `PUT /api/dmepos-compliance/vendor/:vendorId` (admin, upsert summary) · `GET /api/dmepos-compliance/vendor/:vendorId/docs` · `POST /api/dmepos-compliance/vendor/:vendorId/docs` (admin) · `PUT /api/dmepos-compliance/docs/:docId` (admin) · `DELETE /api/dmepos-compliance/docs/:docId` (admin, soft `isActive=0`) · `GET /api/dmepos-compliance/expiring?days=30`.
- **Steps:** Summary holds `nscNumber`, `ptan`, `npi`, `accredited`, `accreditationBody`, `accreditationExpiresAt`, `suretyBondExpiresAt`. Cert docs require `certType` ∈ `DMEPOS_CERT_TYPES` = `CMS_ACCREDITATION, SURETY_BOND, NSC, PTAN, NPI, STATE_LICENSE, JOINT_COMMISSION, ACHC, BOC, CHAP, BBB, OTHER` (`dmeDocuments.ts:163–176`).
- **State machine:** n/a (active flag + expiry dates).
- **Side effects:** `vendor_dmepos_compliance`, `vendor_compliance_docs` rows; feed W5-18.
- **Source:** `packages/api/src/routes/dmeposCompliance.ts`.

### W5-18: DMEPOS compliance expiry notifier cron
- **Actors:** System (daily cron `0 8 * * *`).
- **Trigger:** `handleDmeposExpiry(env)`.
- **Steps:** Collect active `vendor_compliance_docs` with `expirationDate <= today+30d` plus `vendor_dmepos_compliance` accreditation/surety-bond expiries within window; resolve vendor names; group by vendor; for each, build a consolidated message (EXPIRED vs expiring-in-Nd) and create in-app notifications to every `ACCOUNT_MANAGER` / `ACCOUNT_MANAGER_USER` (one notification per vendor per admin per run).
- **State machine:** n/a.
- **Side effects:** Notifications via `NotificationService`. Returns `{notified, expiring, alreadyExpired}`.
- **Related services/crons:** `services/notificationService.ts`.
- **Source:** `packages/api/src/cron/dmeposExpiry.ts`.

### W5-19: Clinical note templates
- **Actors:** Any authenticated user (no role gate).
- **Trigger:** Clinical-note authoring (Scoli/AFO etc.).
- **Entry points:** `GET /api/clinical-templates` (filter `?type=`) · `GET /api/clinical-templates/:id` · `POST /api/clinical-templates` · `PUT /api/clinical-templates/:id` · `DELETE /api/clinical-templates/:id`.
- **Permissions / tenant scope:** Auth only; **no role/tenant gate** (any authenticated user can CRUD all templates) — *flagged ambiguity*. Raw `sql` parameterized queries against `clinical_templates`.
- **Steps:** Create requires `name` + `type`; stores `body` + `default_hcpc_codes` (JSON; accepts string or array).
- **State machine:** n/a.
- **Source:** `packages/api/src/routes/clinicalTemplates.ts`.

### W5-20: Referring-provider persona management + onboarding
- **Actors:** Admin (full CRUD + onboard); Provider users (read own, update own).
- **Entry points:** `GET /api/providers` (ADMIN all / PROVIDER own) · `GET /api/providers/:id` · `POST /api/providers/onboard` (admin) · `POST /api/providers` (admin) · `PUT /api/providers/:id` (admin or own) · `DELETE /api/providers/:id` (admin).
- **Permissions / tenant scope:** `requireAdmin` for create/onboard/delete; `userType==='PROVIDER'` with `providerId` scopes to own row; others Forbidden. Body sanitized via `stripImmutableFields`.
- **Steps:** `onboard` creates a provider network row, optionally links hospitals (`UPDATE hospitals SET provider_id`), and creates an `ADMIN` user with a generated temp password (`must_change_password=1`).
- **State machine:** n/a.
- **Side effects:** `providers` + `users` rows; hospital relinking; `hashPassword`.
- **Related services/crons:** `services/authService.ts` (`hashPassword`).
- **Source:** `packages/api/src/routes/providers.ts`.

### W5-21: Create lab order + TRF/kit asset generation
- **Actors:** `LAB` users (own `labGroupId`) and `ADMIN`.
- **Trigger:** Lab portal "Create order".
- **Entry points:** `packages/web/src/features/labs` · `POST /api/labs/orders`.
- **Permissions / tenant scope:** `requireLabOrAdmin`; LAB users cannot create for another `labGroupId` (`labs.ts:229–231`).
- **Steps:**
  1. Zod-validate payload (group, kit site, patient demographics, `dxCodeList`, `testList`, `items`); generate `orderNumber` `LAB-YYYY-NNNNNN`; insert `lab_orders` at status `OPEN`, `readyForApproval=0`, plus `lab_order_items`.
  2. Start `LAB_ORDER_ASSET_GEN` workflow (`startWorkflow`, entity `lab_order`).
  3. Auto-consume inventory (→ W5-25) when `kitSiteId` + items present; shortages returned (non-blocking).
  4. Return `{id, orderNumber, workflowInstanceId, consumption}`.
- **State machine:** Lab order statuses observed: `OPEN, READY_FOR_APPROVAL, APPROVED, REJECTED, SHIPPED, DELIVERED, COMPLETED, CANCELLED, QC_FAILED` (dashboard list `labs.ts:807`; QC path `labs.ts:636`). Asset workflow flips `OPEN → READY_FOR_APPROVAL`.
- **Side effects:** Workflow instance; PDF assets generated (W5-24); inventory issuance (W5-25); `lab_orders`/`lab_order_items` rows.
- **Related services/crons:** `workflows/labOrderAssetGen.ts` (steps: generateTrf → shipping label → return label → stickers → mergeConsolidated → markReadyForApproval, each idempotent), `services/labInventoryService.ts`, `services/workflowService.ts`.
- **Source:** `packages/api/src/routes/labs.ts:223–308`; `workflows/labOrderAssetGen.ts:367–377`.

### W5-22: Lab order ingest (idempotent) + replay
- **Actors:** LAB/ADMIN (ingest); ADMIN only (replay).
- **Trigger:** External system order push; admin re-run.
- **Entry points:** `POST /api/labs/orders/ingest` (header `Idempotency-Key`) · `POST /api/labs/orders/replay/:journalId` (admin) · `POST /api/labs/orders/parse-barcode` (kit-receiving HL7 barcode → demographics).
- **Permissions / tenant scope:** `requireLabOrAdmin`; replay requires `userType==='ADMIN'`.
- **Steps:** Ingest journals every payload to R2 + DB (`writeReceived`); duplicate `Idempotency-Key` returns `{duplicate:true, existingLabOrderId}`; otherwise persist order (`persistLabOrderFromPayload`) + append `PROCESSED`/`FAILED` event. Replay loads a journal entry, re-validates, creates a **new** order (fresh asset workflow) + `REPLAYED` event.
- **State machine:** Same lab-order statuses; new order starts `OPEN`.
- **Side effects:** Audit journal (R2 + DB) via `auditJournalService`; new workflow instances.
- **Related services/crons:** `services/auditJournalService.ts`, `lib/hl7BarcodeParser.ts`.
- **Source:** `packages/api/src/routes/labs.ts:436–701`.

### W5-23: Lab order approve / reject / QC-failure
- **Actors:** LAB/ADMIN.
- **Entry points:** `POST /api/labs/orders/:id/approve` · `POST /api/labs/orders/:id/reject` (reason required) · `POST /api/labs/orders/:id/qc-failure`.
- **Permissions / tenant scope:** `requireLabOrAdmin`; LAB user limited to own `labGroupId`.
- **Steps:** Approve sets `APPROVED` + `approvedBy/At`, clears `readyForApproval`. Reject sets `REJECTED` + `rejectionReason/By/At`. QC-failure: `attemptNumber` 1–3; attempts 1–2 keep `qcStatus=PENDING`; attempt 3 or `permanentlyFailed` flips `qcStatus=FAILED`, order `QC_FAILED`, `qcPermanentlyFailed=1`, and dispatches a `LAB_ORDER_QC_FAILED` notification (SLA-style email).
- **State machine:** `READY_FOR_APPROVAL → APPROVED | REJECTED`; `* → QC_FAILED` (terminal QC). `qcStatus`: `PENDING → FAILED`.
- **Side effects:** Notification via `notificationRouter.dispatchCustomerEvent` (waitUntil).
- **Related services/crons:** `services/notificationRouter.ts`, `services/emailService.ts`.
- **Source:** `packages/api/src/routes/labs.ts:392–434, 601–670`.

### W5-24: Lab order PDF asset download + tracking export
- **Actors:** LAB/ADMIN.
- **Entry points:** `GET /api/labs/orders/:id/trf.pdf` · `/shipping-label.pdf` · `/return-label.pdf` · `/stickers.pdf` · `/consolidated.pdf` · `GET /api/labs/orders/:id/workflow` (workflow status) · `GET /api/labs/orders.xlsx` (tracking export) · `GET /api/labs/dashboard/counts`.
- **Permissions / tenant scope:** `requireLabOrAdmin`; LAB scoped to own group. `GET /api/labs/orders/:id` logs PHI access.
- **Steps:** `streamPdfAsset` reads the relevant `*BlobKey` field from `lab_orders` and streams the R2 object inline (404 if not yet generated). XLSX export builds a per-order tracking sheet via `xlsxService`.
- **State machine:** n/a.
- **Source:** `packages/api/src/routes/labs.ts:703–818`.

### W5-25: Lab auto-consume inventory on order create (shortage warnings)
- **Actors:** System (invoked from W5-21 / W5-31).
- **Trigger:** Lab order created with `kitSiteId` + items.
- **Steps:** `autoConsumeForLabOrder` for each item with a `testCode`: resolve `lab_test_consumables` mappings (tenant-specific row wins over platform-wide null), compute `quantityPerTest × item.quantity` (rounded up), `issueConsumable` FEFO from the kit site. Insufficient stock is **non-blocking** — recorded in a `shortages[]` array with `isCritical` flag; the lab order stays valid.
- **State machine:** Drives lot status via movements (see W5-26).
- **Side effects:** `ISSUE` movements + lot decrements; returns `{attempted, fullyIssued, shortages}` surfaced in the CreateLabOrder UI.
- **Related services/crons:** `services/labInventoryService.ts:383–469`.
- **Source:** `packages/api/src/routes/labs.ts:281–305`; `services/labInventoryService.ts`.

### W5-26: Lab inventory — consumables, lots, receiving, issuance, transfer
- **Actors:** Lab personas (`LAB_ACCOUNT_MANAGER` / `_USER`), vendor personas (lab-group owned), Admin.
- **Entry points (all under `/api/lab-inventory`):** consumables `GET/POST/PUT/DELETE /consumables[/:id]`; lots `GET /lots`, `POST /lots/receive`, `POST /lots/:id/adjust`, `POST /lots/:id/quarantine`, `POST /lots/:id/recall`; `POST /issue`; `POST /transfer`; summaries `GET /summary`, `/reorder-candidates`, `/expiring`, `/forecast`; movement reads `GET /movements/lot/:lotId`, `/movements/site/:siteId`.
- **Permissions / tenant scope:** `tenantLabGroups` resolves caller's group IDs (admin = unrestricted; lab = own group; vendor = all `lab_groups.vendor_id`; else Forbidden). `assertSiteInTenant` / `assertLotInTenant` guard object access. Platform-wide consumables (null `labGroupId`) are readable by all; only admin can create platform-wide items. Manual `adjust` requires admin or `LAB_ACCOUNT_MANAGER` and a `reason`.
- **Steps:** `receiveLot` is idempotent by `(consumableId, siteId, lotNumber)` (create or top-up via `RECEIVE` movement). `issueConsumable` is FEFO (oldest non-expired ACTIVE lot first, may span lots). `transferStock` logs `TRANSFER_OUT` from source + `RECEIVE`/`TRANSFER_IN` at destination (linked by `relatedTransferId`); cannot transfer to same site. `recordMovement` updates `quantity_on_hand` and auto-flips a zeroed ACTIVE lot to `DEPLETED`.
- **State machine:** Lot statuses `LOT_STATUSES` = `ACTIVE, EXPIRED, QUARANTINED, RECALLED, DEPLETED` (`labInventory.ts:89`). Movement types `MOVEMENT_TYPES` = `RECEIVE, ISSUE, ADJUST, EXPIRE, TRANSFER_OUT, TRANSFER_IN, QUARANTINE, RECALL` (`labInventory.ts:134–143`). Quarantine/recall set status + log a 0-qty movement. Categories `LAB_CONSUMABLE_CATEGORIES` (`REAGENT, CONTROL, CALIBRATOR, KIT, SWAB, TUBE, PIPETTE_TIP, PLATE, PPE, CLEANING, OTHER`); hazard `HAZARD_CLASSES` (`NONE, BIOHAZARD, CHEMICAL, RADIOACTIVE, FLAMMABLE, CORROSIVE, CONTROLLED_SUBSTANCE`).
- **Side effects:** Append-only `lab_stock_movements`; lot quantity writes. Summary flags `belowReorderPoint`, `belowMin`, `hasExpiringSoon` (≤30d), `hasExpiredLot`.
- **Related services/crons:** `services/labInventoryService.ts`, `services/labReplenishmentService.ts` (forecast).
- **Source:** `packages/api/src/routes/labInventory.ts`; `services/labInventoryService.ts`.

### W5-27: Lab inventory expiration sweep cron
- **Actors:** System (daily cron `0 8 * * *`).
- **Trigger:** `handleLabExpiration(env)`.
- **Steps:** Mark ACTIVE lots with `expiration_date < today` as `EXPIRED`, log an `EXPIRE` movement per lot; count lots expiring in 30/60/90-day windows for reporting.
- **State machine:** `ACTIVE → EXPIRED`.
- **Side effects:** Lot status writes + `EXPIRE` movements. Returns `{expired, expiringIn30, expiringIn60, expiringIn90}`.
- **Related services/crons:** `services/labReplenishmentService.ts:299–349`; `cron/labReplenishment.ts` (re-export).
- **Source:** `packages/api/src/services/labReplenishmentService.ts`.

### W5-28: Lab auto-replenishment cron + demand forecast
- **Actors:** System (daily cron `0 8 * * *`); forecast also exposed via `GET /api/lab-inventory/forecast`.
- **Trigger:** `handleLabAutoReplenishment(env)`.
- **Steps:** Pull `getReorderCandidates` (on-hand ≤ reorder point / below min); resolve site→hospital; group by `(hospitalId, preferredVendorId)`; for each batch create a `requisitions` row (`SUBMITTED`, `requestedByUserId='system-auto-replen'`, off-formulary items) + `requisition_items` + history, routing through `pickPrimaryApprover` (REQUISITION trigger). **Idempotency:** skip if a same-day `Auto-replen YYYY-MM-DD [<group>…]`-titled requisition already exists for the hospital. `forecastDemand` computes 30-day projected demand from trailing-60-day `lab_orders × lab_test_consumables` consumption with `daysOfSupply` + `suggestedOrderQty`.
- **State machine:** Created requisitions enter the Procurement requisition state machine at `SUBMITTED`.
- **Side effects:** `requisitions`/`requisition_items`/`requisition_history` rows. Returns `{itemsConsidered, requisitionsCreated, skippedExisting, errors}`.
- **Related services/crons:** `services/labReplenishmentService.ts:151–294`, `services/approvalRuleEngine.ts`, `services/sequenceService.ts`; `cron/labReplenishment.ts`.
- **Source:** `packages/api/src/services/labReplenishmentService.ts`.

### W5-29: Test → consumable mapping
- **Actors:** Lab/vendor personas, Admin.
- **Entry points:** `GET /api/lab-inventory/test-consumables` · `POST /api/lab-inventory/test-consumables` (upsert) · `DELETE /api/lab-inventory/test-consumables/:id`.
- **Permissions / tenant scope:** Visibility = platform-wide (null `labGroupId`) + tenant rows; non-admins must supply a `labGroupId` in their tenant to create (platform-wide mappings are admin-only); delete blocked for platform-wide rows unless admin.
- **Steps:** Create requires `testCode`, `consumableId`, `quantityPerTest`; UNIQUE conflict → `ConflictError`. Mappings drive W5-25 auto-consume and W5-28 forecasting.
- **State machine:** n/a.
- **Side effects:** `lab_test_consumables` rows.
- **Source:** `packages/api/src/routes/labInventory.ts:594–684`.

### W5-30: Stock-movement audit search
- **Actors:** Lab personas (own group via JOIN), vendor personas (own labs via group→vendor JOIN), Admin (unrestricted); other personas Forbidden (403).
- **Entry points:** `GET /api/lab-movements` (filters `siteId`, `consumableId`, `movementType`, `fromDate`, `toDate`, `limit` capped 2000).
- **Permissions / tenant scope:** Tenant enforced by JOIN to `lab_kit_sites` (lab) or `lab_kit_sites → lab_groups.vendor_id` (vendor). Personas with no lab/vendor scope on the JWT are denied (no data leakage).
- **Steps:** Build filter conditions; admins run a flat query; lab/vendor run the tenant-scoped JOIN query.
- **State machine:** n/a.
- **Source:** `packages/api/src/routes/labMovementSearch.ts`.

### W5-31: Historical consumption backfill (admin)
- **Actors:** Admin only (`isAdmin`).
- **Trigger:** Admin backfill UI; orders predating the auto-consume hook.
- **Entry points:** `POST /api/lab-inventory/backfill?dryRun|commit&days=N`.
- **Steps:** Find `lab_orders` in the lookback window with a `kit_site_id` and **no** `lab_stock_movements` (never auto-consumed). Dry-run lists candidates; commit runs `autoConsumeForLabOrder` per order. Idempotent via the NOT-EXISTS movement guard.
- **State machine:** n/a (produces W5-26 movements).
- **Side effects:** Retroactive `ISSUE` movements + lot decrements.
- **Source:** `packages/api/src/routes/labInventory.ts:686–782`.

### W5-32: Kit-letter catalog sync cron
- **Actors:** System (daily cron `08:00 UTC`).
- **Trigger:** `handleKitLetterSync(env)` → `syncKitLetters(env, {dryRun:false})`.
- **Steps:** Guarded outbound fetch (`guardedFetch` + `assertPublicHttpUrl`) of the external kit-letter catalog (`KIT_LETTERS_URL`); dedupe by `(parentKitId, letterId)` keeping newest `sourceUpdatedAt`; upsert `kit_letters` with versioned history (new = v1; newer source = prev_max+1; same = skip); upload letter PDFs (base64) to R2 and store `pdfBlobKey`.
- **State machine:** n/a (versioned rows).
- **Side effects:** `kit_letters` rows + R2 PDF blobs. Returns `{imported, updated, skipped, gated, errors, totalSourceRows}`.
- **Related services/crons:** `services/kitLetterSyncService.ts`, `services/storageService.ts`, `lib/externalCallGate.ts`, `lib/safeFetch.ts`; `cron/kitLetterSync.ts`.
- **Source:** `packages/api/src/services/kitLetterSyncService.ts`; `cron/kitLetterSync.ts`.

---

## Notes & flagged ambiguities

- **Cron schedules**: The DME rental billing, DMEPOS expiry, lab replenishment/expiration, and kit-letter sync handlers all document themselves as wired into the existing daily `0 8 * * *` schedule; the actual `scheduled()` dispatcher wiring was not re-verified in this pass (handlers exist and are exported).
- **Tenant-guard gaps** (auth still required on all): `dme-rental-periods` `PUT /:id` and `POST /order/:orderId/initialize`; `dme-documents` `mark-received` / `mark-rejected` / `ad-hoc` / `DELETE`; `clinical-templates` (no role gate at all); `lcd` `check-history/order/:orderId` (order-scoped reads not tenant-filtered). These rely on `authMiddleware` only and lack object-level hospital/tenant checks present on sibling endpoints.
- **`transferStock` accounting**: the destination half logs a real `RECEIVE` plus a 0-qty `TRANSFER_IN` marker (linked by `relatedTransferId`) rather than a single `TRANSFER_IN` with quantity — intentional per the in-code comment to keep totals accurate.

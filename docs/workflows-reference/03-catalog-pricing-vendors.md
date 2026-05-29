# Catalog, Pricing & Vendors — Workflow Reference

This document catalogs every workflow in the **Catalog, Pricing & Vendors** domain of the
Curavend healthcare supply-chain platform (Cloudflare Workers + Hono + Drizzle/D1 monorepo).
It covers the product catalog (vendor SKUs and SKU groups), the HCPC/ICD-10 reference data,
hospital formularies, the multi-tier pricing engine, the spend calculator, and the full
vendor lifecycle: vendor CRUD, supplier onboarding, geographic/HCPC coverage, locations,
ERP/stock connectors, hospital↔vendor relationships, super-vendor aggregation, GPO
membership tiers, and the public HMAC-verified stock-feed webhook.

All `/api/*` routes are JWT-gated by `app.use('/api/*', authMiddleware())`
(`packages/api/src/index.ts:210`). The **single exception** is `POST /api/stock-feeds/:vendorId/webhook`,
which is intentionally unauthenticated and instead verified by per-connector HMAC-SHA256.
Mount prefixes are declared in `packages/api/src/index.ts` (lines 198–293).

> **Important pricing note (flagged ambiguity):** The platform contains **two different**
> price-resolution code paths with **different tier orders**, plus a documented-but-unimplemented
> ideal 5-tier cascade. The task brief describes a "4-tier" chain (Contract → Fee schedule →
> Medicare → Manual/list). The actual code does **not** match that exactly. See
> [§ Pricing Fallback Chains](#-pricing-fallback-chains-diagram) for the exact, code-true orders.

---

## Workflow index

| ID | Name |
|----|------|
| W3-01 | Browse / search catalog (price-resolved) |
| W3-02 | Manage vendor item SKUs (CRUD + import) |
| W3-03 | Manage SKU groups (variant grouping + attach/detach) |
| W3-04 | Price lookup via fallback chain (CONTRACT → MEDICARE) |
| W3-05 | GPO rate resolve (sanity-check lookup) |
| W3-06 | Spend calculator estimate (STATE → CUSTOM → MEDICARE) |
| W3-07 | Manage HCPC reference data + categorize |
| W3-08 | Manage ICD-10 reference data |
| W3-09 | Build per-facility formulary (with substitutes) |
| W3-10 | Resolve formulary decision (ON/OFF/RESTRICTED) |
| W3-11 | Create / edit / delete vendor |
| W3-12 | Onboard vendor + default admin (one-shot) |
| W3-13 | Vendor onboarding lifecycle (state machine) |
| W3-14 | Define vendor coverage (geo + HCPC/category matrix) |
| W3-15 | Manage vendor locations (branches) |
| W3-16 | Configure vendor ERP push connector |
| W3-17 | Configure vendor stock connector + poll live stock |
| W3-18 | Ingest vendor stock-feed webhook (public, HMAC) |
| W3-19 | Link hospital ↔ vendor (preference rows) |
| W3-20 | Super-vendor aggregation (parent org) |
| W3-21 | Set up GPO organization + membership tier |

---

### W3-01: Browse / search catalog (price-resolved)
- **Actors:** Hospital users, Vendor users, Admin (ACCOUNT_MANAGER).
- **Trigger:** User opens the catalog/browse page; types a query or filters.
- **Entry points:** `packages/web/src/features/catalog` · `GET /api/catalog`
- **Permissions / tenant scope:** Scope determined in-handler by `user.userType`
  (`catalog.ts:44-61`): ADMIN unrestricted; VENDOR auto-scoped to `user.vendorId`;
  HOSPITAL limited to SKUs of vendors with **any** `hospital_vendors` row (note: code reads
  "APPROVED" in the doc comment but the query filters only on `hospitalId`, not a status —
  flagged); other user types get an empty list. Only `isActive = 1` SKUs are returned.
- **Steps:**
  1. Resolve `allowedVendorIds` from the caller's type.
  2. Build filters from `?q=` (LIKE across hcpcCode/description/tagline/manufacturerName),
     `?vendorId=`, `?groupId=`, `?hcpcCode=`, `?limit=`, `?offset=`.
  3. Join `vendor_item_skus` → `sku_groups` → `vendors`; page + count.
  4. For HOSPITAL users only, bulk-resolve a hospital-specific price per row via
     `getContractRatesBulk` (`catalog.ts:136-162`). If a contract rate exists,
     `resolvedPriceCents`/`priceSource='CONTRACT'`/`contractId` are overlaid; otherwise the
     row falls back to `listPriceCents` with `priceSource='LIST'`. (Catalog overlay only
     does CONTRACT-or-LIST; it does **not** consult Medicare/GPO — flagged inconsistency vs. W3-04.)
- **State machine:** n/a.
- **Side effects:** None (read-only).
- **Related services/crons:** `lib/contractPricing.ts` (`getContractRatesBulk`).
- **Source:** `packages/api/src/routes/catalog.ts`

---

### W3-02: Manage vendor item SKUs (CRUD + import)
- **Actors:** VENDOR / SUPER_VENDOR / ADMIN (write); HOSPITAL (read-only).
- **Trigger:** Vendor catalog admin adds/edits/deletes an HCPC↔SKU mapping.
- **Entry points:** `packages/web/src/features/catalog` · `GET /api/vendor-item-skus`,
  `GET /api/vendor-item-skus/:id`, `POST /api/vendor-item-skus`, `PUT /api/vendor-item-skus/:id`,
  `DELETE /api/vendor-item-skus/:id`
- **Permissions / tenant scope:** Write scope via `assertVendorWriteScope` (`vendorItemSkus.ts:29-37`):
  ADMIN any; VENDOR only own `vendorId`; SUPER_VENDOR allowed (child-vendor ownership re-verified
  on POST `:184-196`). HOSPITAL is read-only and must have a `hospital_vendors` link to the
  vendor (else 403); hospitals never see `isActive=0` rows.
- **Steps (write):**
  1. POST: requires `hcpcCode` + `vendorSku`; normalizes hcpc to uppercase; UNIQUE
     `(vendor, vendorSku)` collision → ValidationError.
  2. PUT: patch-style update; recomputes uppercased hcpc; clamps `unitsPerPack`/`packsPerCase` ≥ 1
     and `listPriceCents` ≥ 0.
  3. DELETE: soft-delete (`isActive=0`) by default; `?hard=1` performs a hard delete.
- **State machine:** n/a (`isActive` 1/0 flag only).
- **Side effects:** Inserts/updates `vendor_item_skus`.
- **Related services/crons:** Consumed by W3-01 catalog and W3-14 coverage SKU-count overlay.
- **Source:** `packages/api/src/routes/vendorItemSkus.ts`

---

### W3-03: Manage SKU groups (variant grouping + attach/detach)
- **Actors:** VENDOR (own), ADMIN (any). HOSPITAL may browse active groups (read).
- **Trigger:** Vendor defines a marketing "group" (e.g. "ProBrace Elite") with shared copy/docs
  and groups variant SKUs under it.
- **Entry points:** `GET /api/sku-groups`, `GET /api/sku-groups/:id` (group + child SKUs),
  `POST /api/sku-groups`, `PUT /api/sku-groups/:id`, `DELETE /api/sku-groups/:id`,
  `POST /api/sku-groups/:id/skus` (attach), `DELETE /api/sku-groups/:id/skus/:skuId` (detach)
- **Permissions / tenant scope:** `assertVendorScope` (`skuGroups.ts:16-20`) — ADMIN any,
  VENDOR own vendorId only. HOSPITAL list is allowed (active groups) but cannot write.
- **Steps:**
  1. POST creates a group (groupName required); stores JSON for `salientFeatures`,
     `categoryPath`, `variantAttributes`; `isActive=1`.
  2. Attach validates the SKU's `vendorId` matches the group's vendor before setting
     `vendor_item_skus.groupId`.
  3. DELETE is blocked if any SKU is still attached ("detach them first").
- **State machine:** n/a.
- **Side effects:** Mutates `sku_groups` and `vendor_item_skus.groupId`.
- **Source:** `packages/api/src/routes/skuGroups.ts`

---

### W3-04: Price lookup via fallback chain (CONTRACT → MEDICARE)
- **Actors:** ADMIN, HOSPITAL (own hospitalId), VENDOR (own vendorId).
- **Trigger:** Price Lookup UI; order/invoice pricing pre-fill.
- **Entry points:** `packages/web/src/features/pricing` · `GET /api/pricing/rate`,
  `POST /api/pricing/rates/bulk`
- **Permissions / tenant scope:** `assertCanQuery` (`pricing.ts:22-27`) — ADMIN any;
  HOSPITAL only when `user.hospitalId === hospitalId`; VENDOR only when
  `user.vendorId === vendorId`; otherwise 403.
- **Steps (single rate):**
  1. Require `hospitalId`, `vendorId`, `hcpcCode` (optional `asOf`).
  2. Check KV cache `pricing:{hospitalId}:{vendorId}:{hcpcCode}:{asOf|today}` (5-min TTL).
  3. **Priority 1 — CONTRACT** via `getContractRate` (active contract in window; latest
     `startDate` wins).
  4. **Priority 2 — MEDICARE** via `getMedicareRate` (`medicare_fee_schedule_items.non_rural_rate`).
  5. Else `{ rate: null, source: null }`.
  6. Write result to KV (300 s TTL).
- **Bulk variant:** `POST /rates/bulk` does the same per code via `getContractRatesBulk`
  then per-code Medicare fallback.
- **State machine:** n/a.
- **Side effects:** KV writes (non-fatal on failure).
- **⚠ Flagged:** This route's actual order is **CONTRACT → MEDICARE → null** only. Its own
  header comment notes "Custom fee schedules are applied at invoice time and not exposed here
  for v1," and it does **not** call GPO. This differs from both the brief's 4-tier description
  and the `contractPricing.ts` documented 5-tier ideal. See diagram below.
- **Related services/crons:** `lib/contractPricing.ts`.
- **Source:** `packages/api/src/routes/pricing.ts`

---

### W3-05: GPO rate resolve (sanity-check lookup)
- **Actors:** Any authed user (used by Price Lookup UI).
- **Trigger:** "Would this come from a GPO?" check in the price-lookup screen.
- **Entry points:** `GET /api/gpo/resolve-rate?hospitalId=&vendorId=&hcpcCode=`
- **Permissions / tenant scope:** No explicit per-tenant guard on this endpoint (any authed
  user may query any hospital/HCPC — flagged as a potential IDOR; read-only rate disclosure).
- **Steps:** Calls `getGpoRate` (`contractPricing.ts:144-190`): looks up the hospital's
  `gpoOrganizationId`; finds active `gpo_contract_items` for the HCPC; prefers a vendor-specific
  row over a vendor-agnostic (`vendorId IS NULL`) row; returns `{ match }` or `{ match: null }`.
- **State machine:** n/a.
- **Side effects:** None.
- **Source:** `packages/api/src/routes/gpo.ts:235-242`, `packages/api/src/lib/contractPricing.ts`

---

### W3-06: Spend calculator estimate (STATE → CUSTOM → MEDICARE)
- **Actors:** Any authed user (no role gate in route; used by encounter pre-check too).
- **Trigger:** User submits a list of HCPC codes + quantities to estimate projected spend.
- **Entry points:** `POST /api/spend-calculator`, `GET /api/spend-calculator/rate?hcpc=&state=&vendorId=`
- **Permissions / tenant scope:** No `requirePermission`/role gate in the handler (flagged).
- **Steps:** Per line item, `resolveRate` (`spendCalculator.ts:30-73`) applies its **own**
  priority order:
  1. **STATE** — `state_rate_schedule_items` by `(hcpc, state)` not past expiry.
  2. **CUSTOM** — `custom_fee_schedule_items` joined to `custom_fee_schedules` by vendor, within
     `end_date`.
  3. **MEDICARE** — `medicare_fee_schedule_items.non_rural_rate`.
  4. Else `NONE` (rate null, line total 0).
  Aggregates `grandTotal`.
- **State machine:** n/a.
- **Side effects:** None (read-only estimate).
- **⚠ Flagged:** This is a **third distinct order** (STATE → CUSTOM → MEDICARE), independent of
  W3-04 and W3-01.
- **Source:** `packages/api/src/routes/spendCalculator.ts`

---

### W3-07: Manage HCPC reference data + categorize
- **Actors:** Any authed user (search/lookup); ADMIN-tier for bulk import.
- **Trigger:** Code search box; create-order wizard auto-routing; admin code import.
- **Entry points:** `GET /api/hcpc-codes` (search; optional vendor inventory overlay),
  `GET /api/hcpc-codes/:code`, `POST /api/hcpc-codes/categorize`,
  `POST /api/hcpc-codes/bulk` (`rbac('ACCOUNT_MANAGER')`)
- **Permissions / tenant scope:** Search/lookup/categorize are open to any authed user;
  bulk import gated by `rbac('ACCOUNT_MANAGER')` (`hcpcCodes.ts:221`), max 500 codes,
  upsert via `onConflictDoUpdate(code)`.
- **Steps (categorize):** `POST /categorize` (`hcpcCodes.ts:167-202`) batches a DB lookup of
  `hcpc_codes.category`; if a valid stored category exists it wins (`source:'DB'`), else falls
  back to CMS prefix convention `categorizeByPrefix` (E/K→DME, L≤4999→ORTHOTIC, L≥5000→PROSTHETIC,
  A/B/Q/S→SUPPLY, J→PHARMACY, P→LAB, else OTHER). Returns per-code categories, a summary
  rollup, and `recommendedWizard` ('DME' if any DME/ORTHOTIC/PROSTHETIC line, else 'SUPPLY').
- **State machine:** n/a.
- **Side effects:** Bulk import writes `hcpc_codes`.
- **Source:** `packages/api/src/routes/hcpcCodes.ts`

---

### W3-08: Manage ICD-10 reference data
- **Actors:** Any authed user (search/lookup); ADMIN-tier for bulk import.
- **Trigger:** Diagnosis code search; admin code import.
- **Entry points:** `GET /api/icd10-codes` (search, ≥2 chars), `GET /api/icd10-codes/:code`,
  `POST /api/icd10-codes/bulk` (`rbac('ACCOUNT_MANAGER')`)
- **Permissions / tenant scope:** Bulk import gated by `rbac('ACCOUNT_MANAGER')`; max 500;
  upsert via `onConflictDoUpdate(code)`.
- **Steps:** Search filters on `status` (default ACTIVE), code/description LIKE, optional category.
- **State machine:** n/a (codes carry `status` ACTIVE/etc.).
- **Side effects:** Bulk import writes `icd10_codes`.
- **Source:** `packages/api/src/routes/icd10Codes.ts`

---

### W3-09: Build per-facility formulary (with substitutes)
- **Actors:** ACCOUNT_MANAGER, ACCOUNT_MANAGER_USER (treated as admin), FACILITY_ACCOUNT_MANAGER.
- **Trigger:** Hospital supply-chain manager whitelists approved HCPC items for the hospital
  (optionally per facility), with price guardrails, prior-auth flags, restrictions, par levels.
- **Entry points:** `GET /api/formulary`, `POST /api/formulary`, `GET /api/formulary/:id`
  (item + substitutes + vendor names), `PUT /api/formulary/:id`, `DELETE /api/formulary/:id`
  (soft-retire), `POST /api/formulary/:id/substitutes`, `DELETE /api/formulary/:id/substitutes/:subId`,
  `POST /api/formulary/bulk-import`
- **Permissions / tenant scope:** Layered: `rbac(...)` filters which roles may attempt, then
  `requirePermission('formulary', READ|WRITE|FULL)` checks per-user level (DELETE requires FULL).
  Non-admins are pinned to `user.hospitalId`; admins may pass `?hospitalId=`. Facility is
  validated to belong to the hospital. UNIQUE `(hospital, facility, hcpc)` collision → ConflictError.
- **Steps:**
  1. POST sets fields incl. `preferredVendorId`/`secondaryVendorId`, `maxUnitPriceUsd`,
     `requiresPriorAuth`, `isRestricted`, `restrictionReason`, `parLevel`, `reorderQuantity`,
     `status` (must be in `FORMULARY_STATUSES`).
  2. Substitutes carry `priority` (default 10), uppercased substitute HCPC, UNIQUE per item.
  3. DELETE soft-retires (`status='RETIRED'`).
  4. Bulk-import upserts by `(hospitalId, facilityId, hcpcCode)`.
- **State machine:** `FORMULARY_STATUSES = ["ACTIVE","INACTIVE","RETIRED"]`
  (`packages/db/src/schema/formularyItems.ts:22`). No enforced transitions; DELETE forces RETIRED.
- **Side effects:** Writes `formulary_items`, `formulary_substitutes`.
- **Source:** `packages/api/src/routes/formulary.ts`

---

### W3-10: Resolve formulary decision (ON / OFF / RESTRICTED)
- **Actors:** Same as W3-09 (READ); consumed by requisition flow + price-lookup UI.
- **Trigger:** A single HCPC needs an approval decision for a hospital/facility.
- **Entry points:** `GET /api/formulary/resolve?hcpcCode=&facilityId=` (`requirePermission('formulary','READ')`)
- **Steps:** Facility-specific ACTIVE row beats org-wide (`facilityId IS NULL`) row
  (`formulary.ts:477-506`). Decision = `RESTRICTED` if `isRestricted`, else `ON_FORMULARY`;
  no row → `OFF_FORMULARY`. Returns item + ordered substitutes.
- **State machine:** n/a (decision derived, not stored).
- **Side effects:** None.
- **Source:** `packages/api/src/routes/formulary.ts:466-530`

---

### W3-11: Create / edit / delete vendor
- **Actors:** ADMIN (create/delete); ADMIN or the vendor itself (edit own record).
- **Trigger:** Platform admin onboards or maintains a vendor company.
- **Entry points:** `packages/web/src/features/vendors` · `GET /api/vendors`,
  `GET /api/vendors/:id`, `POST /api/vendors`, `PUT /api/vendors/:id`, `DELETE /api/vendors/:id`
- **Permissions / tenant scope:** List/get gated by `requirePermission('vendors','READ')`;
  VENDOR users see only their own record; super-vendor users are scoped to their network
  (`vendors.ts:80-86`). POST/DELETE require ADMIN (`requireAdmin`); PUT allowed for ADMIN or
  the vendor's own `vendorId`. Bodies pass through `stripImmutableFields` (mass-assignment guard).
- **State machine:** n/a.
- **Side effects:** Writes `vendors` (init's order counters to 0 on create).
- **Source:** `packages/api/src/routes/vendors.ts`

---

### W3-12: Onboard vendor + default admin (one-shot)
- **Actors:** ADMIN only.
- **Trigger:** Admin provisions a brand-new vendor plus its first admin user in one call.
- **Entry points:** `POST /api/vendors/onboard`
- **Permissions / tenant scope:** `requireAdmin`.
- **Steps:** Insert `vendors` row → generate temp password → hash → raw-SQL insert a
  `users` row (`role='ADMIN'`, `user_type='VENDOR'`, `approval_status='APPROVED'`,
  `must_change_password=1`) → send Resend welcome email with login + temp password.
  (Note: `npi`/`phone` are dropped — not in vendors schema; `address`→`streetAddress`.)
- **State machine:** n/a (this is the *account* path; the *relationship* lifecycle is W3-13).
- **Side effects:** New vendor + user; outbound email.
- **Related services/crons:** `services/authService` (`hashPassword`), `services/emailService`.
- **Source:** `packages/api/src/routes/vendors.ts:161-231`

---

### W3-13: Vendor onboarding lifecycle (STATE MACHINE)
- **Actors:** ADMIN (ACCOUNT_MANAGER / ACCOUNT_MANAGER_USER) sees all; hospital users scoped to
  their own hospital's onboarding rows.
- **Trigger:** Hospital invites a supplier and walks them through credentialing.
- **Entry points:** `GET /api/vendor-onboarding`, `POST /api/vendor-onboarding/invite`,
  `GET /api/vendor-onboarding/:id` (+ history), `POST /api/vendor-onboarding/:id/advance`,
  `POST /api/vendor-onboarding/:id/mark-doc`, `POST /api/vendor-onboarding/:id/suspend`,
  `POST /api/vendor-onboarding/:id/reactivate`
- **Permissions / tenant scope:** `requirePermission('vendor-onboarding', READ|WRITE|FULL)`;
  suspend/reactivate require FULL. Tenant guard: non-admins blocked if `row.hospitalId` differs.
- **States (exact enum, `packages/db/src/schema/vendorOnboarding.ts:18-21`):**
  `INVITED`, `DOCS_PENDING`, `DOCS_RECEIVED`, `CREDENTIALED`, `APPROVED`, `ACTIVE`, `SUSPENDED`.
- **Linear advance map (`vendorOnboarding.ts:35-43`):**
  `INVITED → DOCS_PENDING → DOCS_RECEIVED → CREDENTIALED → APPROVED → ACTIVE`;
  `ACTIVE` and `SUSPENDED` have `null` (no auto-next).
- **Doc types enum:** `W9, COI, OIG_ATTESTATION, DMEPOS, MSA, BAA, ACCREDITATION`
  (default required set on invite: `['W9','COI','OIG_ATTESTATION','MSA']`).
- **Steps / transitions:**
  1. `invite` creates an `INVITED` row (UNIQUE per (vendor, hospital)); writes history.
  2. `advance` bumps to `NEXT[state]`; stamps `credentialedAt`/`approvedAt`/`activatedAt`;
     409 if no next.
  3. `mark-doc` toggles a received doc and **auto-advances**: `INVITED → DOCS_PENDING` on first
     doc; `DOCS_PENDING → DOCS_RECEIVED` when all required docs present.
  4. `suspend` (FULL) moves any state → `SUSPENDED` with reason.
  5. `reactivate` (FULL) `SUSPENDED → ACTIVE` only.
  - Every transition appends a `vendor_onboarding_history` row.
- **Side effects:** Writes `vendor_onboarding_states` + `vendor_onboarding_history`.
- **Source:** `packages/api/src/routes/vendorOnboarding.ts`; enums in
  `packages/db/src/schema/vendorOnboarding.ts`

---

### W3-14: Define vendor coverage (geo + HCPC/category matrix)
- **Actors:** HOSPITAL / PROVIDER users (own hospital); ADMIN (via `?hospitalId=`). VENDOR → 403.
- **Trigger:** Hospital asks "which of my preferred vendors serve which facility (and which
  item categories)?"
- **Entry points:** `packages/web/src/features/vendorCoverage` · `GET /api/vendor-coverage`
  (three shapes): `?facilityId=&vendorId=` (narrow), `?facilityId=` (per-facility),
  no params (full facility×vendor matrix); opt-in `?byCategory=1` adds per-category ranking.
- **Permissions / tenant scope:** `resolveHospitalId` (`vendorCoverage.ts:298-313`) — VENDOR 403;
  hospital/provider use own JWT hospitalId; ADMIN requires `?hospitalId=`.
- **Steps:** Load all `hospital_vendors` for the hospital → vendors + `vendor_locations` →
  evaluate each location's `servesFacility` by state-match or zip-prefix-match
  (`evaluateLocation`); build summaries; in `byCategory` mode rank vendors per
  `(facility, category)` by `hospital_vendors.priority`, serving branches, then best SLA, with
  an active-SKU-count overlay (`hasSkuMapping`/`skuCount`). Categories from `ITEM_CATEGORIES`
  (`lib/vendorRouting.ts:51-60`): WOUND_CARE, ORTHOTICS, PROSTHETICS, BIOLOGICS, DME, IMPLANTS,
  CONSUMABLES, GENERAL.
- **State machine:** n/a (read-side aggregation).
- **Side effects:** None.
- **Related services/crons:** `lib/vendorRouting.ts` (shared with the routing engine).
- **Source:** `packages/api/src/routes/vendorCoverage.ts`

---

### W3-15: Manage vendor locations (branches)
- **Actors:** ADMIN (any); VENDOR (own). HOSPITAL read-only (linked vendors, active only).
- **Trigger:** Vendor maintains warehouse/fitting-center/HQ/distribution branches with service
  geography and SLA.
- **Entry points:** `GET /api/vendor-locations`, `GET /api/vendor-locations/:id`,
  `POST /api/vendor-locations`, `PUT /api/vendor-locations/:id`, `DELETE /api/vendor-locations/:id`
- **Permissions / tenant scope:** `assertVendorScope` (`vendorLocations.ts:45-49`). HOSPITAL must
  pass `?vendorId=` with a `hospital_vendors` link (else 403); sees active only.
- **Steps:** Location type ∈ `{WAREHOUSE, FITTING_CENTER, HEADQUARTERS, DISTRIBUTION_HUB}`;
  `capabilities`/`serviceStates`/`serviceZipPrefixes` normalized to JSON arrays; setting
  `isPrimary` clears other primaries for that vendor. DELETE is a hard delete.
- **State machine:** n/a.
- **Side effects:** Writes `vendor_locations`; feeds W3-14 coverage and W3-17/W3-18 stock-feed
  location validation.
- **Source:** `packages/api/src/routes/vendorLocations.ts`

---

### W3-16: Configure vendor ERP push connector
- **Actors:** ADMIN, VENDOR (own), SUPER_VENDOR. HOSPITAL/PROVIDER → 403.
- **Trigger:** Vendor wires Curavend order events out to its ERP.
- **Entry points:** `GET /api/vendor-erp-connectors`, `GET /api/vendor-erp-connectors/:id`,
  `POST /api/vendor-erp-connectors`, `PUT /api/vendor-erp-connectors/:id`,
  `DELETE /api/vendor-erp-connectors/:id`, `POST /api/vendor-erp-connectors/:id/test-push`,
  `GET /api/vendor-erp-connectors/push-log/recent`
- **Permissions / tenant scope:** `assertWriteScope` (`vendorErpConnectors.ts:53-58`).
  push-log scoped to own connector IDs for vendors; hospital/provider 403.
- **Steps:** `connectorType ∈ {HTTP_POST, WEBHOOK_POST, EDI_850, MANUAL}`;
  `triggerEvent ∈ {NEW_ORDER, VENDOR_ASSIGNED, VENDOR_CONFIRMED_RECEIPT,
  PATIENT_VISITED_AND_ASSESSED, DELIVERED, PROOF_UPLOADED, ORDER_COMPLETED}`
  (default `VENDOR_CONFIRMED_RECEIPT`); `config` validated as JSON. `test-push` is KV
  rate-limited (1/30 s per connector), picks the vendor's most recent order (or body `orderId`),
  forces the connector's trigger, runs `pushOrderToErp`, and reports the per-connector result.
- **State machine:** n/a (`isActive` flag).
- **Side effects:** Writes `vendor_erp_connectors`; test-push writes `vendor_erp_push_log` and
  fires an outbound HTTP push.
- **Related services/crons:** `jobs/pushOrderToErp`. Credential secrets resolved by env-var
  ref (`authSecretRef` → Worker secret; see `services/connectionRegistry.ts:resolveSecret`).
- **Source:** `packages/api/src/routes/vendorErpConnectors.ts`

---

### W3-17: Configure vendor stock connector + poll live stock
- **Actors:** ADMIN, VENDOR (own), SUPER_VENDOR. HOSPITAL/PROVIDER → 403.
- **Trigger:** Vendor exposes a live-stock feed; scheduled cron + manual triggers ingest it.
- **Entry points:** `GET /api/vendor-stock-connectors`, `GET /api/vendor-stock-connectors/:id`,
  `POST /api/vendor-stock-connectors`, `PUT /api/vendor-stock-connectors/:id`,
  `DELETE /api/vendor-stock-connectors/:id` (soft delete), `POST /api/vendor-stock-connectors/:id/test-poll`,
  `POST /api/vendor-stock-connectors/run-all-now` (ADMIN only), `GET /api/vendor-stock-connectors/:id/log`
- **Permissions / tenant scope:** `assertConnectorWriteScope` (`vendorStockConnectors.ts:32-37`);
  `run-all-now` ADMIN-only.
- **Steps:** `connectorType ∈ {HTTP_POLL, WEBHOOK, EDI_846, MANUAL}`; HTTP_POLL/WEBHOOK require
  `endpointUrl`; `pollIntervalMinutes` ≥ 1 (default 15). `runHttpPollConnector` fetches via
  `safeFetch` (SSRF-guarded), validates each row's `locationId` belongs to the vendor, and
  **upserts** `vendor_stock_snapshots` on `(vendorId, vendorLocationId, vendorSku)`; updates
  connector `lastPolledAt/lastSuccessAt/lastError`; writes a `vendor_stock_feed_log` row
  (OK/PARTIAL/FAILED).
- **State machine:** n/a.
- **Side effects:** Writes snapshots, connector status, feed log; outbound HTTP fetch.
- **Related services/crons:** `runAllStockPolls` runs on cron `*/15 * * * *`
  (`index.ts:338, 353-363`). `lib/safeFetch`.
- **Source:** `packages/api/src/routes/vendorStockConnectors.ts`

---

### W3-18: Ingest vendor stock-feed webhook (PUBLIC, HMAC)
- **Actors:** External vendor systems (no JWT). This is the only unauthenticated domain route.
- **Trigger:** Vendor pushes a stock snapshot to Curavend.
- **Entry points:** `POST /api/stock-feeds/:vendorId/webhook`
- **Permissions / tenant scope:** No JWT. Authenticated by HMAC-SHA256 over the **raw body**
  using the connector's `authSecretRef` Worker secret; constant-time compare. Requires headers
  `X-Curavend-Signature` (hex) and `X-Curavend-Timestamp` (ISO; rejected if drift > 5 min).
  Must have an active `WEBHOOK` connector for the vendor (else 404).
- **Steps:** Verify timestamp window → find active WEBHOOK connector → resolve secret → verify
  HMAC → parse JSON rows → validate `locationId` belongs to vendor → upsert
  `vendor_stock_snapshots` (`source='WEBHOOK'`) → bump connector + write `vendor_stock_feed_log`.
- **State machine:** n/a.
- **Side effects:** Writes snapshots + feed log; updates connector status.
- **Source:** `packages/api/src/routes/stockFeeds.ts`

---

### W3-19: Link hospital ↔ vendor (preference rows)
- **Actors:** Hospital users (scoped to own hospital); Vendor users (scoped to own vendor for
  reads); platform users for cross-tenant filtering.
- **Trigger:** Hospital establishes a preferred-vendor relationship, optionally per facility
  and per item-category, with priority, contract rate, fee schedule, consignment closet, contract.
- **Entry points:** `GET /api/hospital-vendors`, `GET /api/hospital-vendors/:id`,
  `POST /api/hospital-vendors`, `PUT /api/hospital-vendors/:id`, `DELETE /api/hospital-vendors/:id`
- **Permissions / tenant scope:** List auto-scopes HOSPITAL→own hospitalId, VENDOR→own vendorId
  (`hospitalVendors.ts:59-63`). (POST/PUT/DELETE have no explicit per-tenant guard beyond auth —
  flagged.) Requires `hospitalId`, `vendorId`, `providerId` on create. Uniqueness enforced on
  `(hospital, vendor, COALESCE(facility,''), COALESCE(itemCategories,''))` → ConflictError.
- **Steps:** Create normalizes `itemCategories` to an uppercased JSON array; `priority` default 100;
  `state` default `'Active'`. PUT patches rate/fee-schedule/closet/state/contract/facility/
  priority/categories.
- **State machine:** n/a (`state` free-form string, default 'Active').
- **Side effects:** Writes `hospital_vendors`. This table drives W3-01 catalog scope, W3-14
  coverage ranking, and W3-04 contract pricing eligibility.
- **Source:** `packages/api/src/routes/hospitalVendors.ts`

---

### W3-20: Super-vendor aggregation (parent org)
- **Actors:** ADMIN (ACCOUNT_MANAGER) for create/delete/assign; SUPER_VENDOR users (own org).
- **Trigger:** A corporate parent owns multiple vendor subsidiaries.
- **Entry points:** `GET /api/super-vendors`, `GET /api/super-vendors/:id` (+ subsidiaries),
  `POST /api/super-vendors` (`rbac('ACCOUNT_MANAGER')`), `PUT /api/super-vendors/:id`,
  `DELETE /api/super-vendors/:id` (`rbac`), `GET /api/super-vendors/:id/vendors`,
  `POST /api/super-vendors/:id/vendors/:vendorId` (assign, `rbac`),
  `DELETE /api/super-vendors/:id/vendors/:vendorId` (unassign, `rbac`),
  `POST /api/super-vendors/:id/invite-admin` (`rbac`)
- **Permissions / tenant scope:** SUPER_VENDOR users are pinned to their own `superVendorId`
  on reads/PUT. Mutations require `rbac('ACCOUNT_MANAGER')`.
- **Steps:** Assign/unassign set/clear `vendors.super_vendor_id`. Delete **disassociates**
  subsidiaries (sets their `super_vendor_id = NULL`) rather than deleting them.
  `invite-admin` raw-SQL-inserts a `users` row (`user_type='VENDOR'`, `role='SUPER_VENDOR'`,
  temp password, `must_change_password=1`) and emails credentials.
- **State machine:** n/a.
- **Side effects:** Writes `super_vendors`, mutates `vendors.super_vendor_id`, creates users,
  outbound email. Super-vendor scope is consumed across W3-02/W3-16/W3-17.
- **Source:** `packages/api/src/routes/superVendors.ts`

---

### W3-21: Set up GPO organization + membership tier
- **Actors:** ACCOUNT_MANAGER / ACCOUNT_MANAGER_USER (org + item CRUD); FACILITY_ACCOUNT_MANAGER
  may set their own hospital's membership; any authed user may list GPOs.
- **Trigger:** Admin defines a GPO (Vizient/Premier/HealthTrust/…) and loads its negotiated
  rates; a hospital is attached to a GPO tier.
- **Entry points:** `GET /api/gpo/organizations`, `POST /api/gpo/organizations` (`rbac`),
  `GET /api/gpo/organizations/:id` (+ counts), `GET /api/gpo/organizations/:id/items`,
  `POST /api/gpo/organizations/:id/items` (bulk upsert, `rbac`),
  `DELETE /api/gpo/organizations/:id/items/:itemId` (`rbac`),
  `PUT /api/gpo/hospital-membership` (`rbac` incl. FACILITY_ACCOUNT_MANAGER),
  `GET /api/gpo/resolve-rate` (see W3-05)
- **Permissions / tenant scope:** Item/org writes `rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER')`.
  Membership write also allows FACILITY_ACCOUNT_MANAGER but guards them to their own hospitalId.
- **GPO kinds enum (`packages/db/src/schema/gpoOrganizations.ts:9`):**
  `VIZIENT, PREMIER, HEALTHTRUST, INTALERE, CAPSTONE, OTHER`.
- **Steps:** Create org (name + valid kind). Bulk item upsert keyed on
  `(gpo, hcpc, effectiveStartDate, vendorId-or-NULL)`; each item needs `hcpcCode`, numeric
  `rateUsd`, `effectiveStartDate`. Membership sets `hospitals.gpoOrganizationId`/`gpoMemberId`.
- **State machine:** n/a.
- **Side effects:** Writes `gpo_organizations`, `gpo_contract_items`, `hospitals` membership cols.
- **Source:** `packages/api/src/routes/gpo.ts`; enum in
  `packages/db/src/schema/gpoOrganizations.ts`

---

## § Pricing Fallback Chains (diagram)

There are **three live price-resolution paths** plus one documented ideal. They do **not** all
agree — this is a real source inconsistency, flagged here rather than invented.

**1. Documented IDEAL cascade** (comment in `lib/contractPricing.ts:1-12`, not fully wired):

```
1. CONTRACT       hospital+vendor active contract item match
2. GPO_CONTRACT   hospital's GPO rate (Vizient/Premier/HealthTrust)
3. FEE_SCHEDULE   customFeeSchedule on hospital_vendors
4. MEDICARE       medicare_fee_schedule_items by HCPC
5. MANUAL         vendor fills at invoice time
   (module implements steps 1 & 2; caller is expected to handle 3-5)
```

**2. ACTUAL — `GET /api/pricing/rate` & `/rates/bulk`** (W3-04, `pricing.ts`):

```
CONTRACT  ──found?──►  return CONTRACT
   │ no
   ▼
MEDICARE  ──found?──►  return MEDICARE
   │ no
   ▼
return { rate: null, source: null }
```
> GPO and fee-schedule are NOT consulted here. Header comment: fee schedules "applied at
> invoice time… not exposed here for v1."

**3. ACTUAL — catalog price overlay** (W3-01, `catalog.ts`, hospital users only):

```
CONTRACT (getContractRatesBulk) ──found?──► priceSource = CONTRACT
   │ no
   ▼
listPriceCents on the SKU            ──────► priceSource = LIST
```
> Catalog never consults Medicare or GPO.

**4. ACTUAL — spend calculator** (W3-06, `spendCalculator.ts`):

```
STATE  (state_rate_schedule_items)        ──found?──► STATE
   │ no
   ▼
CUSTOM (custom_fee_schedule_items/vendor) ──found?──► CUSTOM
   │ no
   ▼
MEDICARE (non_rural_rate)                 ──found?──► MEDICARE
   │ no
   ▼
NONE (rate null, lineTotal 0)
```

**GPO** is only reachable via the standalone `getGpoRate` helper, surfaced by
`GET /api/gpo/resolve-rate` (W3-05) — it is not chained into pricing.rate.

---

## § Vendor Onboarding State Machine (diagram)

Enum (`packages/db/src/schema/vendorOnboarding.ts:18-21`):
`INVITED, DOCS_PENDING, DOCS_RECEIVED, CREDENTIALED, APPROVED, ACTIVE, SUSPENDED`.

```
                    (mark-doc: first doc)
   INVITED ───────────────────────────────► DOCS_PENDING
      │  advance                                  │  advance
      └────────────────────────────────────►     │  OR (mark-doc: all required docs in)
                                                  ▼
                                            DOCS_RECEIVED
                                                  │ advance  (stamps credentialedAt)
                                                  ▼
                                            CREDENTIALED
                                                  │ advance  (stamps approvedAt)
                                                  ▼
                                              APPROVED
                                                  │ advance  (stamps activatedAt)
                                                  ▼
                                               ACTIVE  ── (terminal for advance: NEXT=null)

   any non-terminal ──suspend (FULL, reason)──►  SUSPENDED
   SUSPENDED ──────reactivate (FULL)──────────►  ACTIVE
```

- `advance` follows the linear `NEXT` map only (no skipping). `mark-doc` provides the two
  auto-advances noted above. `suspend` is reachable from any state and is rejected if already
  SUSPENDED; `reactivate` is the only way out of SUSPENDED and only targets ACTIVE.
- Every transition appends a `vendor_onboarding_history` row (from/to/by-user/note/timestamp).

---

## Unresolved / flagged items

1. **Pricing tier disagreement** — the brief's "4-tier (Contract → Fee schedule → Medicare →
   Manual/list)" matches **none** of the three live paths exactly. Documented in §Pricing above.
2. **Catalog "APPROVED" relationship** — `catalog.ts` comment says hospitals see SKUs of
   vendors with an APPROVED `hospital_vendors` link, but the query filters only on `hospitalId`
   (no `state='Active'/'APPROVED'` predicate). `hospital_vendors.state` defaults to `'Active'`
   (free-form string, not an enum) — there is no APPROVED status check.
3. **Missing per-tenant write guards (potential IDOR)** — `hospital-vendors` POST/PUT/DELETE,
   `gpo/resolve-rate`, and `spend-calculator` lack explicit ownership/role checks beyond
   global `authMiddleware`. Flagged for security review, not changed.
4. `vendors/onboard` silently drops `npi`/`phone` (absent from the `vendors` schema).

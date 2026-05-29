# Contracts, Finance & Procurement — Workflow Reference

This reference documents every workflow in the **Contracts, Finance & Procurement** domain of the Curavend healthcare supply-chain platform (Cloudflare Workers + Hono + Drizzle/D1 monorepo). It covers the contract lifecycle state machine, buyer-side and supplier-side purchase orders, the invoice lifecycle (creation → emailing → payment), three-way matching with exception resolution and rule-based auto-resolution, goods receiving (GRN) with damaged-line/RMA/backorder/lab-lot/GL side effects, department budgets with encumbrance accounting, the general-ledger posting ledger, department-spend and procurement analytics reporting, payor contracts with an eligibility-check stub, and consignment closet management.

Endpoint mount prefixes are taken from `packages/api/src/index.ts` (lines 223–286). All routes sit behind the global auth middleware; per-resource gates use either `requirePermission(resource, level)`, `rbac(...roles)`, or inline tenant-scope helpers as noted per workflow. Roles referenced: `ACCOUNT_MANAGER` / `ACCOUNT_MANAGER_USER` (platform admin), `FACILITY_ACCOUNT_MANAGER` / `_USER` (hospital manager), `FACILITY_USER`, `PHYSICIAN`, plus the `userType` personas `ADMIN` / `HOSPITAL` / `VENDOR` / `PROVIDER` / `SUPER_VENDOR`.

> Scope note: `spend-by-physician` is mounted under `/api/reporting` but lives in `packages/api/src/routes/reporting.ts` (owned by the Reporting domain), not in the procurementAnalytics file. It is documented here (W4-19) because it was in this domain's brief; cross-reference the Reporting domain doc for the canonical owner.

## Workflow index

- **W4-01** — Create contract (DRAFT)
- **W4-02** — Manage contract line items (DRAFT working set)
- **W4-03** — AI PDF line-item extraction (suggestion only)
- **W4-04** — Contract lifecycle transitions (submit / withdraw / approve / reject / request-changes / reopen / terminate)
- **W4-05** — Contract amendment (clone ACTIVE → new DRAFT, supersede on approval)
- **W4-06** — Contract expiry / auto-activate cron (daily)
- **W4-07** — Contract revisions & history (read-only audit)
- **W4-08** — Custom fee schedules (legacy pricing)
- **W4-09** — Customer purchase order (buyer-side PO) create/update/close
- **W4-10** — Purchase order create + issue/transmit + ACK (supplier-side)
- **W4-11** — Create invoice from completed order
- **W4-12** — Invoice lifecycle: confirm spend → generate → send → mark-paid
- **W4-13** — Invoice payment via Stripe Checkout
- **W4-14** — Invoice CSV export + bulk payment import
- **W4-15** — Record goods receipt (full / partial / damaged) + post
- **W4-16** — Three-way match run + exception resolution
- **W4-17** — Invoice match auto-resolution rules (CRUD + preview)
- **W4-18** — Department budgets: set + spend-validation gate + encumbrance
- **W4-19** — GL posting ledger + ERP export
- **W4-20** — Department-spend dashboard (budget burn-down)
- **W4-21** — Procurement analytics (price variance, charge-capture leakage, clinical consumption, hospital forecast, vendor scorecard)
- **W4-22** — Spend-by-physician report
- **W4-23** — Payor contracts + eligibility check (stub)
- **W4-24** — Consignment closet management (par/on-hand, cycle count)

---

## Contract lifecycle state machine

States (exact enum, `packages/db/src/schema/contracts.ts:71-80`):

```
DRAFT · PENDING_APPROVAL · APPROVED · ACTIVE · EXPIRED · TERMINATED · REJECTED · SUPERSEDED
```

Transitions (from `packages/api/src/lib/contractTransitions.ts` + `cron/contractLifecycle.ts`):

```
                       create (POST /)
                           │
                           ▼
                        ┌──────┐  submit                 ┌──────────────────┐
                        │DRAFT │ ───────────────────────▶│ PENDING_APPROVAL │
              ┌────────▶│      │◀──────────────────────  │                  │
              │         └──────┘  withdraw (drafter)      └──────────────────┘
              │            ▲          request-changes (reviewer, w/ comment)  │
   reopen     │            └──────────────────────────────────────────────────┘
 (REJECTED→   │                                                  │
   DRAFT)     │              approve (reviewer)                  │ reject (reviewer)
              │            ┌──────────────┬──────────┐           ▼
              │            │              │          │        ┌──────────┐
              │   startDate>today    startDate≤today │        │ REJECTED │
              │     & inRange          & inRange     │        └──────────┘
              │            ▼              ▼           │             │ (delete allowed)
              │       ┌─────────┐    ┌────────┐       │             └──reopen──▶ DRAFT
              │       │APPROVED │    │ ACTIVE │       │
              │       └─────────┘    └────────┘
              │            │              │   amend ─▶ new DRAFT (parent → SUPERSEDED on child approve)
              │   cron:    │              │
              │ start≤today│              │ terminate (ACTIVE or APPROVED) ─▶ TERMINATED
              │            ▼              │
              │       ┌────────┐         │ cron: endDate<today
              └       │ ACTIVE │◀────────┘            ▼
                      └────────┘                  ┌─────────┐
                           │  cron: endDate<today │ EXPIRED │
                           └─────────────────────▶└─────────┘
```

Key rules:
- `approve` chooses `ACTIVE` when `startDate ≤ today ≤ endDate`, else `APPROVED` (`contractTransitions.ts:155`).
- `terminate` is allowed from `ACTIVE` **or** `APPROVED` (`contractTransitions.ts:296`).
- `request-changes` returns the contract to `DRAFT` (not a distinct state) and stamps the revision `reviewDecision='CHANGES_REQUESTED'`.
- `withdraw` (`PENDING_APPROVAL → DRAFT`) is drafter/admin only; `reopen` (`REJECTED → DRAFT`) is drafter/admin only.
- Revision `reviewDecision` values: `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`.

## Three-way-match decision flow

From `packages/api/src/services/threeWayMatchService.ts`. Per invoice line, keyed on HCPC code. `MATCH_STATUSES` (`schema/threeWayMatches.ts:25-33`): `PERFECT · QTY_VARIANCE · PRICE_VARIANCE · NO_RECEIPT · NO_PO · CONDITION_BAD · AMBIGUOUS`. Price tolerance hardcoded at 2% (`PRICE_TOLERANCE_PCT = 0.02`).

```
For each invoice line (by HCPC):
  ├─ matching PO line count == 0 ?  ──▶ NO_PO
  ├─ matching PO line count > 1 ?   ──▶ AMBIGUOUS (poQty = sum)
  └─ exactly 1 PO line:
        any goods-receipt line for HCPC?
          ├─ no  ──▶ NO_RECEIPT
          └─ yes:
               qtyVariance = invoiceQty − receivedQty
                 ≠ 0  ──▶ QTY_VARIANCE
               priceVariancePct = |invUnit − poUnit| / poUnit
                 > 2% ──▶ PRICE_VARIANCE        (poUnit currently falls back to invoice unit price)
               worst receipt condition ≠ GOOD ──▶ CONDITION_BAD
               else ──▶ PERFECT
```

Anything not `PERFECT` lands on the exceptions queue (`GET /exceptions`). Manual resolution sets `resolution ∈ {ACCEPTED, DISPUTED, OVERRIDDEN}`. Re-running a match deletes prior rows for the invoice (idempotent). The auto-resolution rules engine (W4-17) is a separate, currently un-wired preview path that compares PO total vs invoice total against tolerance rules.

---

### W4-01: Create contract (DRAFT)
- **Actors:** Hospital manager, Vendor, Admin, Provider, Super-vendor
- **Trigger:** User starts the "Create Contract" wizard.
- **Entry points:** `packages/web/src/features/contractPricing` · `POST /api/contracts`
- **Permissions / tenant scope:** Any authenticated persona with a tenant id. Caller's tenant is force-bound: HOSPITAL→`hospitalId`, VENDOR→`vendorId`, PROVIDER→`providerId`, SUPER_VENDOR→`superVendorId`; `initiatedBy` derived from persona (HOSPITAL/VENDOR/ADMIN; PROVIDER & SUPER_VENDOR map to ADMIN). Others → 403.
- **Steps:** 1) Validate `startDate` + `endDate` required. 2) Resolve tenant binding + `initiatedBy`. 3) Insert `contracts` row with `status='DRAFT'`. 4) Write `contractHistory` "created" entry.
- **State machine:** Creates at `DRAFT`.
- **Side effects:** `contractHistory` audit row.
- **Related services/crons:** `lib/contractAccess.ts`
- **Source:** `packages/api/src/routes/contracts.ts:145-211`

### W4-02: Manage contract line items (DRAFT working set)
- **Actors:** Contract drafter / owner tenant, Admin
- **Trigger:** Editing items on a DRAFT contract.
- **Entry points:** `contractPricing` detail page · `GET/POST /api/contracts/:id/items`, `PUT/DELETE /api/contracts/:id/items/:itemId`
- **Permissions / tenant scope:** `assertContractAccess(user, contract, 'read'|'write')`. All mutations require `status === 'DRAFT'` (else ValidationError). Each item needs `hcpcCode` + `negotiatedRate`.
- **Steps:** Add/edit/delete `contractItems` rows; bump `contracts.updatedAt`.
- **State machine:** n/a (only mutable in DRAFT).
- **Side effects:** none beyond `updatedAt` bump.
- **Related services/crons:** `lib/contractAccess.ts`
- **Source:** `packages/api/src/routes/contracts.ts:417-518`

### W4-03: AI PDF line-item extraction (suggestion only)
- **Actors:** Contract drafter / owner tenant
- **Trigger:** User uploads/renders a contract PDF page to PNG and requests AI suggestions.
- **Entry points:** `contractPricing` wizard · `POST /api/contracts/:id/extract-from-pdf`
- **Permissions / tenant scope:** `assertContractAccess(... 'write')`; DRAFT only; requires `imageBase64`/`base64` body.
- **Steps:** Validate DRAFT + image present → `extractContractItemsFromPdf(env, imageBase64)` (Workers AI) → return `{ suggestions }`. **Never persists** — caller decides whether to save via W4-02.
- **State machine:** n/a
- **Side effects:** Workers AI inference call; no DB write.
- **Related services/crons:** `services/aiService.ts` (`extractContractItemsFromPdf`)
- **Source:** `packages/api/src/routes/contracts.ts:669-691`

### W4-04: Contract lifecycle transitions
- **Actors:** Drafter (submit/withdraw/reopen), Reviewer = counterparty/admin (approve/reject/request-changes), either party/admin (terminate)
- **Trigger:** Buttons on the contract detail page.
- **Entry points:** `contractPricing` detail · `POST /api/contracts/:id/{submit,withdraw,approve,reject,request-changes,reopen,terminate}`
- **Permissions / tenant scope:** `assertContractAccess` for drafter actions; `assertCanReviewContract` for reviewer actions. `request-changes` requires a non-empty `comment`; `reject`/`terminate` accept an optional `reason`.
- **Steps (submit):** Verify DRAFT → require ≥1 line item → snapshot items into a new `contractRevisions` row (next `revisionNumber`) → set `status='PENDING_APPROVAL'`, `currentRevisionId` → history + `notifyContractEvent('submitted')`.
- **State machine (exact):** `DRAFT→PENDING_APPROVAL` (submit); `PENDING_APPROVAL→DRAFT` (withdraw, request-changes); `PENDING_APPROVAL→APPROVED|ACTIVE` (approve, depending on dates); `PENDING_APPROVAL→REJECTED` (reject); `REJECTED→DRAFT` (reopen); `ACTIVE|APPROVED→TERMINATED` (terminate). See state-machine diagram above.
- **Side effects:** `contractRevisions` snapshot/stamp (`reviewDecision`/`reviewComment`); `contractHistory` rows; `notifyContractEvent` events: `submitted`, `approved`, `rejected`, `changes_requested`, `terminated`. On approve of an amendment, parent → `SUPERSEDED` (+ history).
- **Related services/crons:** `lib/contractTransitions.ts`, `queues/contractNotifications.ts`
- **Source:** `packages/api/src/routes/contracts.ts:524-581`; `packages/api/src/lib/contractTransitions.ts:52-316`

### W4-05: Contract amendment
- **Actors:** Owner tenant / Admin
- **Trigger:** "Amend" on an ACTIVE contract.
- **Entry points:** `contractPricing` detail · `POST /api/contracts/:id/amend`
- **Permissions / tenant scope:** `assertContractAccess(... 'write')`; parent must be `ACTIVE`.
- **Steps:** Clone parent into a new `DRAFT` contract (`name + " (Amendment)"`, `parentContractId = parent.id`), copy all `contractItems`, write history. Returns `201` with `{ id, parentContractId }`. On later approval of the child, parent transitions `→ SUPERSEDED` (W4-04 approve path).
- **State machine:** new contract starts `DRAFT`; parent stays `ACTIVE` until child approval → `SUPERSEDED`.
- **Side effects:** copied items, `contractHistory`.
- **Related services/crons:** `lib/contractTransitions.ts`
- **Source:** `packages/api/src/lib/contractTransitions.ts:322-376`; route `contracts.ts:576-581`

### W4-06: Contract expiry / auto-activate cron (daily)
- **Actors:** System (cron)
- **Trigger:** Cloudflare cron schedule `0 8 * * *` (`index.ts:366-372`).
- **Entry points:** `handleContractLifecycle(env)`
- **Permissions / tenant scope:** System; `changedByUserId=null`, `SYSTEM_USER_ID='cron-contract-lifecycle'`.
- **Steps:** 1) `APPROVED → ACTIVE` where `startDate ≤ today` (+ history "Auto-activated"). 2) `ACTIVE → EXPIRED` where `endDate < today` (+ history "Auto-expired" + `notifyContractEvent('expired')`). 3) Expiring reminders at exactly 30/14/7 days before `endDate` for `ACTIVE` contracts → `notifyContractEvent('expiring')` (daily, not de-duped across days — intentional).
- **State machine:** `APPROVED→ACTIVE`, `ACTIVE→EXPIRED`.
- **Side effects:** `contractHistory` rows; `expired` + `expiring` notifications.
- **Related services/crons:** `cron/contractLifecycle.ts`, `queues/contractNotifications.ts`
- **Source:** `packages/api/src/cron/contractLifecycle.ts:23-102`; registration `index.ts:371`

### W4-07: Contract revisions & history (read-only audit)
- **Actors:** Any tenant with read access
- **Trigger:** Viewing the revisions/history tabs.
- **Entry points:** `contractPricing` detail · `GET /api/contracts/:id/revisions`, `GET /api/contracts/:id/revisions/:revId`, `GET /api/contracts/:id/history`
- **Permissions / tenant scope:** `assertContractAccess(... 'read')`.
- **Steps:** List revisions (joined submitter email, review decision/comment); fetch a single revision with parsed `itemsSnapshot`; list narrative history (joined changer email).
- **State machine:** n/a
- **Side effects:** none (read-only).
- **Source:** `packages/api/src/routes/contracts.ts:587-666`

### W4-08: Custom fee schedules (legacy pricing)
- **Actors:** Admin (any vendor), Vendor (own vendor); Hospital/Super-vendor read-only-scoped
- **Trigger:** Managing legacy fee schedules.
- **Entry points:** `contractPricing` · `GET/POST /api/contracts/fee-schedules`, `GET /api/contracts/fee-schedules/:id`, `GET/POST /api/contracts/fee-schedules/:id/items`, `PUT/DELETE /api/contracts/fee-schedules/:id/items/:itemId`
- **Permissions / tenant scope:** List scoped: VENDOR→own; HOSPITAL→vendors it has contracts with; SUPER_VENDOR→its vendors; others empty. Writes via `assertFeeScheduleWriteAccess` (ADMIN any, VENDOR own).
- **Steps:** CRUD on `customFeeSchedules` + `customFeeScheduleItems` (`rate`/`price` aliasing).
- **State machine:** n/a
- **Side effects:** none beyond CRUD.
- **Source:** `packages/api/src/routes/contracts.ts:218-411`

### W4-09: Customer purchase order (buyer-side PO)
- **Actors:** Hospital user, Admin
- **Trigger:** Hospital raises an internal PO with an authorized-spend cap; multiple Curavend orders bill against it.
- **Entry points:** `packages/web/src/features/customerPurchaseOrders` · `GET/POST /api/customer-purchase-orders`, `GET/PUT /api/customer-purchase-orders/:id`, `POST /api/customer-purchase-orders/:id/close`, `DELETE /api/customer-purchase-orders/:id`
- **Permissions / tenant scope:** `assertHospitalScope` — ADMIN any; HOSPITAL only own `hospitalId`; others 403/empty. Create requires `poNumber` + `poDate`; unique PO number per hospital (UNIQUE-violation → friendly ValidationError).
- **Steps:** Create (`status='OPEN'`, `authorizedAmount`, `spentAmount=0`, optional `expiresAt`). Detail returns linked `orders` (via `orders.customerPurchaseOrderId`). Update mutable fields. Close → `EXHAUSTED` (default) or `CANCELLED`. Delete only when no linked orders.
- **State machine:** `OPEN → EXHAUSTED | CANCELLED` (close); delete blocked if linked orders exist.
- **Side effects:** none (spend roll-up tracked on `spentAmount` column).
- **Source:** `packages/api/src/routes/customerPurchaseOrders.ts:24-211`

### W4-10: Purchase order create + issue/transmit + ACK (supplier-side)
- **Actors:** Hospital user / Admin (create + transmit), Vendor (ACK only)
- **Trigger:** Issuing a PO to a vendor.
- **Entry points:** `packages/web/src/features/purchaseOrders` · `GET/POST /api/purchase-orders`, `GET/PUT/DELETE /api/purchase-orders/:id`, `POST /api/purchase-orders/:id/transmit`, `POST /api/purchase-orders/:id/ack`, `GET /api/purchase-orders/:id/transmission-log`, `GET /api/purchase-orders/:id/export.csv`
- **Permissions / tenant scope:** `requirePermission('purchase-orders', READ|WRITE|FULL)` + `assertPoTenant` (admin any; vendor/super-vendor/hospital by matching id). Vendors cannot create or transmit POs (they only ACK). DELETE requires `FULL`. PUT blocks patching transmission columns + tenant ids.
- **Steps (transmit):** `transmitPo(env, id, {method, byUserId})` picks method from body → vendor `preferredPoTransmissionMethod` → `EMAIL`. Marks `SENDING`, runs adapter (EDI 850 / API / cXML PunchOut / Email / Portal stubs), writes a `po_transmission_log` row, sets terminal `SENT`/`FAILED`. **On first successful send only**, posts the `PO_COMMIT` GL journal. ACK flips `SENT → ACKED` (vendor/admin only).
- **State machine (transmissionState, `schema/purchaseOrders.ts:9-12`):** `NOT_SENT → SENDING → SENT | FAILED`; `SENT → ACKED`. Transmission methods (`PO_TRANSMISSION_METHODS`): `EDI · API · PUNCHOUT · EMAIL · PORTAL`. PO header `status` defaults to `ORDER_COMPLETED` on create.
- **Side effects:** `po_transmission_log` row per attempt; outbound `safeFetch` (SSRF-guarded); GL `PO_COMMIT` (DR 4900-COMMIT / CR 4901-COMMIT-OFFSET) on first send.
- **Related services/crons:** `services/poTransmissionService.ts`, `services/glService.ts`, `lib/safeFetch.ts`
- **Source:** `packages/api/src/routes/purchaseOrders.ts:62-249`; `packages/api/src/services/poTransmissionService.ts:244-345`

### W4-11: Create invoice from completed order
- **Actors:** System (queue), Vendor (downstream)
- **Trigger:** An order transitions to `ORDER_COMPLETED` → `orderEvents` emits `invoice.created`.
- **Entry points:** (no direct route) order completion → `EVENTS_QUEUE` → `index.ts` consumer `case 'invoice.created'` → `handleInvoiceCreated`. Invoice rows are generated by `invoiceService` with tax calculation.
- **Permissions / tenant scope:** System-side; invoice inherits order's hospital/vendor/provider/super-vendor ids.
- **Steps:** Build invoice header (`number = INV-<year>-<seq>`, `status='ORDER_COMPLETED'`, tax engine totals), insert `invoiceItems` with per-line tax. On `invoice.created`, notify vendor users.
- **State machine:** invoice created at `ORDER_COMPLETED`.
- **Side effects:** vendor notification; tax engine call.
- **Related services/crons:** `services/invoiceService.ts`, `queues/invoiceEvents.ts` (`handleInvoiceCreated`), `queues/orderEvents.ts:242-246`
- **Source:** `packages/api/src/services/invoiceService.ts:104-139`; `packages/api/src/queues/invoiceEvents.ts:12-24`; `packages/api/src/index.ts:503`

### W4-12: Invoice lifecycle: confirm spend → generate → send → mark-paid
- **Actors:** Vendor (confirm spend / generate / send), Hospital (pay), Admin
- **Trigger:** Vendor finalizes spend and sends; hospital pays.
- **Entry points:** `packages/web/src/features/billing` · `PUT /api/invoices/:id/confirm-spend`, `PUT /api/invoices/:id/generate`, `PUT /api/invoices/:id/send`, `PUT /api/invoices/:id/mark-paid`, plus `GET /api/invoices`, `GET /api/invoices/:id`, `PUT /api/invoices/:id`
- **Permissions / tenant scope:** `assertInvoiceAccess` — ADMIN all; HOSPITAL own `hospitalId`; VENDOR own `vendorId`; provider/super-vendor scoped. Hospital default list hides `INVOICE_GENERATED` (vendor draft). `GET /:id` writes a PHI audit log.
- **Steps:** `confirm-spend` requires status `ORDER_COMPLETED`, writes item spend/unitPrice, sums total → `SPEND_CONFIRMED`. `generate` → `INVOICE_GENERATED`. `send` → `INVOICE_SENT`, enqueue `invoice.sent`, and post `INVOICE_APPROVE` GL journal (send is treated as the approval boundary). `mark-paid` → `INVOICE_PAID` with payment fields, enqueue `invoice.paid`, post `INVOICE_PAY` GL journal.
- **State machine (invoice status):** `ORDER_COMPLETED → SPEND_CONFIRMED → INVOICE_GENERATED → INVOICE_SENT → INVOICE_PAID` (steps are individually callable; the strict precondition enforced in code is `confirm-spend` requires `ORDER_COMPLETED`). **Ambiguity:** there is no formal enum table for invoice status in the schema files reviewed; the set above is inferred from route code (`invoices.ts`) + queues — flag for confirmation.
- **Side effects:** queue events `invoice.sent` (→ notify hospital + email), `invoice.paid` (→ notify vendor + customer paid-receipt email); GL `INVOICE_APPROVE` (DR dept glCode/5000-EXPENSE / CR 2100-AP) on send; GL `INVOICE_PAY` (DR 2100-AP / CR 1100-CASH) on mark-paid; PHI audit on view.
- **Related services/crons:** `queues/invoiceEvents.ts` (`handleInvoiceSent`, `handleInvoicePaid`), `services/glService.ts`, `services/phiAuditService.ts`
- **Source:** `packages/api/src/routes/invoices.ts:274-489`; `packages/api/src/queues/invoiceEvents.ts:26-88`

### W4-13: Invoice payment via Stripe Checkout
- **Actors:** Hospital user, Admin
- **Trigger:** Hospital pays a vendor invoice online.
- **Entry points:** `billing` invoice detail · `POST /api/invoices/:id/checkout-session`
- **Permissions / tenant scope:** `assertInvoiceAccess`; rejects already-`INVOICE_PAID`; requires positive amount + configured `STRIPE_SECRET_KEY`.
- **Steps:** Compute `amountCents` (`grandTotalCents` or `total*100`), look up hospital/vendor names, POST a Stripe Checkout Session via REST (success/cancel URLs to `/billing-orders/:id`), stamp `stripeCheckoutSessionId`, return `{ id, url, expires_at }`. (Actual paid status flips via the Stripe webhook → mark-paid path, out of this file.)
- **State machine:** no direct status change here; payment confirmation handled by webhook.
- **Side effects:** Stripe API call; `stripeCheckoutSessionId` stamped.
- **Source:** `packages/api/src/routes/invoices.ts:374-443`

### W4-14: Invoice CSV export + bulk payment import
- **Actors:** Any scoped user (export), Admin/back-office (import)
- **Trigger:** Finance reconciliation.
- **Entry points:** `billing` · `GET /api/invoices/export.csv`, `POST /api/invoices/import-payments`
- **Permissions / tenant scope:** Export scoped by persona (admin may filter by vendorId; date filters `startDate`/`endDate`). Import updates invoices by `number` (no explicit tenant guard on the bulk UPDATE — flag).
- **Steps:** Export streams CSV of invoices. Import parses CSV, sets `status='INVOICE_PAID'` + payment fields per matched invoice number; returns processed/failed counts.
- **State machine:** import forces `→ INVOICE_PAID`.
- **Side effects:** bulk status mutation; no queue events emitted by the import path.
- **Source:** `packages/api/src/routes/invoices.ts:111-216`

### W4-15: Record goods receipt (full / partial / damaged) + post
- **Actors:** Hospital receiving user / Admin (vendor read-only for own orders)
- **Trigger:** Goods arrive against an order/PO.
- **Entry points:** `packages/web/src/features/receiving` · `GET/POST /api/goods-receipts`, `GET/PUT /api/goods-receipts/:id`, `POST/PUT/DELETE /api/goods-receipts/:id/lines[/:lid]`, `POST /api/goods-receipts/:id/post`, `POST /api/goods-receipts/:id/cancel`
- **Permissions / tenant scope:** `requirePermission('goods-receipts', READ|WRITE|FULL)` + `loadReceipt` tenant guard. Post requires `FULL`. Only `DRAFT` is editable/postable/cancellable. Create auto-seeds lines from order items when none supplied; receipt number `GRN-<year>-<seq>`.
- **Steps (post):** Verify DRAFT + non-empty → `status='POSTED'`. Then best-effort side-effect cascade.
- **State machine (`GRN_STATUSES`):** `DRAFT → POSTED` (post); `DRAFT → CANCELLED` (cancel). Line conditions (`RECEIPT_CONDITIONS`): `GOOD · DAMAGED · WRONG_ITEM · EXPIRED · OVERSHIPPED`.
- **Side effects (on post):** 1) **Backorders** — for each line with `quantityReceived < quantityOrdered`, insert `orderBackorders` (`status='OPEN'`). 2) **Lab lots** — lines whose HCPC matches a `labConsumables.itemCode` and have a lot number + GOOD condition → `receiveLot(...)`. 3) **GL** — post `GR_RECEIPT` journal (DR 1300-INV / CR 4900-COMMIT) using parent order-item unit prices. 4) **RMA auto-spawn** — `DAMAGED` / `WRONG_ITEM` lines bucket into one DRAFT `vendorRmas` per (vendor, condition) with `vendorRmaLines`.
- **Related services/crons:** `services/sequenceService.ts`, `services/labInventoryService.ts` (`receiveLot`), `services/glService.ts` (`postGrReceipt`)
- **Source:** `packages/api/src/routes/goodsReceipts.ts:55-450`

### W4-16: Three-way match run + exception resolution
- **Actors:** AP reviewer (hospital/admin)
- **Trigger:** Reviewing an invoice for PO + receipt reconciliation.
- **Entry points:** `billing` invoice 3-way-match panel · `POST /api/three-way-match/run/:invoiceId`, `GET /api/three-way-match/invoice/:invoiceId`, `GET /api/three-way-match/exceptions`, `POST /api/three-way-match/:matchId/resolve`
- **Permissions / tenant scope:** `requirePermission('goods-receipts', READ|WRITE)`. Run/resolve guard the invoice's `hospitalId` for non-admins; exceptions list filters to visible invoices.
- **Steps:** `run` recomputes matches (deletes prior rows, re-derives per-line status — see decision flow above). `exceptions` lists non-`PERFECT` matches (optional `matchStatus` filter, oldest-first, ≤500). `resolve` sets `resolution ∈ {ACCEPTED, DISPUTED, OVERRIDDEN}` + `resolvedAt`/`resolvedByUserId`.
- **State machine:** `matchStatus` computed (W4 decision flow); `resolution` is a separate disposition field.
- **Side effects:** rewrites `three_way_matches` rows; no notifications/GL from this path.
- **Related services/crons:** `services/threeWayMatchService.ts`
- **Source:** `packages/api/src/routes/threeWayMatching.ts:27-125`; `packages/api/src/services/threeWayMatchService.ts:45-179`

### W4-17: Invoice match auto-resolution rules (CRUD + preview)
- **Actors:** Hospital manager / Admin
- **Trigger:** Configuring tolerance rules for auto-approving small PO-vs-invoice deltas.
- **Entry points:** `billing` / admin · `GET/POST /api/invoice-match-rules`, `PUT/DELETE /api/invoice-match-rules/:id`, `POST /api/invoice-match-rules/preview`
- **Permissions / tenant scope:** `requirePermission('budgets', READ|WRITE|FULL)` (rules reuse the `budgets` resource). Hospital-scoped by `hospitalId`; DELETE requires `FULL`.
- **Steps:** CRUD rules (`tolerancePct`, `toleranceMaxUsd`, optional `vendorId`, `isActive`). `preview` runs `evaluateMatchRules` against `{vendorId, poTotalUsd, invoiceTotalUsd}` returning `decision ∈ {AUTO_APPROVE, ESCALATE, NO_RULE}`. Rule precedence: vendor-specific > all-vendors, then most-recently-updated.
- **State machine:** `decision` outcomes only.
- **Side effects:** none (preview is pure; the engine is not yet auto-invoked by the 3-way-match run — flag as wired-for-preview-only).
- **Related services/crons:** `services/invoiceMatchService.ts`
- **Source:** `packages/api/src/routes/invoiceMatchRules.ts:26-114`; `packages/api/src/services/invoiceMatchService.ts:35-76`

### W4-18: Department budgets: set + spend-validation gate + encumbrance
- **Actors:** Admin, Hospital manager (`FACILITY_ACCOUNT_MANAGER[_USER]`)
- **Trigger:** Setting department/cost-center/category budgets; checking a requisition's budget impact.
- **Entry points:** admin budgets page · `GET/POST /api/budgets`, `PUT/DELETE /api/budgets/:id`, `GET /api/budgets/:id/history`, `POST /api/budgets/check`
- **Permissions / tenant scope:** `requirePermission('budgets', READ|WRITE|FULL)`. Create/edit limited to admin + hospital managers, own hospital only. DELETE is admin-only (hard delete). Create requires `fiscalYear` + `amountUsd` + at least one of `departmentId`/`costCenter`/`category`.
- **Steps:** CRUD `hospitalBudgets` with `hospitalBudgetHistory` events (`SET`, `ADJUST`). `check` calls `checkBudget` → resolves the narrowest matching budget and reports `available`, `wouldOverrun`, message (does **not** block by default — caller policy decides).
- **State machine:** budget `period` enum (`BUDGET_PERIODS`): `ANNUAL · Q1–Q4 · M01–M12`. Encumbrance events: `SET · ADJUST · COMMIT · RELEASE · CONSUME` (service-driven: submit→COMMIT, reject/cancel→RELEASE, GR-post/invoice-approve→CONSUME).
- **Side effects:** `hospitalBudgetHistory` audit rows; `committedUsd`/`consumedUsd` columns mutated by the encumbrance helpers (`commitBudget`/`releaseBudget`/`consumeBudget`).
- **Related services/crons:** `services/budgetService.ts`
- **Source:** `packages/api/src/routes/budgets.ts:34-199`; `packages/api/src/services/budgetService.ts:62-235`

### W4-19: GL posting ledger + ERP export
- **Actors:** Hospital finance / Admin
- **Trigger:** Reviewing/exporting the GL; ERP import.
- **Entry points:** GL viewer page · `GET /api/reporting/gl/entries`, `GET /api/reporting/gl/export.csv`, `POST /api/reporting/gl/mark-exported`
- **Permissions / tenant scope:** `requirePermission('gl-ledger', READ|FULL)`. Hospital users scoped to own hospital; admins pass `hospitalId`. `mark-exported` admin-only. Filters: `fiscalYear`, `fiscalPeriod`, `sourceType`, `unexported=1`.
- **Steps:** List/export balanced double-entry rows; mark rows `exportedAt` once shipped to ERP. Entries are written by `glService.postPair` (two rows per `transactionId`).
- **State machine:** GL `sourceType` set: `PO_COMMIT`, `GR_RECEIPT`, `INVOICE_APPROVE`, `INVOICE_PAY`. Account conventions: 4900-COMMIT / 4901-COMMIT-OFFSET / 1300-INV / 2100-AP / 1100-CASH / dept glCode or 5000-EXPENSE.
- **Side effects:** `exportedAt` stamp on mark-exported.
- **Related services/crons:** `services/glService.ts` (posting), ERP connector framework (export consumer)
- **Source:** `packages/api/src/routes/glReporting.ts:37-107`; `packages/api/src/services/glService.ts:45-193`

### W4-20: Department-spend dashboard (budget burn-down)
- **Actors:** Hospital finance / Admin
- **Trigger:** Viewing per-department spend vs budget.
- **Entry points:** department-spend report · `GET /api/reporting/department-spend`
- **Permissions / tenant scope:** Inline: hospital users own hospital; admin passes `hospitalId` (ForbiddenError otherwise). Filters: `fiscalYear`, `departmentId`, `costCenter`.
- **Steps:** Per department: `committedUsd` = sum of requisitions in `SUBMITTED/IN_REVIEW/APPROVED`; `consumedUsd` = sum of POs in `SENT/ACKED` (joined to dept via requisition); `budgetAmountUsd` from `ANNUAL` budgets; compute `availableUsd`, `burnPct`, `overBudget`. Returns rows + totals + `fiscalYear`.
- **State machine:** n/a (read-only aggregation).
- **Side effects:** none.
- **Source:** `packages/api/src/routes/departmentSpend.ts:33-153`

### W4-21: Procurement analytics (price variance / charge-capture leakage / clinical consumption / hospital forecast / vendor scorecard)
- **Actors:** Hospital finance / Supply-chain analyst / Admin
- **Trigger:** Opening procurement analytics reports.
- **Entry points:** reporting pages · `GET /api/reporting/charge-capture-leakage`, `GET /api/reporting/price-variance`, `GET /api/reporting/clinical-consumption`, `GET /api/reporting/hospital-forecast`, `POST /api/reporting/hospital-forecast/run`, `GET /api/reporting/vendor-scorecard`, `POST /api/reporting/vendor-scorecard/compute`
- **Permissions / tenant scope:** Per-endpoint `requirePermission` (`orders`/`contracts`/`vendors`, READ/WRITE). `scopeHospital` enforces hospital scope; `vendor-scorecard/compute` is admin-only.
- **Steps:** Charge-capture-leakage = POU events with `invoiceItemId IS NULL` + `chargeStatus='UNCHARGED'` (sums est. $). Price-variance = `orderItems.unitPrice` vs `contractItems.negotiatedRate` for matching ACTIVE contract (vendor×HCPC), per-line delta + per-vendor rollup. Clinical-consumption = POU rollup by encounter/procedure/department/provider. Hospital-forecast = cached run, recompute if >7 days stale. Vendor-scorecard = snapshot list / manual nightly compute.
- **State machine:** n/a
- **Side effects:** forecast/scorecard compute writes `hospitalForecastRuns` / `vendorScorecardSnapshots`.
- **Related services/crons:** `services/hospitalForecastService.ts`, `services/vendorScorecardService.ts`
- **Source:** `packages/api/src/routes/procurementAnalytics.ts:39-183`

### W4-22: Spend-by-physician report
- **Actors:** Hospital finance / Admin
- **Trigger:** Viewing spend grouped by ordering physician.
- **Entry points:** reporting page · `GET /api/reporting/spend-by-physician`
- **Permissions / tenant scope:** Hospital users forced to own hospital; admins pass `hospitalId`. Date filters `startDate`/`endDate`.
- **Steps:** Sum invoice totals grouped by `orders.physician_id` (joined to `users` for name), invoice/order counts, ordered by spend desc (≤200).
- **State machine:** n/a
- **Side effects:** none.
- **Source:** `packages/api/src/routes/reporting.ts:696-733` (mounted `/api/reporting`; owned by Reporting domain — see scope note)

### W4-23: Payor contracts + eligibility check (stub)
- **Actors:** Admin, Hospital manager (CRUD); plus Facility user / Physician (eligibility check)
- **Trigger:** Managing payor records/rates; checking patient eligibility.
- **Entry points:** payors admin · `GET/POST /api/payors`, `GET/PUT /api/payors/:id`, `GET/POST /api/payors/:id/items`, `POST /api/payors/:id/eligibility-check`, `GET /api/payors/eligibility-checks/recent`
- **Permissions / tenant scope:** GETs open to authenticated users; mutations gated via `rbac(ACCOUNT_MANAGER, ACCOUNT_MANAGER_USER, FACILITY_ACCOUNT_MANAGER)`; eligibility-check also allows `FACILITY_USER`, `PHYSICIAN`. (Payors are global, not tenant-scoped.)
- **Steps:** CRUD payors (`PAYOR_KINDS`: `COMMERCIAL · MEDICARE · MEDICAID · WORKERS_COMP · OTHER`). Bulk-upsert `payorContractItems` (allowable/patient-responsibility/effective dates, requiresPriorAuth). `eligibility-check` is a **stub** — deterministic hash of `patientMemberId` synthesizes ACTIVE/INACTIVE + copay/deductible, records an `eligibilityChecks` row; no real X12 270/271.
- **State machine:** eligibility `status ∈ {ACTIVE, INACTIVE}` (synthesized).
- **Side effects:** `eligibilityChecks` audit row.
- **Source:** `packages/api/src/routes/payors.ts:22-275`

### W4-24: Consignment closet management (par/on-hand, cycle count)
- **Actors:** Vendor (own closets), Hospital (own closets)
- **Trigger:** Managing vendor-owned consignment stock at a hospital.
- **Entry points:** `packages/web/src/features/consignment` · `GET/POST /api/consignment`, `GET/DELETE /api/consignment/:id`, `POST /api/consignment/:id/items`, `POST /api/consignment/:id/cycle-count`, `GET /api/consignment/:id/activity-log`, `GET /api/consignment/:id/usage-metrics`
- **Permissions / tenant scope:** List filters by `user.vendorId` else `user.hospitalId` (note: built with raw SQL; per-id detail/mutations have lighter inline scoping — flag). Create requires `hospitalId` + `vendorId`.
- **Steps:** CRUD closets (`consignment_closets`) + items (`par`, `on_hand`). Cycle count inserts `cycle_count_reports`, updates `on_hand` to counted, and writes a `consignment_activity_logs` `CYCLE_COUNT` entry. Activity log + usage metrics aggregate the log.
- **State machine:** n/a (par/on-hand inventory, no formal status enum).
- **Side effects:** `cycle_count_reports`, `consignment_activity_logs` rows.
- **Source:** `packages/api/src/routes/consignment.ts:14-137`

---

## Notes & flagged ambiguities

- **Invoice status enum** is not declared in a schema enum file among those reviewed; the lifecycle (`ORDER_COMPLETED → SPEND_CONFIRMED → INVOICE_GENERATED → INVOICE_SENT → INVOICE_PAID`) is inferred from `routes/invoices.ts`, `services/invoiceService.ts`, and `queues/invoiceEvents.ts`. Confirm against the `invoices` schema.
- **Auto-resolution rules (W4-17)** expose a pure `/preview` decision but are **not** automatically invoked by the 3-way-match run (W4-16); wiring appears preview-only.
- **Three-way match price comparison** currently falls back `poUnit = invoice unit price` (PO lines don't carry native unit price), so `PRICE_VARIANCE` rarely fires until contract pricing is wired into order items (`threeWayMatchService.ts:106-108`).
- **`import-payments` (W4-14)** and some **consignment** per-id endpoints have lighter/absent tenant guards relative to the rest of the domain — flagged, not modified.
- **`spend-by-physician` (W4-22)** physically lives in the Reporting domain's `reporting.ts`; documented here per brief but owned elsewhere.
- Raw-SQL endpoints (`price-variance`, `clinical-consumption`, `spend-by-physician`, all of `consignment`) escape interpolated ids with `.replace(/'/g,"''")`.

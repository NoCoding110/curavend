# Orders, Requisitions & Fulfillment — Workflow Reference

This document catalogs every workflow in the **Orders, Requisitions & Fulfillment** domain of the
Curavend healthcare supply-chain platform (Cloudflare Workers + Hono + Drizzle/D1). It covers the full
supply-order lifecycle (create → route → vendor confirm → patient assessment → delivery → proof →
complete → invoice), multi-vendor splitting, the enterprise requisition workflow (DRAFT → CONVERTED),
recurring-order plans, shipment/tracking, approvals (unified queue + rules engine), PDF packet assembly,
substitution governance, and inbound external-vendor fulfillment webhooks.

Every endpoint, permission gate, tenant scope, and state transition below was extracted directly from
source. Where the running code diverges from the schema-declared enums, that is **flagged inline**.

**Scope note — two parallel "order" entities exist:**
- **Supply orders** (`orders` table) — the DME/orthotics/supply order with the rich sub-status state
  machine. This is the bulk of the domain.
- **Lab orders** (`labOrders` table) — only touched here by the external-fulfillment webhook
  (`externalFulfillment.ts`); the full lab-order lifecycle belongs to the Clinical/Lab domain doc.

**Authoritative source mounts** (from `packages/api/src/index.ts`):
| Router file | Mount prefix | index.ts line |
|---|---|---|
| `routes/routing.ts` | `/api/routing` | 221 |
| `routes/orders.ts` | `/api/orders` | 222 |
| `routes/encounter.ts` | `/api/orders` (sub-routes) | 232 |
| `routes/approvals.ts` | `/api/approvals` | 234 |
| `routes/orderPdf.ts` | `/api/orders` | 236 |
| `routes/requisitions.ts` | `/api/requisitions` | 255 |
| `routes/approvalRules.ts` | `/api/approval-rules` | 256 |
| `routes/requisitionTemplates.ts` | `/api/requisition-templates` | 257 |
| `routes/substitutions.ts` | `/api/substitutions` | 282 |
| `routes/orderRecurrence.ts` | `/api/recurrence` | 287 |
| `routes/shipments.ts` | `/api` (paths self-prefixed) | 290 |
| `routes/externalFulfillment.ts` | `/api/external/fulfillment` (PUBLIC, pre-auth) | 201 |

> **Public vs authed:** `externalFulfillment.ts` is mounted at line 201, *before* the
> `app.use('/api/*', authMiddleware())` gate at line 210, and is instead protected by HMAC. All other
> routers in this domain sit behind the JWT auth middleware.

---

## Workflow index

| ID | Name |
|---|---|
| W2-01 | List / search orders (PHI-safe POST query) |
| W2-02 | View order detail (PHI consent gate + audit) |
| W2-03 | Create supply order (hospital) |
| W2-04 | Auto-route order to best vendor (scoring engine) |
| W2-05 | Split order across multiple vendors (parentOrderId fan-out) |
| W2-06 | Update order (header edit) |
| W2-07 | Order status transition (generic state machine) |
| W2-08 | Assign vendor to a NEW_ORDER |
| W2-09 | Send-for-approval / reject / bulk-update-status (Medzah-parity) |
| W2-10 | Benefit verification + authorization capture |
| W2-11 | Multi-visit follow-up order |
| W2-12 | Cancel / soft-delete order |
| W2-13 | Sticker/barcode attach + manual asset-access log |
| W2-14 | Encounter — add / edit / delete items (lot decrement) |
| W2-15 | Encounter — confirm Assessment → Delivery sub-status advance |
| W2-16 | Encounter — proof-of-delivery upload (DELIVERED → PROOF_UPLOADED) |
| W2-17 | Encounter — submit (→ ORDER_COMPLETED + auto-invoice) |
| W2-18 | Generate consolidated order packet PDF |
| W2-19 | Unified approvals triage queue |
| W2-20 | Approve / reject (dispatcher: order / user / contract) + bulk-approve |
| W2-21 | Approval routing rules — CRUD + dry-run preview |
| W2-22 | Record shipment / tracking (single, quick-set, bulk CSV) |
| W2-23 | External vendor fulfillment webhook (status-update + QC-failure) |
| W2-24 | Substitution suggestion logging + governance gate |
| W2-25 | Create & submit requisition (rules engine + budget encumbrance) |
| W2-26 | Requisition approve / reject / cancel |
| W2-27 | Convert requisition → orders (vendor fan-out) |
| W2-28 | Convert requisition → purchase orders |
| W2-29 | Emergency requisition fast-lane + post-hoc review |
| W2-30 | Requisition templates — CRUD + instantiate |
| W2-31 | Recurring order plan — create / manage / pause / skip |
| W2-32 | Recurring order auto-spawn (daily cron) |
| W2-33 | Order event fan-out (queue consumer: notifications, chat room, ERP push) |
| W2-34 | Order SLA / delayed-order monitors (crons) |

---

## The order sub-status state machine

**Source of truth for enums:** `packages/db/src/schema/orders.ts`
**Source of truth for transitions:** `packages/api/src/routes/orders.ts` + `encounter.ts` + `shipments.ts` + `approvals.ts`.

### Parent `status` (4 values)
`PENDING` · `IN_PROGRESS` · `CANCELLED` · `COMPLETED`

Parent status is *derived* from the sub-status on every transition
(`orders.ts:774-782`, `PUT /:id/status`):
- sub-status ∈ {VENDOR_ASSIGNED, VENDOR_CONFIRMED, VENDOR_CONFIRMED_RECEIPT, DISPENSED,
  ORDER_REQUESTED_FOR_MODIFY, PATIENT_VISITED_AND_ASSESSED, DELIVERED, SPEND_CONFIRMED, PROOF_UPLOADED}
  → `IN_PROGRESS`
- sub-status ∈ {ORDER_COMPLETED, COMPLETED} → `COMPLETED`
- sub-status ∈ {VENDOR_DECLINED, FACILITY_CANCELLED, CANCELLED} → `CANCELLED`

### `orderSubStatus` (schema-declared, 10 values, from `schema/orders.ts`)
`NEW_ORDER` · `VENDOR_ASSIGNED` · `VENDOR_CONFIRMED_RECEIPT` · `VENDOR_DECLINED` ·
`FACILITY_CANCELLED` · `ORDER_REQUESTED_FOR_MODIFY` · `PATIENT_VISITED_AND_ASSESSED` ·
`DELIVERED` · `PROOF_UPLOADED` · `ORDER_COMPLETED`

> **AMBIGUITY / DRIFT FLAG.** The `PUT /:id/status` handler and the queue consumer
> (`queues/orderEvents.ts:177-210`) recognize **extra sub-status strings not in the schema enum**:
> `VENDOR_CONFIRMED`, `DISPENSED`, `SPEND_CONFIRMED`, plus the parent-status aliases `CANCELLED` /
> `COMPLETED` used as sub-statuses. These are accepted as free-form input (the handler does not validate
> `newSubStatus` against the enum) and get status labels + notifications, but a hospital/vendor cannot
> reach them through any first-class endpoint. Treat them as legacy/Medzah-parity values. The
> canonical happy path uses only the 10 schema values.

### Transition list (who can trigger each)

```
[create, no vendor]            ─────────────────────────────►  NEW_ORDER            (status PENDING)
[create, vendor pre-assigned]  ─────────────────────────────►  VENDOR_ASSIGNED      (status IN_PROGRESS)

NEW_ORDER
  ── hospital/admin: PUT /:id/assign-vendor ────────────────►  VENDOR_ASSIGNED
  ── approvals: POST /approvals/order/:id/approve ──────────►  VENDOR_ASSIGNED (needs vendorId)
  ── hospital: DELETE /:id  ────────────────────────────────►  FACILITY_CANCELLED   (status CANCELLED)
  ── hospital: POST /:id/reject ────────────────────────────►  FACILITY_CANCELLED   (status CANCELLED)

VENDOR_ASSIGNED
  ── vendor: approvals approve ─────────────────────────────►  VENDOR_CONFIRMED_RECEIPT
  ── vendor: POST /:id/reject ──────────────────────────────►  VENDOR_DECLINED      (status CANCELLED)
  ── vendor: PUT /:id/status {ORDER_REQUESTED_FOR_MODIFY} ──►  ORDER_REQUESTED_FOR_MODIFY
  ── vendor: encounter ASSESSMENT confirm ──────────────────►  PATIENT_VISITED_AND_ASSESSED
  ── vendor/hospital: set tracking (shipments) ─────────────►  DELIVERED  *(see note)*

VENDOR_CONFIRMED_RECEIPT
  ── vendor: encounter ASSESSMENT confirm ──────────────────►  PATIENT_VISITED_AND_ASSESSED
  ── vendor/hospital: set tracking (shipments) ─────────────►  DELIVERED  *(see note)*

ORDER_REQUESTED_FOR_MODIFY
  ── hospital: POST /:id/send-for-approval ─────────────────►  NEW_ORDER  *(see note)*
  ── approvals approve ─────────────────────────────────────►  VENDOR_ASSIGNED

PATIENT_VISITED_AND_ASSESSED
  ── vendor: encounter DELIVERY confirm ────────────────────►  DELIVERED

DELIVERED
  ── vendor: encounter POST /pod (proof upload) ────────────►  PROOF_UPLOADED

PROOF_UPLOADED
  ── vendor: encounter POST /submit ────────────────────────►  ORDER_COMPLETED (status COMPLETED) + auto-invoice

Any non-COMPLETED
  ── hospital: DELETE /:id ─────────────────────────────────►  FACILITY_CANCELLED   (status CANCELLED)
```

> **Tracking → DELIVERED note** (`shipments.ts:331-345` and `maybeAdvanceToShipped` at 363-376):
> Setting tracking via `POST /orders/:id/shipments` or `PUT /orders/:id/tracking` only fires an
> `order.shipped` queue event and bumps `updatedAt`; it does **not** change the sub-status. **Only the
> bulk-tracking endpoint** (`POST /orders/bulk-tracking`) actually moves
> VENDOR_ASSIGNED/VENDOR_CONFIRMED_RECEIPT → `DELIVERED`, with an inline code comment admitting it is
> reusing DELIVERED "as in-transit-to-delivered for now". This is a known modeling gap (there is no
> distinct SHIPPED/IN_TRANSIT sub-status).

> **`send-for-approval` no-op note** (`orders.ts:1181-1183`): both branches of the ternary resolve to
> `NEW_ORDER`, so the endpoint always sets sub-status to NEW_ORDER regardless of current state.

> **Mermaid rendering** of the canonical path:
> ```mermaid
> stateDiagram-v2
>   [*] --> NEW_ORDER
>   [*] --> VENDOR_ASSIGNED: created w/ vendor
>   NEW_ORDER --> VENDOR_ASSIGNED: assign-vendor / approve
>   NEW_ORDER --> FACILITY_CANCELLED: cancel
>   VENDOR_ASSIGNED --> VENDOR_CONFIRMED_RECEIPT: vendor approve
>   VENDOR_ASSIGNED --> VENDOR_DECLINED: vendor reject
>   VENDOR_ASSIGNED --> ORDER_REQUESTED_FOR_MODIFY: vendor request modify
>   VENDOR_ASSIGNED --> PATIENT_VISITED_AND_ASSESSED: assessment confirm
>   VENDOR_CONFIRMED_RECEIPT --> PATIENT_VISITED_AND_ASSESSED: assessment confirm
>   ORDER_REQUESTED_FOR_MODIFY --> VENDOR_ASSIGNED: re-approve
>   PATIENT_VISITED_AND_ASSESSED --> DELIVERED: delivery confirm
>   DELIVERED --> PROOF_UPLOADED: upload POD
>   PROOF_UPLOADED --> ORDER_COMPLETED: submit encounter
>   ORDER_COMPLETED --> [*]
> ```

### Sub-status history persistence
Every transition appends `{ status, timestamp[, actor] }` to the JSON column
`orders.orderSubStatusHistory` **and** inserts a human-readable row into the `orderHistory` table
(`orders.ts:784-845`, mirrored in `encounter.ts`, `approvals.ts`, `shipments.ts`).

---

## Workflow details

### W2-01: List / search orders (PHI-safe POST query)
- **Actors:** Hospital, Vendor, Provider, SuperVendor, Admin.
- **Trigger:** Orders list page load / filter / search.
- **Entry points:** `packages/web/src/features/supplyOrder` · `GET /api/orders` · `POST /api/orders/query`.
- **Permissions / tenant scope:** `requirePermission('orders','READ')`. Scoping (`orders.ts:82-94`):
  ADMIN sees all; HOSPITAL → own `hospitalId`; VENDOR → own `vendorId`; Provider/SuperVendor → own
  entity id. Filters: status, orderSubStatus, vendorId, hospitalId, facilityId, departmentId,
  physicianId, search, paging, sort.
- **Steps:** 1) Resolve body (POST) or query (GET) — POST keeps PHI `search` out of the URL/access logs
  (`orders.ts:57-63`). 2) Build scoped WHERE. 3) `search` LIKEs `patientName`/`identifier`/
  `patientLastName`. 4) Join vendor + hospital names, paginate, return `{items,total}`.
- **State machine:** n/a (read).
- **Side effects:** None.
- **Source:** `routes/orders.ts:58-159`.

### W2-02: View order detail (PHI consent gate + audit)
- **Actors:** any scoped tenant member.
- **Trigger:** open order detail.
- **Entry points:** `packages/web/src/features/supplyOrderDetail` · `GET /api/orders/:id`.
- **Permissions / tenant scope:** `requirePermission('orders','READ')` + `assertOrderAccess(user, order, requirePhi=true)`.
  PHI consent: a read throws `ForbiddenError` unless `user.hasAgreedToPHIAccess` (`orders.ts:33-35`).
- **Steps:** 1) Join order + vendor/hospital/facility/department/physician detail. 2) `assertOrderAccess`.
  3) Load items + history. 4) **Write a PHI access audit row** via `logPhiAccess` (HIPAA §164.312(b),
  awaited; `orders.ts:204-214`). 5) **Minimum-necessary masking** — VENDOR users get `patientBirthDate`,
  `patientAddress`, `patientEmail`, `patientPhone` nulled (`orders.ts:227-234`).
- **State machine:** n/a.
- **Side effects:** `phiAuditService.logPhiAccess` write.
- **Source:** `routes/orders.ts:162-237`; `services/phiAuditService.ts`.

### W2-03: Create supply order (hospital)
- **Actors:** Hospital (admin/physician), Admin.
- **Trigger:** Create Supply Order wizard submit.
- **Entry points:** `packages/web/src/features/supplyOrder` (create wizard) · `POST /api/orders`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')`. `hospitalId` required.
- **Steps:**
  1. **SKU constraint validation** when `vendorId` + `orderItems` present — enforces MOQ
     (`minimumOrderQuantity`), max qty, and pack-multiple from `vendorItemSkus`; violations → 400
     (`orders.ts:250-289`).
  2. **Customer PO validation** if `customerPurchaseOrderId` attached — PO must exist, match hospital,
     be `OPEN`, not expired, and have authorization headroom (`orders.ts:292-324`).
  3. If `splits[]` length > 1 → branch to W2-05.
  4. Initial state: vendor present → `VENDOR_ASSIGNED`/`IN_PROGRESS`; else `NEW_ORDER`/`PENDING`
     (`orders.ts:492-493`).
  5. Backfill `diagnosis` from ICD-10 description if blank (`orders.ts:497-503`).
  6. Resolve facility/department/physician FK → denormalized name/number; auto-set physician when the
     creator's role is PHYSICIAN (`orders.ts:505-531`).
  7. Mint identifier via `mintOrderNumber(env.DB, hospitalId)` (`sequenceMinter`).
  8. **Line-item pricing** priority CONTRACT > MEDICARE > MANUAL — bulk `getContractRatesBulk`, Medicare
     fallback from `medicare_fee_schedule_items`; items inserted into `ASSESSMENT` section,
     `added_by='HOSPITAL'` (`orders.ts:582-633`).
  9. Persist `orderContacts` rows (ORDERER/SHIP_TO/BILL_TO/CLINICAL) (`orders.ts:636-659`).
  10. Bump customer PO `spent_amount`; auto-`EXHAUSTED` if fully consumed (`orders.ts:662-689`).
  11. Insert `orderHistory`; enqueue `order.created` event.
- **State machine:** → NEW_ORDER or VENDOR_ASSIGNED (see above).
- **Side effects:** order_items, orderContacts, orderHistory, customer-PO spend update, `order.created`
  queue event (→ W2-33).
- **Related services/crons:** `lib/sequenceMinter.ts`, `lib/contractPricing.ts`, `services/invoiceService.ts` (later).
- **Source:** `routes/orders.ts:240-714`.

### W2-04: Auto-route order to best vendor (scoring engine)
- **Actors:** Hospital, Admin.
- **Trigger:** create-order wizard "suggest vendors" step.
- **Entry points:** `packages/web/src/features/supplyOrder` · `POST /api/routing/suggestions`.
- **Permissions / tenant scope:** auth required (no per-resource `requirePermission`); hospital users are
  auto-scoped to own hospital; mismatched `hospitalId` → `ForbiddenError` (`routing.ts:33-49`).
- **Steps:** 1) Validate hospitalId/facilityId/items. 2) Map items to `RoutingItemInput`. 3) `topN`
  clamped to [1,5] default 3. 4) Call `routeOrderItems`.
- **Scoring engine** (`lib/vendorRouting.ts`): resolves facility state/zip; pulls
  `hospital_vendors` scoped to facility-or-NULL; for each item infers an `ItemCategory` from the HCPC
  prefix (`inferCategory`, L→ORTHOTICS, K/E→DME, A42→WOUND_CARE, Q4→BIOLOGICS, C→IMPLANTS, A→CONSUMABLES);
  **hard filters**: category match, vendor-SKU match (Phase C, demote to `noSkuVendors` if vendor has a
  catalog but lacks the HCPC), geography (`stateMatches` on serviceStates/zip prefixes), custom-fit
  requires `CUSTOM_FIT` capability + same-state, STAT/ASAP requires `STAT` capability + ≤8h SLA.
  **Scoring** (lower = better): `hv.priority*10` + 50 if cross-state + min(maxDeliveryHours,72) − 5 if
  primary location; Phase D stock signal demotes insufficient stock by +200 and stale snapshots by +25.
  Returns recommended + alternatives per item, `splitRequired` when >1 vendor, `groupedByVendor`,
  `unroutable[]`.
- **State machine:** n/a (preview; no DB write).
- **Side effects:** None — read-only suggestion.
- **Related services:** `lib/vendorRouting.ts` (engine), tables `hospitalVendors`, `vendorLocations`,
  `vendorItemSkus`, `vendorStockSnapshots`.
- **Source:** `routes/routing.ts:26-78`; `lib/vendorRouting.ts:240-655`.

### W2-05: Split order across multiple vendors (parentOrderId fan-out)
- **Actors:** Hospital, Admin.
- **Trigger:** `POST /api/orders` with `splits: [{vendorId, orderItems}]` length > 1 (driven by W2-04's
  `splitRequired`).
- **Entry points:** create wizard (multi-vendor preview) · `POST /api/orders`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')`.
- **Steps:** 1) Create a no-items **parent** order (`identifier = {number}-P`, `parentOrderId=null`,
  status `IN_PROGRESS`, sub-status `VENDOR_ASSIGNED`). 2) Per split, create a **child** order
  (`identifier = {number}-{n}`, `parentOrderId=parent`, vendor set) with its own contract-priced items
  (CONTRACT > MEDICARE > MANUAL). 3) Insert child orderHistory "created via multi-vendor split". 4)
  Enqueue `order.created` per child. 5) Return `{parent, childIds, splitCount}` 201.
- **State machine:** parent + all children start at `VENDOR_ASSIGNED`/`IN_PROGRESS`.
- **Side effects:** N+1 child orders, items, history, `order.created` per child.
- **Source:** `routes/orders.ts:330-488`. (Migration 0008 added `parent_order_id`.)

### W2-06: Update order (header edit)
- **Actors:** scoped tenant member with WRITE.
- **Entry points:** order detail edit · `PUT /api/orders/:id`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + `assertOrderAccess` (no PHI gate
  on mutation).
- **Steps:** Strip immutable fields (`stripImmutableFields` — mass-assignment guard), set
  `changedByUserId`+`updatedAt`, return updated row.
- **State machine:** n/a (does not touch status here).
- **Side effects:** None beyond the row update.
- **Source:** `routes/orders.ts:717-751`; `lib/sanitizeBody.ts`.

### W2-07: Order status transition (generic state machine)
- **Actors:** Hospital + Vendor (role decides target); Admin.
- **Trigger:** status-change action on order detail.
- **Entry points:** order detail status controls · `PUT /api/orders/:id/status` body `{orderSubStatus, reason}`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + `assertOrderAccess`.
- **Steps:** 1) Derive parent `status` from target sub-status (mapping above). 2) Append to
  `orderSubStatusHistory`. 3) Persist `declineReason` for decline/cancel; `modifyReason` for
  ORDER_REQUESTED_FOR_MODIFY. 4) **On `ORDER_COMPLETED` → auto-create invoice** via
  `InvoiceService.createInvoiceForOrder` (`orders.ts:809-819`). 5) Insert orderHistory with a labeled
  message. 6) Enqueue `order.status_changed`.
- **State machine:** accepts any sub-status string (not enum-validated — see DRIFT FLAG above).
- **Side effects:** invoice (on complete), orderHistory, `order.status_changed` event (→ W2-33).
- **Source:** `routes/orders.ts:754-870`.

### W2-08: Assign vendor to a NEW_ORDER
- **Actors:** Hospital, Admin.
- **Entry points:** order detail "assign vendor" · `PUT /api/orders/:id/assign-vendor` `{vendorId}`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + `assertOrderAccess`.
- **Steps:** **Guard: only allowed when `orderSubStatus === 'NEW_ORDER'`** else 400
  (`orders.ts:895-897`). Sets vendorId, → `VENDOR_ASSIGNED`/`IN_PROGRESS`, appends history, enqueues
  `order.status_changed` (oldStatus NEW_ORDER).
- **State machine:** NEW_ORDER → VENDOR_ASSIGNED.
- **Side effects:** orderHistory, `order.status_changed` (triggers chat-room auto-create in W2-33).
- **Source:** `routes/orders.ts:873-948`.

### W2-09: Send-for-approval / reject / bulk-update-status (Medzah-parity)
- **Actors:** Hospital (cancel) + Vendor (decline); Admin. Bulk: any WRITE.
- **Entry points:** order detail action buttons; bulk grid action.
  - `POST /api/orders/:id/send-for-approval` — sets sub-status to NEW_ORDER (no-op ternary; see note),
    history + event.
  - `POST /api/orders/:id/reject` `{reason}` — reason ≥3 chars required; **VENDOR → `VENDOR_DECLINED`,
    others → `FACILITY_CANCELLED`** (status CANCELLED for facility) (`orders.ts:1202-1244`).
  - `POST /api/orders/bulk-update-status` `{updates:[{orderId,status?,subStatus?}]}` — 1..100 items,
    per-order `assertOrderAccess`, writes history per row, returns `{updated, results}`
    (`orders.ts:1125-1169`). *Note: bulk path sets raw status/subStatus without the derive-parent logic.*
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + `assertOrderAccess` per order.
- **State machine:** reject → VENDOR_DECLINED | FACILITY_CANCELLED.
- **Side effects:** orderHistory, `order.status_changed` events.
- **Source:** `routes/orders.ts:1125-1244`.

### W2-10: Benefit verification + authorization capture (Phase 6)
- **Actors:** Hospital/Provider with WRITE; Admin.
- **Entry points:** order detail benefits/auth panel.
  - `PUT /api/orders/:id/benefit-verification` `{status,note}` → stamps
    `benefit_verification_status/_note` + history (`orders.ts:951-980`).
  - `PUT /api/orders/:id/authorization` `{authorizationNumber, lCodes[]}` → stamps
    `authorization_number`, `authorization_l_codes` JSON + history (`orders.ts:983-1012`).
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + `assertOrderAccess`.
- **State machine:** n/a (metadata only).
- **Side effects:** orderHistory rows.
- **Source:** `routes/orders.ts:951-1012`.

### W2-11: Multi-visit follow-up order (Phase 6)
- **Actors:** Hospital, Admin.
- **Entry points:** order detail "add follow-up visit" · `POST /api/orders/:id/follow-up`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + `assertOrderAccess` on parent.
- **Steps:** Compute `visit_number = MAX(visit_number)+1` for the parent; clone patient/clinical fields
  into a new `PENDING`/`NEW_ORDER` order, `identifier = {parent}-V{n}`, link via `parent_order_id` +
  `visit_number`. Returns `{id, visitNumber}` 201.
- **State machine:** new child starts NEW_ORDER.
- **Side effects:** new order row.
- **Source:** `routes/orders.ts:1014-1062`.

### W2-12: Cancel / soft-delete order
- **Actors:** scoped member with `FULL` on orders.
- **Entry points:** order detail "cancel order" · `DELETE /api/orders/:id`.
- **Permissions / tenant scope:** `requirePermission('orders','FULL')` + `assertOrderAccess`.
- **Steps:** **Guard: COMPLETED orders cannot be cancelled** (`orders.ts:1076-1078`). Sets
  `CANCELLED`/`FACILITY_CANCELLED`, appends history JSON + orderHistory, enqueues `order.status_changed`.
- **State machine:** any non-COMPLETED → FACILITY_CANCELLED (status CANCELLED).
- **Side effects:** `order.status_changed` event.
- **Source:** `routes/orders.ts:1065-1120`.

### W2-13: Sticker/barcode attach + manual asset-access log
- **Actors:** scoped member.
- **Entry points:** label-printing / asset-access UI.
  - `POST /api/orders/:id/sticker-info` `{stickerType,barcodeValue,...}` — inserts an `orderStickers`
    row (PATIENT/SPECIMEN/KIT/SHIPPING) (`orders.ts:1247-1277`).
  - `POST /api/orders/:id/log-access` — inserts a `fileAccessLog` row (PHI gate via
    `assertOrderAccess(...,true)`) (`orders.ts:1280-1306`).
- **Permissions / tenant scope:** sticker = `requirePermission('orders','WRITE')`; log-access = auth only
  (no per-resource gate) but PHI consent enforced.
- **State machine:** n/a.
- **Side effects:** orderStickers / fileAccessLog rows.
- **Source:** `routes/orders.ts:1247-1306`.

### W2-14: Encounter — add / edit / delete items (lot decrement)
- **Actors:** Vendor (write). Hospital may **read** the encounter but **not** mutate
  (`encounter.ts:34-36` `tenantGuard`).
- **Trigger:** vendor performs patient assessment / packs delivery.
- **Entry points:** order detail → Encounter tab · `POST/PUT/DELETE /api/orders/:orderId/encounter/:section/items[/:itemId]` (section ∈ ASSESSMENT|DELIVERY).
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + tenant guard + hospital-block.
- **Steps (add, `encounter.ts:233-411`):** three-tier item resolution —
  (1) `inventoryItemId` (catalog, preferred; LOT items require a `lotNumber`),
  (2) legacy lot-scan (`lotNumber` → derive SKU),
  (3) ad-hoc HCPC (NON_LOT only; rejects LOT-typed HCPC). State-aware Medicare fee lookup
  (`state_rate_schedule_items` then national). **LOT items decrement `inventory_lots.quantity_on_hand`
  atomically** (`WHERE quantity_on_hand >= qty`; 0-change → insufficient-stock 400). Inserts a primary
  `order_items` row (`added_by='VENDOR'`) plus bundle-child rows; writes `encounter_audit_logs`.
  **Edit** logs `EDIT_AFTER_CONFIRM` when the section was already confirmed. **Delete** restores lot qty
  and cascades to bundle children.
- **State machine:** none directly (item-level); confirms drive transitions (W2-15).
- **Side effects:** order_items, inventory_lots decrement/restore, encounter_audit_logs.
- **Source:** `routes/encounter.ts:233-491`.

### W2-15: Encounter — confirm section (Assessment → Delivery sub-status advance)
- **Actors:** Vendor.
- **Entry points:** Encounter tab "confirm assessment / confirm delivery" · `POST /api/orders/:orderId/encounter/:section/confirm`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + tenant guard + hospital-block.
- **Steps:** Idempotent — if `assessment_confirmed_at`/`delivery_confirmed_at` already set, returns
  unchanged. Stamps the confirm timestamp. **Sub-status advance:** ASSESSMENT confirm from
  {VENDOR_ASSIGNED, VENDOR_CONFIRMED_RECEIPT} → `PATIENT_VISITED_AND_ASSESSED`; DELIVERY confirm from
  PATIENT_VISITED_AND_ASSESSED → `DELIVERED`. On advance: append history JSON + orderHistory + enqueue
  `order.status_changed`.
- **State machine:** VENDOR_ASSIGNED|VENDOR_CONFIRMED_RECEIPT → PATIENT_VISITED_AND_ASSESSED → DELIVERED.
- **Side effects:** orderHistory, encounter_audit_logs (`CONFIRM`), `order.status_changed`.
- **Source:** `routes/encounter.ts:496-577`.

### W2-16: Encounter — proof-of-delivery upload (DELIVERED → PROOF_UPLOADED)
- **Actors:** Vendor.
- **Entry points:** Encounter tab POD capture (file via `/api/uploads` first, then key) ·
  `POST /api/orders/:orderId/encounter/pod` `{fileKey?, signatureDataUrl?, deliveredBy?, ...}`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + tenant guard + hospital-block.
- **Steps:** Requires `fileKey` OR `signatureDataUrl`. Stamps POD columns + delivery metadata. **If
  current sub-status === DELIVERED → `PROOF_UPLOADED`** with history + event.
- **State machine:** DELIVERED → PROOF_UPLOADED.
- **Side effects:** orderHistory, encounter_audit_logs (`UPLOAD_POD`), `order.status_changed`.
- **Source:** `routes/encounter.ts:584-666`.

### W2-17: Encounter — submit (→ ORDER_COMPLETED + auto-invoice)
- **Actors:** Vendor.
- **Entry points:** Encounter tab "submit encounter" · `POST /api/orders/:orderId/encounter/submit`.
- **Permissions / tenant scope:** `requirePermission('orders','WRITE')` + tenant guard + hospital-block.
- **Steps:** **Preconditions enforced** (`encounter.ts:692-694`): assessment confirmed, delivery
  confirmed, AND proof present — else 400. Sets `status=COMPLETED`, `order_sub_status=ORDER_COMPLETED`,
  `encounter_submitted_at`; inserts orderHistory; **auto-creates invoice** via
  `InvoiceService.createInvoiceForOrder`; logs `SUBMIT`; enqueues `order.status_changed`.
- **State machine:** PROOF_UPLOADED → ORDER_COMPLETED (status COMPLETED).
- **Side effects:** invoice, orderHistory, encounter_audit_logs, `order.status_changed` (→ may emit
  `invoice.created` in W2-33).
- **Related services:** `services/invoiceService.ts`.
- **Source:** `routes/encounter.ts:671-746`. (Also `GET /encounter/pdf` at 751-775 returns structured
  data for client-side PDF.)

### W2-18: Generate consolidated order packet PDF
- **Actors:** scoped tenant member.
- **Entry points:** order detail "download packet" · `GET /api/orders/:id/packet.pdf`.
- **Permissions / tenant scope:** auth + `assertOrderAccess` (no PHI gate flag here).
- **Steps:** Collect attachment keys in order: original-order, encounter, `orders.attachments` JSON
  array, delivery-proof (de-duped). Merge from R2 with `pdf-lib` — PDFs page-copied, PNG/JPG embedded on
  a Letter page, unknown skipped. **KV cache** keyed `order_packet:{id}:{updatedAt}` (5-min TTL) busts on
  order update. Writes a `fileAccessLog` row (`file_kind='ORDER_PACKET'`, via `waitUntil`). Returns
  inline `application/pdf`.
- **State machine:** n/a.
- **Side effects:** KV write, fileAccessLog audit row.
- **Related services:** `services/storageService.ts` (downloadFile), `pdf-lib`.
- **Source:** `routes/orderPdf.ts:52-236`.

### W2-19: Unified approvals triage queue
- **Actors:** Hospital, Vendor, Provider, SuperVendor, Admin; account managers also see user approvals.
- **Trigger:** Approvals page load.
- **Entry points:** `packages/web/src/features/approvals` · `GET /api/approvals/queue?type=order|user|contract|all`.
- **Permissions / tenant scope:** auth; per-persona pending sets — HOSPITAL/PROVIDER →
  {NEW_ORDER, ORDER_REQUESTED_FOR_MODIFY}; VENDOR/SUPER_VENDOR → {VENDOR_ASSIGNED}; ADMIN → all
  (`approvals.ts:63-80`). User rows only for ADMIN or ACCOUNT_MANAGER. Contract rows show
  `PENDING_APPROVAL` where caller is the counterparty.
- **Steps:** Build order/user/contract candidate rows, synthesize a one-line `summary` + `actionUrl`
  deep-link, compute `ageDays`, sort oldest-first, return `{items,total,counts}`.
- **State machine:** n/a (read).
- **Side effects:** None.
- **Source:** `routes/approvals.ts:84-288`.

### W2-20: Approve / reject (dispatcher) + bulk-approve
- **Actors:** depends on entity type.
- **Entry points:** Approvals queue actions ·
  `POST /api/approvals/:type/:id/approve` · `POST /api/approvals/:type/:id/reject` ·
  `POST /api/approvals/bulk-approve` (≤50 items).
- **Permissions / tenant scope:** order → `assertOrderAccess`; user → ACCOUNT_MANAGER(/_USER) only;
  contract → `contractTransitions`.
- **Steps (order approve, `approvals.ts:423-464`):** state-driven —
  NEW_ORDER | ORDER_REQUESTED_FOR_MODIFY → `VENDOR_ASSIGNED` (requires a vendor or `vendorId` override);
  VENDOR_ASSIGNED → `VENDOR_CONFIRMED_RECEIPT`; any other state → 400 "not awaiting approval". Appends
  history JSON (with actor) + orderHistory.
  **Order reject (`approvals.ts:466-502`):** VENDOR/SUPER_VENDOR → `VENDOR_DECLINED`, else
  `FACILITY_CANCELLED`; status CANCELLED; stores `declineReason`.
  **User approve/reject:** sets `approvalStatus` + `userStatus`. **Contract:** delegates to
  `approveContract`/`rejectContract`. **bulk-approve:** loops order/user with per-item OK/FAILED.
- **State machine:** order: NEW_ORDER/ORDER_REQUESTED_FOR_MODIFY→VENDOR_ASSIGNED;
  VENDOR_ASSIGNED→VENDOR_CONFIRMED_RECEIPT; reject→VENDOR_DECLINED|FACILITY_CANCELLED.
- **Side effects:** orderHistory; **note** — these handlers do *not* enqueue `order.status_changed`
  (unlike `PUT /:id/status`), so queue-driven notifications/ERP push are skipped on the approval path.
  *(Flagged inconsistency.)*
- **Related libs:** `lib/contractTransitions.ts`.
- **Source:** `routes/approvals.ts:295-502`.

### W2-21: Approval routing rules — CRUD + dry-run preview
- **Actors:** ACCOUNT_MANAGER / ACCOUNT_MANAGER_USER / FACILITY_ACCOUNT_MANAGER; Admin.
- **Trigger:** rules-engine admin page.
- **Entry points:** approvals/admin settings · `GET/POST/PUT/DELETE /api/approval-rules[/:id]` ·
  `POST /api/approval-rules/preview`.
- **Permissions / tenant scope:** mutations gated by `rbac(ACCOUNT_MANAGER, ACCOUNT_MANAGER_USER,
  FACILITY_ACCOUNT_MANAGER)`; non-admins scoped to own `hospitalId`. `triggerType` ∈
  `APPROVAL_RULE_TRIGGERS` = **`REQUISITION` | `ORDER` | `INVOICE` | `CONTRACT`**. `approver.type` ∈
  USER|GROUP|ROLE.
- **Steps:** Store `(triggerType, priority, conditionsJson, approverJson, isTerminal)`. Preview runs
  `resolveApprovers` against a sample object and returns the resolved approver chain.
- **Engine** (`services/approvalRuleEngine.ts`): pulls active rules for `(hospitalId, trigger)`, sorts by
  `priority` asc, evaluates conditions (amount ≥/<, facility, department, priority[], containsOffFormulary
  / Restricted / PriorAuth, categoryAny); first match returned, continuing past non-terminal rules to
  build a multi-step chain. `pickPrimaryApprover` = first match (used by requisition submit, W2-25).
- **State machine:** n/a.
- **Side effects:** approval_rules rows.
- **Source:** `routes/approvalRules.ts:28-167`; `services/approvalRuleEngine.ts:85-131`.

### W2-22: Record shipment / tracking (single, quick-set, bulk CSV)
- **Actors:** Vendor (typically), Hospital, Admin.
- **Trigger:** add tracking on order; bulk CSV upload.
- **Entry points:** order detail Shipments section + Bulk Tracking page
  (`packages/web/src/features/shipments`) ·
  `GET /api/orders/:id/shipments` · `POST /api/orders/:id/shipments` ·
  `PUT /api/orders/:id/tracking` · `PUT /api/shipments/:shipmentId` ·
  `DELETE /api/shipments/:shipmentId` · `POST /api/orders/bulk-tracking` · `GET /api/carriers`.
- **Permissions / tenant scope:** auth + `assertOrderAccess` per order (`/carriers` is open). Carrier
  codes validated against `lib/carriers.ts`.
- **Steps:** `POST shipments` appends a sequenced `orderShipments` row; `PUT tracking` quick-sets
  shipment #1 (creates if absent). Both call `maybeAdvanceToShipped` → fires `order.shipped` **without**
  changing sub-status. `GET shipments` enriches each row with a public `trackingUrl` (vendor template
  override). **Bulk-tracking** (≤500, `dryRun` supported): resolves identifiers→ids, per-row
  `assertOrderAccess`, upserts shipment #1, and **advances VENDOR_ASSIGNED/VENDOR_CONFIRMED_RECEIPT →
  `DELIVERED`** + `order.shipped` event.
- **State machine:** bulk-tracking only: VENDOR_ASSIGNED|VENDOR_CONFIRMED_RECEIPT → DELIVERED.
- **Side effects:** orderShipments rows, `order.shipped` queue events (→ shipped email in W2-33).
- **Related libs:** `lib/carriers.ts`.
- **Source:** `routes/shipments.ts:32-376`.

### W2-23: External vendor fulfillment webhook (status-update + QC-failure)
- **Actors:** Third-party fulfillment vendor (e.g. ShopPro). **Operates on `labOrders`, not supply orders.**
- **Trigger:** vendor POSTs a signed callback.
- **Entry points:** PUBLIC `POST /api/external/fulfillment/status-update` ·
  `POST /api/external/fulfillment/qc-failure`.
- **Permissions / tenant scope:** **No JWT** — `hmacAuth({secretEnv:'EXTERNAL_FULFILLMENT_HMAC_SECRET'})`.
  Idempotent: SHA-256 of canonical body compared to `external_fulfillment_callbacks.payload_hash`; dupes
  acked 200 `{duplicate:true}` and logged but not re-applied.
- **Steps:** Validate with zod (status ∈ batched|in_process|shipped|cancelled|on_hold; QC
  attempt_number 1..3, `permanently_failed` only valid at attempt 3). Resolve lab order by
  `externalOrderRef` then `orderNumber`. **status-update** stamps `externalVendorStatus`/tracking.
  **qc-failure** bumps `qcAttemptCount`; terminal at attempt 3 or `permanently_failed` →
  `status=QC_FAILED`, `qcStatus=FAILED`, and **out-of-order safety** refuses to downgrade an already
  permanently-failed order. Every callback writes an `external_fulfillment_callbacks` forensic row.
- **State machine:** lab order → QC_FAILED on terminal QC failure (lab domain).
- **Side effects:** labOrders update, callback audit rows, terminal QC dispatches a
  `LAB_ORDER_QC_FAILED` customer notification (`dispatchCustomerEvent`, via `waitUntil`).
- **Related services:** `middleware/hmacAuth.ts`, `services/notificationRouter.ts`, `services/emailService.ts`.
- **Source:** `routes/externalFulfillment.ts:81-323`.

### W2-24: Substitution suggestion logging + governance gate
- **Actors:** any member with `formulary` WRITE (create-order wizard, backorder triage, requisition
  convert); Admin bypasses gate.
- **Trigger:** user swaps an HCPC for a substitute.
- **Entry points:** create-order wizard substitute chips / backorder triage ·
  `GET /api/substitutions` · `POST /api/substitutions/log`.
- **Permissions / tenant scope:** `requirePermission('formulary','READ'|'WRITE')`; non-admins scoped to
  own hospital. `contextType` ∈ `SUBSTITUTION_CONTEXTS` = **`ORDER_CREATE` | `BACKORDER` | `REQUISITION`**.
- **Steps:** **Governance gate** (`substitutions.ts:94-105`) — for non-admins, if the substitute is NOT
  in the hospital's `formulary_substitutes` pre-approved list for the source HCPC, an `approverUserId`
  is **required** or the call is rejected. Inserts a `substitution_audit_log` row recording from/to HCPC,
  context, reason, approver, and `substitutedByUserId`.
- **State machine:** n/a.
- **Side effects:** substitution_audit_log row.
- **Source:** `routes/substitutions.ts:35-120`.

### W2-25: Create & submit requisition (rules engine + budget encumbrance)
- **Actors:** Hospital requester; Admin.
- **Trigger:** Requisition create + submit.
- **Entry points:** `packages/web/src/features/requisitions` ·
  `POST /api/requisitions` (create DRAFT) · `GET/PUT /:id` · `POST /:id/items` · `PUT/DELETE /:id/items/:itemId`
  · `POST /api/requisitions/:id/submit`.
- **Permissions / tenant scope:** `requirePermission('requisitions','READ'|'WRITE')`; non-admins scoped to
  own hospital (`loadAndAuthorize`). `priority` ∈ `REQUISITION_PRIORITIES` = LOW|NORMAL|HIGH|URGENT.
- **Steps (create):** mint `REQ-{year}-{NNNNN}` via `sequenceService`; per item resolve active
  `formularyItems` (sets `formularyItemId`, `isOffFormulary`, `requiresPriorAuth`, default vendor);
  compute `estimatedTotalUsd`; insert DRAFT + items + `CREATED` history.
  **Submit (`requisitions.ts:397-518`):** must be DRAFT and non-empty; off-formulary items require
  justification; resolve approver via `pickPrimaryApprover('REQUISITION', {...flags})`; **budget
  encumbrance** via `resolveBudget`+`commitBudget` (records `budgetId`/`costCenter`; `?strictBudget=1`
  hard-blocks overruns with 409); set status `SUBMITTED` (or APPROVED via emergency fast-lane, W2-29);
  notify the assigned approver (`NotificationService`).
- **State machine (requisition):** `DRAFT → SUBMITTED → IN_REVIEW → APPROVED → CONVERTED`; also
  `→ REJECTED` and `→ CANCELLED` from non-terminal. Enum `REQUISITION_STATUSES` =
  DRAFT|SUBMITTED|IN_REVIEW|APPROVED|REJECTED|CONVERTED (+ CANCELLED — see schema).
- **Side effects:** requisition + items + requisitionHistory, budget ledger commit, approver
  notification.
- **Related services:** `services/sequenceService.ts`, `services/approvalRuleEngine.ts`,
  `services/budgetService.ts`, `services/notificationService.ts`.
- **Source:** `routes/requisitions.ts:124-518`.

### W2-26: Requisition approve / reject / cancel / comment
- **Actors:** approver / hospital admin; Admin.
- **Entry points:** requisition detail · `POST /api/requisitions/:id/approve` · `/reject` · `/cancel` · `/comment`.
- **Permissions / tenant scope:** `requirePermission('requisitions','WRITE')` (comment = READ) +
  `loadAndAuthorize`.
- **Steps:** **approve** — SUBMITTED|IN_REVIEW → `APPROVED` (+`approvedAt`). **reject** — reason required,
  SUBMITTED|IN_REVIEW → `REJECTED`, **releases the budget commit** (`releaseBudget`). **cancel** — any
  non-terminal → `CANCELLED`, releases budget. **comment** — appends a `COMMENT` history row only.
- **State machine:** as above.
- **Side effects:** requisitionHistory, budget release on reject/cancel.
- **Source:** `routes/requisitions.ts:520-600, 845-854`.

### W2-27: Convert requisition → orders (vendor fan-out)
- **Actors:** member with `requisitions` `FULL`; Admin.
- **Entry points:** requisition detail "Convert" · `POST /api/requisitions/:id/convert`.
- **Permissions / tenant scope:** `requirePermission('requisitions','FULL')` + `loadAndAuthorize`.
- **Steps:** Must be `APPROVED` and non-empty. Group items by `preferredVendorId` (null →
  `__UNASSIGNED__` bucket). Per bucket create an `orders` row (`identifier={reqNumber}-{n}`,
  status `PENDING`, sub-status `NEW_ORDER`, `requisitionId` linked, vendor set or null) + its
  `order_items`. Set requisition `CONVERTED` with `convertedOrderIds` JSON + history.
- **State machine:** requisition APPROVED → CONVERTED; spawned orders start NEW_ORDER.
- **Side effects:** N orders + items, requisitionHistory.
- **Source:** `routes/requisitions.ts:605-685`.

### W2-28: Convert requisition → purchase orders
- **Actors:** member with `requisitions` `FULL`; Admin.
- **Entry points:** requisition detail "Convert to PO" · `POST /api/requisitions/:id/convert-to-po`.
- **Permissions / tenant scope:** `requirePermission('requisitions','FULL')` + `loadAndAuthorize`.
- **Steps:** Must be APPROVED. Same vendor-bucket fan-out, but **skips unassigned lines** (a PO needs a
  vendor; errors if zero POs result). Mint `PO-{year}-{NNNNN}`; insert `purchaseOrders`
  (status `ORDER_COMPLETED`, `transmissionState='NOT_SENT'`) + `purchaseOrderItems` (linked back to
  `requisitionItemId`). Set requisition `CONVERTED` (reusing `convertedOrderIds` as a polymorphic
  pointer to PO ids).
- **State machine:** requisition APPROVED → CONVERTED.
- **Side effects:** purchase_orders + items; downstream PO transmission (EDI/API/punchout/email/portal)
  is a separate Procurement-domain workflow.
- **Source:** `routes/requisitions.ts:696-798`.

### W2-29: Emergency requisition fast-lane + post-hoc review
- **Actors:** requester (emergency flag); manager (review); Admin.
- **Entry points:** requisition create `{isEmergency, emergencyReason}` then submit ·
  `POST /api/requisitions/:id/emergency-review` · `GET /api/requisitions/emergency-review-queue`.
- **Permissions / tenant scope:** submit = WRITE; review = `requisitions` `FULL`; queue = READ
  (hospital-scoped).
- **Steps:** On submit, if `isEmergency`, **skip approver assignment → straight to `APPROVED`** with
  `emergencyReviewStatus='PENDING_REVIEW'` and an `EMERGENCY_APPROVED` history note. A manager later
  triages via emergency-review → `REVIEWED_OK` | `REVIEWED_FLAG`. The queue lists PENDING_REVIEW
  requisitions.
- **State machine:** DRAFT → APPROVED (fast-lane); emergencyReviewStatus PENDING_REVIEW →
  REVIEWED_OK|REVIEWED_FLAG.
- **Side effects:** requisitionHistory.
- **Source:** `routes/requisitions.ts:477-499, 800-842` (PV3-B emergency fast-lane).

### W2-30: Requisition templates — CRUD + instantiate
- **Actors:** Hospital staff with `requisitions` WRITE/FULL; Admin.
- **Entry points:** Requisition Templates page ·
  `GET/POST /api/requisition-templates` · `GET/PUT/DELETE /:id` · `POST /:id/instantiate`.
- **Permissions / tenant scope:** `requirePermission('requisitions',...)`; non-admins scoped to own
  hospital. Delete = soft (`isActive=0`).
- **Steps:** Store template header + `requisitionTemplateItems` (sorted). **Instantiate** spawns a fresh
  DRAFT requisition, re-evaluating the formulary at instantiation time (picks up
  `maxUnitPriceUsd`/preferred vendor), honoring `quantityOverrides`, and increments `timesUsed`.
- **State machine:** instantiation produces a DRAFT requisition (feeds W2-25).
- **Side effects:** requisitions + items, template usage counter bump.
- **Source:** `routes/requisitionTemplates.ts:27-269`.

### W2-31: Recurring order plan — create / manage / pause / skip
- **Actors:** Hospital (create/manage); Vendor (read own); Admin.
- **Trigger:** "make this order recurring" on order detail.
- **Entry points:** `packages/web/src/features/orderRecurrence` ·
  `POST /api/recurrence/by-order/:orderId` (create) · `GET /api/recurrence` (list) ·
  `GET /api/recurrence/by-order/:orderId` · `PUT /api/recurrence/:planId` ·
  `POST /:planId/pause|resume|cancel|skip-next` · `GET /:planId/occurrences`.
- **Permissions / tenant scope:** custom `assertPlanAccess` — ADMIN all; HOSPITAL own hospital; VENDOR
  own vendor (read). Create requires the caller to be the order's hospital (or ADMIN).
- **Steps:** Validate `frequencyUnit` ∈ `RECURRENCE_FREQUENCY_UNITS` = DAYS|WEEKS|MONTHS|QUARTERS|CUSTOM,
  `frequencyValue ≥ 1`, `startDate`. Reject a second ACTIVE plan on the same template order. Compute
  initial `nextOccurrenceDate` (`lib/recurrence.ts`); store plan anchored to `parentOrderId` with
  `leadTimeDays` (default 3) and optional `requireReauthEvery`, `totalOccurrences`, `endDate`,
  `skipDates`. Pause/resume/cancel/skip-next manage status; `occurrences` returns spawned children +
  projected next 3.
- **State machine (plan):** `RECURRENCE_STATUSES` = ACTIVE | PAUSED | CANCELLED | COMPLETED.
- **Side effects:** orderRecurrencePlans rows.
- **Related libs:** `lib/recurrence.ts`.
- **Source:** `routes/orderRecurrence.ts:37-373`.

### W2-32: Recurring order auto-spawn (daily cron)
- **Actors:** system (no user).
- **Trigger:** daily cron `handleRecurringOrderSpawner`.
- **Entry points:** `packages/api/src/cron/recurringOrderSpawner.ts`.
- **Steps:** Auto-resume PAUSED plans whose `pauseUntil ≤ today`. Find ACTIVE plans where
  `nextOccurrenceDate − leadTimeDays ≤ today`. Per plan, idempotently (SELECT + DB partial-UNIQUE on
  `(recurrence_plan_id, recurrence_index)`) clone the template order's patient/clinical fields + items
  into a fresh child (`recurrenceIndex=n`; status VENDOR_ASSIGNED if vendor else NEW_ORDER), insert
  history, enqueue `order.created`. Advance plan: `computeNextOccurrenceDate`; **reauth gate** — when
  `occurrenceIndex % requireReauthEvery === 0` → `PAUSED` (`INSURANCE_REAUTH_REQUIRED`); cap on
  `totalOccurrences` or null next-date → `COMPLETED`.
- **State machine:** plan ACTIVE → PAUSED (reauth) / COMPLETED (cap); spawns child orders.
- **Side effects:** child orders + items + history, `order.created` events (→ W2-33).
- **Source:** `cron/recurringOrderSpawner.ts:39-236`; `lib/recurrence.ts`, `lib/sequenceMinter.ts`.

### W2-33: Order event fan-out (queue consumer)
- **Actors:** system (queue consumer on `EVENTS_QUEUE`).
- **Trigger:** `order.created` / `order.status_changed` / `order.shipped` / `order.delivered` messages.
- **Entry points:** `packages/api/src/queues/orderEvents.ts`.
- **Steps:**
  - **order.created** — notify hospital ("New order created"); if vendor assigned, notify vendor; send
    customer "ORDER_CONFIRMATION" email (`dispatchCustomerEvent`).
  - **order.status_changed** — map sub-status → message; vendor-triggered transitions notify the
    hospital, hospital-triggered notify the vendor; **on VENDOR_ASSIGNED auto-create the order chat
    `room`** (if absent); on ORDER_COMPLETED with an invoiceId emit `invoice.created`; **fire ERP push**
    for any vendor connector whose `trigger_event` matches the new sub-status (`pushOrderToErp`).
  - **order.shipped** — send "ORDER_SHIPPED" customer email with carrier/tracking.
  - **order.delivered** — send "ORDER_DELIVERED" email with POD/delivered-at.
- **State machine:** n/a (reacts to transitions).
- **Side effects:** notifications, customer emails, chat room, `invoice.created`, ERP HTTP pushes.
- **Related services:** `queues/notificationHelpers.ts`, `services/notificationRouter.ts`,
  `services/customerEmailTemplates.ts`, `jobs/pushOrderToErp.ts`.
- **Source:** `queues/orderEvents.ts:14-271`.

### W2-34: Order SLA / delayed-order monitors (crons)
- **Actors:** system.
- **Trigger:** scheduled crons.
- **Entry points:** `cron/orderSlaMonitor.ts` (daily 08:00 UTC) · `cron/delayedOrderNotifier.ts`
  (every 15 min).
- **Steps:** **SLA monitor** runs 5 independent aging checks across orders/shipments/labOrders/workflow
  instances and emails one summary per (tenant × event), de-duped 30 min via delivery logs. **Delayed
  notifier** finds orders stuck at `VENDOR_ASSIGNED` > 15 min without a hospital notification and
  notifies + emails the hospital.
- **State machine:** n/a (observes, does not transition).
- **Side effects:** notifications + summary emails.
- **Source:** `cron/orderSlaMonitor.ts`, `cron/delayedOrderNotifier.ts`.

---

## Cross-cutting notes & flagged ambiguities

1. **Sub-status enum drift** — `PUT /orders/:id/status` accepts arbitrary sub-status strings (no enum
   validation); the handler + queue consumer recognize legacy extras `VENDOR_CONFIRMED`, `DISPENSED`,
   `SPEND_CONFIRMED` not present in `schema/orders.ts`. Canonical flows use only the 10 schema values.
2. **No SHIPPED sub-status** — tracking maps to `DELIVERED` (bulk path) or fires only an event (single
   path). Modeling gap acknowledged in source comments.
3. **Approval-path vs status-path divergence** — `approvals.ts` and `encounter.ts`/`orders.ts`
   transitions both mutate sub-status, but the `approvals` approve/reject handlers do **not** enqueue
   `order.status_changed`, so notification/ERP fan-out (W2-33) is skipped on the approvals path.
4. **`send-for-approval` is effectively a no-op** that always resolves to `NEW_ORDER`.
5. **Raw SQL with manual escaping** appears in `encounter.ts` (e.g. `sql.raw` UPDATEs with
   `replace(/'/g,"''")`); functionally parameterized-ish but worth noting vs the Drizzle-typed paths.
6. **Two requisition→destination paths** (`/convert` → orders, `/convert-to-po` → purchase orders) both
   land the requisition in `CONVERTED` and reuse `convertedOrderIds` as a polymorphic id list.

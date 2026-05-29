# Inventory, Compliance & Logistics — Workflow Reference

This document covers every workflow in the **Inventory, Compliance & Logistics** domain of the
Curavend healthcare supply-chain platform (Cloudflare Workers + Hono + Drizzle/D1 monorepo). It
spans the vendor/hospital inventory catalog, cross-site stock visibility and transfers, point-of-use
consumption, backorder triage, the vendor RMA and manufacturer-recall workflows, controlled-substance
accountability, the unified compliance dashboard plus its daily sweep, the monthly OIG LEIE exclusion
screening, cold-chain logistics monitoring, item-master hygiene, demand forecasting, the general
reporting hub, and hospital/facility/department CRUD.

All routes mount under `/api/...` from `packages/api/src/index.ts` (lines 211–298). Every route file
runs behind the global `authMiddleware`; most write endpoints additionally gate via
`requirePermission(resource, level)` (`packages/api/src/middleware/requirePermission.ts`). Tenant
scoping is enforced per-route by inspecting the JWT `AuthUser` (`role`, `userType`, `hospitalId`,
`vendorId`, `labGroupId`, `providerId`). Throughout, **admin** means
`role === 'ACCOUNT_MANAGER' || 'ACCOUNT_MANAGER_USER'` (the `isAdmin()` helper repeated in each file).

> **Ambiguity flag:** Most route files declare their own local `isAdmin()` that keys off `role`, but a
> few CRUD files (`hospitals.ts`, `hospitalDepartments.ts`, `hospitalFacilities.ts`, `forecasting.ts`)
> key off `userType === 'ADMIN'` instead. Both conventions appear in the same domain — noted per
> workflow where it matters.

## Workflow index

| ID | Name |
|----|------|
| W6-01 | Inventory catalog + SKU + lot management (vendor stock) |
| W6-02 | Unified inventory search (encounter "Add Item") |
| W6-03 | Cross-site stock visibility report (lab consumables) |
| W6-04 | Request cross-site inventory transfer (state machine) |
| W6-05 | Transfer suggestions (over→under stocked) |
| W6-06 | Point-of-use capture (single + batch) |
| W6-07 | Backorder triage + fulfill / cancel |
| W6-08 | Backorder suggested substitutes |
| W6-09 | RMA lifecycle (state machine; auto-spawn from damaged GRN lines) |
| W6-10 | Recall intake + affected-lot auto-scan + disposition + close |
| W6-11 | Controlled-substance accountability log + running balance |
| W6-12 | Unified compliance dashboard (list / acknowledge / manual sweep) |
| W6-13 | Daily compliance alert sweep (cron) |
| W6-14 | Daily expiry notifier (vendor credentials / contracts / fee schedules) (cron) |
| W6-15 | Monthly OIG LEIE exclusion screening refresh (cron) |
| W6-16 | Cold-chain / logistics shipment monitoring + temp excursion alert |
| W6-17 | Item-master hygiene (duplicates / missing / unmapped) |
| W6-18 | Demand forecasting (order-history statistics) |
| W6-19 | Hospital-side demand forecast service (seasonality projection) |
| W6-20 | General reporting hub (spend, KPIs, scorecard, leakage, exports) |
| W6-21 | Hospital CRUD |
| W6-22 | Facility CRUD |
| W6-23 | Department CRUD (costCenter / glCode / serviceLine) |

---

### W6-01: Inventory catalog + SKU + lot management (vendor stock)
- **Actors:** Vendor users (own stock), Admin/Account-Manager (any vendor), Hospital (read via search).
- **Trigger:** Vendor maintains their on-hand inventory; SKUs are typed LOT vs NON_LOT.
- **Entry points:** Inventory page (`packages/web/src/features/inventoryManagement/pages/InventoryManagement.tsx`) ·
  `GET/POST /api/inventory`, `GET/PUT/DELETE /api/inventory/:id`,
  `GET/POST /api/inventory/:id/items`, `PUT/DELETE /api/inventory/:id/items/:itemId`,
  `GET/POST /api/inventory/:id/items/:itemId/lots`, `PUT/DELETE /api/inventory/:id/items/:itemId/lots/:lotId`.
- **Permissions / tenant scope:** No `requirePermission` gate; tenant enforced inline — `VENDOR` users
  are filtered to `inventory.vendorId === user.vendorId` on list and auto-assigned their `vendorId` on
  create (inventory.ts:45–47, 79). Admins may pass `vendorId`.
- **Steps:**
  1. Create/list an inventory catalog row (one per vendor `s3key` upload).
  2. Add SKU items; `item_type` is client-supplied or inferred from HCPC prefix via
     `inferItemTypeFromHcpc` (`L`/`C`/`K`/`A42`/`Q4` → `LOT`, else `NON_LOT`) (inventory.ts:18–24).
  3. Add lots only to `LOT` items; lot create rejects negative qty and duplicate `(item, lot_number)`.
  4. Item detail returns a per-SKU lot rollup (`lotCount`, `totalOnHand`) (inventory.ts:263–296).
- **State machine:** n/a. Guard rails: cannot switch `LOT→NON_LOT` while lots exist (inventory.ts:370–381);
  cannot delete a lot with `quantityOnHand > 0` (inventory.ts:554–558).
- **Side effects:** Cascade deletes — deleting a SKU cascades its lots; deleting a catalog deletes its
  items then catalog (inventory.ts:413, 581–583).
- **Related services/crons:** none direct.
- **Source:** `packages/api/src/routes/inventory.ts`.

### W6-02: Unified inventory search (encounter "Add Item")
- **Actors:** Vendor (own SKUs), Hospital/Admin (pass `vendorId`).
- **Trigger:** "Add Item" modal in encounter / order flows.
- **Entry points:** `GET /api/inventory/search?q=&vendorId=`.
- **Permissions / tenant scope:** No permission gate; `VENDOR` is forced to their own `vendorId`
  (inventory.ts:122–124). Matches by HCPC, description, manufacturer item number, OR lot number
  (EXISTS subquery); caps at 25 rows, attaches a `lots[]` summary for LOT items.
- **State machine:** n/a.
- **Side effects:** none (read-only).
- **Source:** `packages/api/src/routes/inventory.ts:114–178`.

### W6-03: Cross-site stock visibility report (lab consumables)
- **Actors:** Lab user (own lab group), Vendor (their lab groups), Admin (all sites).
- **Trigger:** Multi-site stock dashboard; spot over/under-stocked consumables.
- **Entry points:** Cross-Site Inventory report (`packages/web/src/features/reporting/pages/CrossSiteInventory.tsx`) ·
  `GET /api/reporting/cross-site-inventory?category=&belowReorder=1&hospitalId=`.
- **Permissions / tenant scope:** `requirePermission('orders', 'READ')`. Site scope resolved from
  `labGroupId`, else `vendorId` → lab groups, else admin sees all (crossSiteInventory.ts:44–55).
- **Steps:** Aggregates `lab_inventory_lots` (status ACTIVE) by `(consumableId × siteId)`, pivots to one
  row per consumable with a `sites[]` array + `totalOnHand`. Per-site `status` is `OK` / `LOW` (≤
  reorderPoint) / `CRITICAL` (< minThreshold) (crossSiteInventory.ts:104–107). `belowReorder=1` filters
  to consumables with any non-OK site.
- **State machine:** n/a.
- **Side effects:** none.
- **Source:** `packages/api/src/routes/crossSiteInventory.ts` (tables: `lab_consumables`,
  `lab_inventory_lots`, `lab_kit_sites`, `lab_groups`).

### W6-04: Request cross-site inventory transfer (STATE MACHINE)
- **Actors:** Hospital users (own hospital), Admin.
- **Trigger:** A facility needs stock that another facility in the same hospital holds.
- **Entry points:** Inventory Transfers page (`packages/web/src/features/inventory/pages/InventoryTransfers.tsx`) ·
  `GET/POST /api/transfers`, `GET /api/transfers/:id`, `POST /api/transfers/:id/{approve,ship,receive,cancel}`.
- **Permissions / tenant scope:** `requirePermission('orders', READ|WRITE)`. Non-admins scoped to their
  `hospitalId`; cross-tenant rows return `ForbiddenError` (inventoryTransfers.ts:31–38, 48–51).
- **Steps:**
  1. POST creates a transfer in `REQUESTED` with `transferNumber` `TR-<year>-<5-digit-seq>` (from
     `sequenceService`), `from/toFacilityId` (must differ), `priority` (`LOW|NORMAL|HIGH|URGENT`,
     default `NORMAL`), and one or more lines.
  2. Approve → ship (records `trackingNumber`, stamps `shippedAt`) → receive (stamps `receivedAt`).
  3. Cancel allowed from any non-terminal state.
- **State machine (`TRANSFER_STATES`):** `REQUESTED → APPROVED → SHIPPED → RECEIVED` (terminal);
  `REQUESTED|APPROVED|SHIPPED → CANCELLED` (terminal). Illegal transitions raise `ConflictError`
  (`Can't transition from X to Y`). `approve` stamps `approvedByUserId` (inventoryTransfers.ts:142–145).
- **Side effects:** Sequence-table row consumed per transfer. No inventory decrement is performed by
  the transfer itself (lines are descriptive). No notifications.
- **Related services/crons:** `services/sequenceService.ts`.
- **Source:** `packages/api/src/routes/inventoryTransfers.ts`; enums
  `packages/db/src/schema/inventoryTransfers.ts:15–21`.

### W6-05: Transfer suggestions (over → under stocked)
- **Actors:** Same as W6-04.
- **Trigger:** Operator wants system-recommended transfers.
- **Entry points:** `GET /api/transfers/suggestions` (documented in the file header,
  inventoryTransfers.ts:11).
- **Permissions / tenant scope:** Would inherit the route file's hospital scoping.
- **State machine:** n/a.
- **Side effects:** none.
- **Source:** `packages/api/src/routes/inventoryTransfers.ts`.
  > **Ambiguity flag:** The header comment lists `GET /suggestions`, but no `app.get('/suggestions', …)`
  > handler exists in the current file (only `/`, `/:id`, and the four transition routes are
  > registered). Treat the suggestions endpoint as **documented but not implemented** in this revision.

### W6-06: Point-of-use capture (single + batch)
- **Actors:** Hospital clinical/procedure-room staff, Admin.
- **Trigger:** Bedside / procedure-tray consumption of non-lab items (or lab lots).
- **Entry points:** Point of Use page (`packages/web/src/features/inventory/pages/PointOfUse.tsx`) ·
  `POST /api/point-of-use`, `POST /api/point-of-use/batch`, `GET /api/point-of-use`,
  `GET /api/point-of-use/by-encounter/:id`.
- **Permissions / tenant scope:** `requirePermission('point-of-use', READ|WRITE)`. Non-admins scoped to
  their `hospitalId` (pointOfUse.ts:135–137). Create requires at least one of `hcpcCode`,
  `formularyItemId`, or `inventoryLotId`.
- **Steps:**
  1. Each captured line writes a `point_of_use_events` row (HCPC/formulary/manufacturer/serial/lot,
     quantity, optional price, encounter/MRN/department/room/device).
  2. If `inventoryLotId` is supplied, the lab inventory service decrements that lot via
     `recordMovement(... movementType:'ISSUE', quantity:-qty ...)` — FEFO override; shortfall throws
     (pointOfUse.ts:51–69). Without a lot, intent is logged with no decrement.
  3. Batch returns `{ captured, ids, errors[] }` (per-line failures don't abort the batch).
- **State machine:** n/a.
- **Side effects:** Lab `recordMovement` ISSUE on inventory; **PHI audit write** `logPhiAccess`
  (resourceType `POINT_OF_USE`) on list (pointOfUse.ts:151–160). POU events feed recall patient-
  notification fan-out (see W6-10).
- **Related services/crons:** `services/labInventoryService.recordMovement`, `services/phiAuditService`.
- **Source:** `packages/api/src/routes/pointOfUse.ts`.

### W6-07: Backorder triage + fulfill / cancel
- **Actors:** Hospital (their orders), Vendor (their orders), Admin (all).
- **Trigger:** A goods receipt under-delivers an order → backorder line auto-created (in goodsReceipts).
- **Entry points:** Backorder Triage page (`packages/web/src/features/receiving/pages/BackorderTriage.tsx`),
  order detail Backorders panel · `GET /api/backorders`, `GET /api/backorders/triage`,
  `GET /api/backorders/order/:orderId`, `PUT /api/backorders/:id`,
  `POST /api/backorders/:id/fulfill`, `POST /api/backorders/:id/cancel`.
- **Permissions / tenant scope:** No `requirePermission`; bespoke `tenantFilter()` — admins
  unrestricted, hospital persona filtered via `orders.hospitalId`, vendor via `orders.vendorId`;
  personas with no scope are rejected. Every write calls `assertOwnsBackorder()` joining to the parent
  order (backorders.ts:37–76).
- **Steps:**
  1. List defaults to `status='OPEN'`; `/triage` adds age buckets `FRESH`(≤3d)/`WEEK`(≤7)/`AGING`(≤21)/
     `STALE`(>21) with counts (backorders.ts:272–285).
  2. PUT edits `expectedFulfillmentDate` / `vendorReference` / `notes`.
  3. Fulfill records a (partial or full) fill; recomputes `quantityReceived`/`quantityRemaining`.
- **State machine (status field):** `OPEN → PARTIALLY_FULFILLED → FULFILLED` (fulfill computes
  `FULFILLED` when remaining hits 0, else `PARTIALLY_FULFILLED`); `OPEN → CANCELLED`. Fulfilling a
  `FULFILLED`/`CANCELLED` row, or exceeding `quantityOrdered`, raises `ConflictError`
  (backorders.ts:186–194).
- **Side effects:** none beyond row updates.
- **Source:** `packages/api/src/routes/backorders.ts` (table `order_backorders`).

### W6-08: Backorder suggested substitutes
- **Actors:** Same as W6-07.
- **Trigger:** Operator wants alternates for a backordered HCPC.
- **Entry points:** `GET /api/backorders/:id/suggested-substitutes`.
- **Permissions / tenant scope:** `assertOwnsBackorder()`.
- **Steps:** Resolves the parent order's `hospitalId`, finds the ACTIVE `formulary_items` row for that
  HCPC, returns its `formulary_substitutes` ordered by `priority` (backorders.ts:211–242).
- **State machine:** n/a.
- **Side effects:** none.
- **Source:** `packages/api/src/routes/backorders.ts:211–242`.

### W6-09: RMA lifecycle (STATE MACHINE; auto-spawn from damaged GRN lines)
- **Actors:** Hospital (files the RMA), Vendor (accepts/credits), Admin.
- **Trigger:** Damaged / wrong / defective / short-dated goods returned to a vendor. **Auto-spawned**
  when a goods receipt records `DAMAGED` or `WRONG_ITEM` lines.
- **Entry points:** RMAs page (`packages/web/src/features/receiving/pages/Rmas.tsx`) ·
  `GET/POST /api/rmas`, `GET /api/rmas/:id`,
  `POST /api/rmas/:id/{submit,approve,reject,ship,receive,credit,cancel}`.
- **Permissions / tenant scope:** `requirePermission('rmas', READ|WRITE)`; cancel requires `FULL`.
  Vendor sees own `vendorId`, hospital sees own `hospitalId`; cross-tenant → Forbidden
  (rmas.ts:33–41). A vendor **cannot file an RMA against itself** (rmas.ts:74).
- **Steps:**
  1. Create (manual or auto) in `DRAFT` with `rmaNumber` `RMA-<year>-<5-digit-seq>`, a `reason`
     (`DAMAGED|WRONG_ITEM|SHORT_DATED|DEFECTIVE|OTHER`), optional `sourceGrnId`/`sourceOrderId`, lines.
  2. Submit → vendor approve (or reject) → ship (return) → receive → credit. Optional payload knobs:
     `vendorRmaNumber`, `trackingNumber`, `actualCreditUsd`, `notes`.
- **State machine (`RMA_STATES`):**
  `DRAFT → SUBMITTED → APPROVED → SHIPPED → RECEIVED → CREDITED` (terminal);
  `SUBMITTED → REJECTED` (terminal);
  `DRAFT|SUBMITTED|APPROVED|SHIPPED → CANCELLED` (terminal, requires `rmas:FULL`).
  Each transition stamps a timestamp (`submittedAt`/`approvedAt`/`shippedAt`/`receivedAt`/`creditedAt`)
  and rejects illegal moves with `ConflictError` (rmas.ts:154–162).
- **Auto-spawn detail:** In `routes/goodsReceipts.ts` (GRN post), lines with `condition` `DAMAGED` or
  `WRONG_ITEM` are bucketed by condition; **one DRAFT RMA per (vendor, condition) bucket** is created
  with `sourceGrnId`/`sourceOrderId` set and `reasonDetail` = `Auto-spawned from GRN <num> (<n> lines)`
  (goodsReceipts.ts:366–426).
- **Side effects:** Sequence-table consumption; no auto-notification.
- **Related services/crons:** `services/sequenceService.ts`; spawned by `routes/goodsReceipts.ts`.
- **Source:** `packages/api/src/routes/rmas.ts`; enums `packages/db/src/schema/vendorRmas.ts:16–25`.

### W6-10: Recall intake + affected-lot auto-scan + disposition + close (STATE MACHINE)
- **Actors:** Admin (open/close — admin-only), compliance staff with `compliance-alerts` permission
  (read/disposition).
- **Trigger:** Manufacturer recall notice received.
- **Entry points:** Recalls page (`packages/web/src/features/admin/pages/Recalls.tsx`) ·
  `GET/POST /api/recalls`, `GET /api/recalls/:id`,
  `POST /api/recalls/:id/disposition/:itemId`, `POST /api/recalls/:id/close`.
- **Permissions / tenant scope:** `requirePermission('compliance-alerts', READ|WRITE)`; create + close
  additionally require `isAdmin` (recalls.ts:48, 195). Close requires `compliance-alerts:FULL`.
- **Steps:**
  1. POST validates `classification` (`CLASS_I|CLASS_II|CLASS_III`) and `actionRequired`
     (`QUARANTINE|RETURN|DESTROY|NOTIFY_PATIENT`), assigns `recallNumber` `REC-<year>-<seq>`, sets
     `state='OPEN'`, default severity `CRITICAL` for CLASS_I else `WARN`.
  2. **Auto-scan fan-out** (recalls.ts:83–145): matches by `hcpcCode` (+ optional `lotNumbers[]`):
     - ACTIVE `lab_inventory_lots` → one `recall_affected_items` row `kind='LAB_LOT'`; if action is
       `QUARANTINE`/`RETURN`/`DESTROY` the lot is set `status='QUARANTINED'` with note `Recall <num>`.
     - `point_of_use_events` for the HCPC/lot → `recall_affected_items` row `kind='POU_EVENT'` carrying
       `hospitalId` + `patientMrn` (patient-notification candidates). Auto-scan errors are swallowed.
  3. Operator sets a `disposition` per affected item (`QUARANTINED|RETURNED|DESTROYED|PATIENT_NOTIFIED|
     NOT_FOUND`), stamping `dispositionedAt`/`dispositionedByUserId`.
  4. Close blocks until **every** affected item has a disposition (raw COUNT of NULL dispositions);
     otherwise `ConflictError` (recalls.ts:201–208), then stamps `closedAt`/`closedByUserId`.
- **State machine (`RECALL_STATES`):** `OPEN → CLOSED` (the `INVESTIGATING` enum value exists but no
  transition sets it in this route — flag as defined-but-unused). Re-closing raises `ConflictError`.
- **Side effects:** Lab lot quarantine writes; `recall_affected_items` rows; **PHI audit write**
  `logPhiAccess` (resourceType `RECALL`) on detail (recalls.ts:161–170).
- **Source:** `packages/api/src/routes/recalls.ts`; enums `packages/db/src/schema/recalls.ts:19–24`.

### W6-11: Controlled-substance accountability log + running balance
- **Actors:** Hospital pharmacy/clinical staff (own hospital), Admin.
- **Trigger:** Receipt, dispense, waste, transfer, periodic count, or discrepancy of a DEA-scheduled
  formulary item.
- **Entry points:** Controlled Substance page (`packages/web/src/features/admin/pages/ControlledSubstance.tsx`) ·
  `GET /api/controlled-substance/log`, `POST /api/controlled-substance/event`,
  `GET /api/controlled-substance/balance/:formularyItemId`.
- **Permissions / tenant scope:** `requirePermission('compliance-alerts', READ|WRITE)`. Non-admins
  scoped to `hospitalId` (controlledSubstance.ts:38–41).
- **Steps:**
  1. Event validates `eventType` ∈ `RECEIVE|DISPENSE|WASTE|TRANSFER|COUNT|DISCREPANCY` and a **signed**
     numeric `quantity`.
  2. DEA schedule resolved from the referenced `formulary_items` row; a non-controlled item is rejected.
  3. **Schedule II `DISPENSE`/`WASTE` require `witnessedByUserId`**, and the witness must differ from
     the performer (controlledSubstance.ts:93–100). Other schedules accepted without a witness.
  4. Running `quantityAfter` is computed from the last log row: `COUNT` **replaces** the balance; all
     others **adjust** (prev + signed qty) (controlledSubstance.ts:120–124).
  5. Balance endpoint returns the last `quantityAfter` + `lastEventAt`.
- **State machine:** n/a (append-only ledger; `COUNT`/`DISCREPANCY` are reconciliation markers).
- **Side effects:** **PHI audit write** `logPhiAccess` (resourceType `CONTROLLED_SUBSTANCE`) on log
  list (controlledSubstance.ts:52–61).
- **Source:** `packages/api/src/routes/controlledSubstance.ts`; enum
  `packages/db/src/schema/controlledSubstanceLog.ts:14–16`.

### W6-12: Unified compliance dashboard (list / acknowledge / manual sweep)
- **Actors:** Admin (all + manual sweep), hospital compliance staff (own hospital, read/ack).
- **Trigger:** Reviewing open expiry/compliance alerts.
- **Entry points:** Compliance Dashboard (`packages/web/src/features/admin/pages/ComplianceDashboard.tsx`) ·
  `GET /api/compliance-alerts`, `POST /api/compliance-alerts/:id/acknowledge`,
  `POST /api/compliance-alerts/sweep`.
- **Permissions / tenant scope:** `requirePermission('compliance-alerts', READ|WRITE)`; non-admins
  scoped to `hospitalId`. `/sweep` is admin-only (complianceAlerts.ts:62–64).
- **Steps:** List filters by `severity`, `subjectType`, `includeResolved`; defaults to unresolved
  (`resolvedAt IS NULL`), ordered by severity then recency. Acknowledge stamps `acknowledgedAt` /
  `acknowledgedByUserId` (**does not resolve**). `/sweep` runs `sweepComplianceAlerts(DB)` on demand.
- **State machine (alert severity):** `INFO` / `WARN` / `CRITICAL` (set by the sweep, see W6-13). Alert
  lifecycle: created → optionally `acknowledged` → `resolved` (resolution only by the sweep when the
  underlying expiry moves > 60 days out).
- **Side effects:** Manual sweep triggers the same writes as W6-13.
- **Related services/crons:** `services/complianceAlertService.sweepComplianceAlerts`.
- **Source:** `packages/api/src/routes/complianceAlerts.ts`.

### W6-13: Daily compliance alert sweep (cron)
- **Actors:** System (scheduled).
- **Trigger:** Daily cron `0 8 * * *` (`packages/api/src/index.ts:428–438`); also invokable via W6-12 `/sweep`.
- **Entry points:** `sweepComplianceAlerts(env.DB)`.
- **Permissions / tenant scope:** runs as system.
- **Steps:** Scans vendor `accreditation` / `state_level_license` / `liability_insurance` expiry dates
  and ACTIVE `lab_inventory_lots.expiration_date` (within 60 days). For each, emits a single
  `compliance_alerts` row at the **tightest** matching threshold of `60 / 30 / 7` days, using
  `INSERT OR IGNORE` (UNIQUE per subject+kind+threshold) for idempotency. Then auto-resolves alerts
  whose `expires_on` is now > 60 days out (renewed certs).
- **State machine (severity by threshold):** `60 → INFO`, `30 → WARN`, `7 → CRITICAL`
  (complianceAlertService.ts:24–28).
- **Side effects:** Inserts/updates `compliance_alerts`; returns counts
  `{vendorAccreditation, vendorLicense, vendorInsurance, labLots, resolved}`.
  > Note: the daily cron handler comment line references "DMEPOS" but the service itself only sweeps
  > vendor credentials + lab lots (the DMEPOS expiry notifier is a separate cron handler).
- **Source:** `packages/api/src/services/complianceAlertService.ts`; registered in
  `packages/api/src/index.ts:428–438`.

### W6-14: Daily expiry notifier (vendor credentials / contracts / fee schedules) (cron)
- **Actors:** System; recipients are vendor users + admins.
- **Trigger:** Daily cron `0 8 * * *` (`packages/api/src/index.ts:368–369`).
- **Entry points:** `handleExpiryNotifications(env)`.
- **Steps:** Finds vendors whose accreditation / state license / liability-insurance dates fall within
  30 days; emails each vendor (Resend) and posts an in-app notification via `notifyVendorUsers`. Also
  notifies vendor users of contracts and custom fee schedules expiring within 30 days.
- **State machine:** n/a.
- **Side effects:** Outbound email (`EmailService`) + in-app notifications. Distinct from W6-13: this
  one *notifies*, the sweep *records dashboard alerts*.
- **Related services/crons:** `services/emailService`, `queues/notificationHelpers.notifyVendorUsers`.
- **Source:** `packages/api/src/cron/expiryNotifier.ts`.

### W6-15: Monthly OIG LEIE exclusion screening refresh (cron)
- **Actors:** System.
- **Trigger:** Monthly cron `0 6 1 * *` (1st of month, 06:00 UTC) (`packages/api/src/index.ts:464–472`).
- **Entry points:** `handleOigRefresh(env)`; screening helper `screenOig(env, {npi,ein,lastName,businessName})`.
- **Steps:** Downloads the public HHS/OIG LEIE CSV
  (`https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv`, 60 s timeout), **truncates** and reloads
  `oig_exclusion_list` in batches of 50 (full-replacement file). On success stamps
  `KV oig:last_refresh`. `screenOig` matches an entity by NPI/EIN/last-name/business-name and excludes
  reinstated rows (`reindate` empty).
- **State machine:** n/a.
- **Side effects:** Full table reload of `oig_exclusion_list`; KV write. Network egress to OIG.
- **Source:** `packages/api/src/cron/oigScreeningRefresh.ts`; registered in
  `packages/api/src/index.ts:464–472`.

### W6-16: Cold-chain / logistics shipment monitoring + temp excursion alert
- **Actors:** Hospital (their orders), Vendor (their orders), Admin; sensor/carrier webhooks for writes.
- **Trigger:** Shipment in transit; carrier ETA push or temperature sensor reading.
- **Entry points:** Logistics page (`packages/web/src/features/logistics/pages/Logistics.tsx`) ·
  `GET /api/logistics/shipments`, `GET /api/logistics/shipments/:id`,
  `POST /api/logistics/shipments/:id/eta`, `POST /api/logistics/shipments/:id/temp`,
  `GET /api/logistics/shipments/:id/temp-log`.
- **Permissions / tenant scope:** `requirePermission('logistics', READ|WRITE)`. Tenant resolved via the
  parent order (`orders.hospitalId` / `orders.vendorId`); cross-tenant → Forbidden
  (logistics.ts:28–44).
- **Steps:**
  1. List/detail returns shipment + cold-chain fields (`coldChainRequired`, `lastTempC/At`,
     `hadExcursion`, `latestStatus`, `podAttachment`) + recent temp readings.
  2. `/eta` updates `etaAt` (carrier webhook target).
  3. `/temp` ingests a reading; flags an excursion when `temperatureC` is outside
     `coldChainSpecMinC..MaxC`; writes a `shipment_temp_logs` row and **stamps the shipment** with
     `lastTempC/At` and a **sticky** `hadExcursion` flag (once true, stays true) (logistics.ts:106–146).
- **State machine:** n/a (excursion is a sticky boolean, not a status enum).
- **Side effects:** `shipment_temp_logs` inserts; `order_shipments` last-reading + excursion stamp.
  No outbound notification in this route (UI badge only).
- **Source:** `packages/api/src/routes/logistics.ts` (tables `order_shipments`, `shipment_temp_logs`,
  `orders`).

### W6-17: Item-master hygiene (duplicates / missing / unmapped)
- **Actors:** Hospital data-quality / formulary owners, Admin.
- **Trigger:** Periodic formulary cleanup.
- **Entry points:** Item Master Hygiene page (`packages/web/src/features/admin/pages/ItemMasterHygiene.tsx`) ·
  `GET /api/item-master-hygiene/duplicates`, `/missing`, `/unmapped`.
- **Permissions / tenant scope:** `requirePermission('formulary', 'READ')`. `scopeHospital()` requires a
  `hospitalId` (admins may pass `?hospitalId`) (itemMasterHygiene.ts:24–29).
- **Steps:**
  - **duplicates** — groups ACTIVE `formulary_items` by `(hcpc_code, lower 40-char description prefix)`,
    returns groups with `row_count > 1` plus their `ids` (operator chooses which to keep). This is a
    *report*; the merge itself is performed in the UI/other endpoints (no merge handler here).
  - **missing** — items lacking `hcpcCode` / `description` / `preferredVendorId`, annotated with
    `missingFields[]`.
  - **unmapped** — ACTIVE items with no matching `vendor_item_skus` row (no purchase path).
- **State machine:** n/a.
- **Side effects:** none (read-only reports).
  > **Ambiguity flag:** Task brief calls this a "find + merge duplicates" tool, but this route file only
  > exposes the three read/diagnose reports — no merge mutation endpoint is present here.
- **Source:** `packages/api/src/routes/itemMasterHygiene.ts`.

### W6-18: Demand forecasting (order-history statistics)
- **Actors:** Hospital users (own hospital), Admin (any / all).
- **Trigger:** Weekly reorder planning.
- **Entry points:** Forecast page (`packages/web/src/features/reporting/pages/Forecast.tsx`) ·
  `GET /api/forecasting/demand`, `GET /api/forecasting/monthly-series/:hcpcCode`.
- **Permissions / tenant scope:** No `requirePermission` gate; hospital filter applied unless
  `userType==='ADMIN'` or admin role (forecasting.ts:31–34). Admins may pass `?hospitalId`.
- **Steps:** Aggregates 12 months of `orders`+`order_items` by `(hcpc, hospital, month)`; computes
  trailing-3 / trailing-12 monthly averages and a `trendPct`. A **reorder suggestion** fires when the
  item was ordered in ≥2 of last 3 months AND >21 days since last order AND 3-mo avg ≥ 1/mo; priority
  `CRITICAL` (>60d & avg≥3) / `HIGH` (>35d) / `NORMAL` (forecasting.ts:101–112). Monthly-series powers a
  per-HCPC chart.
- **State machine:** n/a.
- **Side effects:** none (read-only; uses raw SQL with escaped hospitalId interpolation).
- **Source:** `packages/api/src/routes/forecasting.ts`.

### W6-19: Hospital-side demand forecast service (seasonality projection)
- **Actors:** Hospital users; cached run.
- **Trigger:** On-demand forecast run (consumed by `HospitalForecast.tsx`).
- **Entry points:** Hospital Forecast page (`packages/web/src/features/reporting/pages/HospitalForecast.tsx`) ·
  service `forecastHospitalDemand(d1, hospitalId, byUserId, horizonMonths=3, lookbackMonths=12)`.
- **Steps:** Sums `(hcpc × month)` quantities over the lookback window, computes `trailing12Avg`, and
  projects each horizon month using a same-month-last-year seasonality factor
  (`projection = round(avg * seasonality)`, floored at 0). Caches the result in
  `hospital_forecast_runs.results_json`.
- **State machine:** n/a.
- **Side effects:** Inserts a `hospital_forecast_runs` row.
- **Source:** `packages/api/src/services/hospitalForecastService.ts`.
  > Note: the brief lists this under `/api/forecasting`; the HTTP route exposing it was not located in
  > the owned route files — it appears to be invoked by a hospital-forecast route outside this set.
  > Flag as service documented; HTTP mount unverified here.

### W6-20: General reporting hub (spend, KPIs, scorecard, leakage, exports)
- **Actors:** Hospital / Vendor (scoped) / Admin (broad).
- **Trigger:** Analytics dashboards and export downloads.
- **Entry points:** Reports dispatcher (`packages/web/src/features/reporting/pages/Reports.tsx`) plus
  focused pages (`MultiSiteSpend`, `DepartmentSpend`, `ContractLeakage`, `VendorScorecards`,
  `PriceVariance`, `ClinicalConsumption`, `ChargeCaptureLeakage`) ·
  `GET /api/reports/spend-by-vendor`, `/spend-by-hcpc`, `/spend-by-month`, `/orders-by-status`,
  `/orders-by-vendor`, `/vendor-kpis`, `/executive-summary`, `/unbilled-transactions`,
  `/orders-modified`, `/orders-cancelled`, `/vendor-scorecard`, `/compliance/users`,
  `/compliance/credentials`, `/compliance/network-access`, `/spend-by-physician`, `/spend-by-facility`,
  `/spend-by-department`, `/multi-site-rollup`, `/contract-leakage`, `/:reportType/csv`,
  `/orders.xlsx`, `/invoices.xlsx`, `/spend.xlsx`.
- **Permissions / tenant scope:** No `requirePermission`; role scoping done inline via
  `buildInvoiceConditions` / `buildOrderConditions` — `HOSPITAL` filtered to `hospitalId`, `VENDOR` to
  `vendorId`, admin may pass `hospitalId`/`vendorId` (reporting.ts:30–81). Several admin-aggregate
  reports use raw SQL with escaped identifiers.
- **Steps:** Each endpoint runs an aggregation (spend by dimension, order status mix, vendor KPI/
  scorecard, executive summary, unbilled, contract leakage > 2% over best contract/GPO price) and
  returns JSON; CSV/XLSX endpoints stream downloads (`xlsxService`).
- **State machine:** n/a.
- **Side effects:** none (read-only).
- **Related services/crons:** `services/xlsxService`.
- **Source:** `packages/api/src/routes/reporting.ts`.

### W6-21: Hospital CRUD
- **Actors:** Admin (create/delete, any update), hospital users (read/update own), provider users
  (read own-network).
- **Trigger:** Onboarding/maintaining hospital tenants.
- **Entry points:** Hospitals page (`packages/web/src/features/hospitals/pages/HospitalsPage.tsx`) ·
  `GET/POST /api/hospitals`, `GET/PUT/DELETE /api/hospitals/:id`.
- **Permissions / tenant scope:** No `requirePermission`; `requireAdmin(user)` (`userType==='ADMIN'`)
  on create + delete (hospitals.ts:78–81, 148–151). List scoped by `providerId`; detail blocks hospital
  users from other hospitals and providers outside their network; PUT allowed for admin or own hospital
  (hospitals.ts:66–72, 129–131). Mass-assignment guarded by `stripImmutableFields`.
- **State machine:** n/a.
- **Side effects:** Hard `DELETE` (no soft-delete) on delete.
- **Source:** `packages/api/src/routes/hospitals.ts`.

### W6-22: Facility CRUD
- **Actors:** Hospital admins (own hospital), Admin (any via `?hospitalId`), providers.
- **Trigger:** Managing physical sites within a hospital.
- **Entry points:** Hospital Facilities page (`packages/web/src/features/hospitalManagement/pages/HospitalFacilities.tsx`) ·
  `GET/POST /api/hospital-facilities`, `GET/PUT/DELETE /api/hospital-facilities/:id`.
- **Permissions / tenant scope:** `requirePermission('facilities', READ|WRITE)`; delete requires
  `FULL`. `getHospitalScope()` derives `hospitalId` from `HOSPITAL` user or admin/provider `?hospitalId`
  (hospitalFacilities.ts:11–16).
- **State machine (status):** `ACTIVE` (default) ; delete is a **soft delete** → `status='INACTIVE'`
  (hospitalFacilities.ts:148).
- **Side effects:** none beyond row writes.
- **Source:** `packages/api/src/routes/hospitalFacilities.ts`.

### W6-23: Department CRUD (costCenter / glCode / serviceLine)
- **Actors:** Hospital admins (own hospital), Admin, providers.
- **Trigger:** Managing departments and their financial/ops metadata for spend reporting + GL posting.
- **Entry points:** Hospital Departments page (`packages/web/src/features/hospitalManagement/pages/HospitalDepartments.tsx`) ·
  `GET/POST /api/hospital-departments`, `GET/PUT/DELETE /api/hospital-departments/:id`.
- **Permissions / tenant scope:** `requirePermission('departments', READ|WRITE)`; delete requires
  `FULL`. `getHospitalScope()` as in W6-22 (hospitalDepartments.ts:11–16, 27).
- **Steps:** Create/update persist procurement metadata `costCenter`, `glCode`, `serviceLine`
  (Procurement gap 1) alongside `name`/`number`/`facilityId` (hospitalDepartments.ts:114–117, 140–142).
  List joins `hospital_facilities` for `facilityName` and supports sort/paging.
- **State machine (status):** `ACTIVE` (default); delete is a **soft delete** → `status='INACTIVE'`.
- **Side effects:** `costCenter`/`glCode`/`serviceLine` feed `spend-by-department` and the GL ledger.
- **Source:** `packages/api/src/routes/hospitalDepartments.ts`.

---

## State-machine diagrams

### Inventory transfer (`/api/transfers`)

```
        approve            ship (stamp shippedAt)     receive (stamp receivedAt)
REQUESTED ───────▶ APPROVED ──────────────────▶ SHIPPED ─────────────────────▶ RECEIVED (terminal)
   │                  │                            │
   └──────────────────┴────────────────────────────┘
                 cancel (from any of REQUESTED / APPROVED / SHIPPED)
                                  ▼
                              CANCELLED (terminal)
```
Enum: `TRANSFER_STATES = ['REQUESTED','APPROVED','SHIPPED','RECEIVED','CANCELLED']`.
Illegal transitions → `409 ConflictError "Can't transition from X to Y"`.

### Vendor RMA (`/api/rmas`)

```
                       submit            approve            ship             receive          credit
DRAFT ───────────────▶ SUBMITTED ──────▶ APPROVED ───────▶ SHIPPED ───────▶ RECEIVED ──────▶ CREDITED (terminal)
  │                       │  │
  │                       │  └── reject ──▶ REJECTED (terminal)
  │                       │
  └───────────────────────┴──────────────── cancel (rmas:FULL) ───────────────┐
        (cancel allowed from DRAFT / SUBMITTED / APPROVED / SHIPPED)            ▼
                                                                            CANCELLED (terminal)
```
Enum: `RMA_STATES = ['DRAFT','SUBMITTED','APPROVED','SHIPPED','RECEIVED','CREDITED','REJECTED','CANCELLED']`.
Reasons: `['DAMAGED','WRONG_ITEM','SHORT_DATED','DEFECTIVE','OTHER']`.
**Auto-spawn:** GRN `DAMAGED`/`WRONG_ITEM` lines → one DRAFT RMA per (vendor, condition) bucket
(`routes/goodsReceipts.ts:366–426`).

### Recall (`/api/recalls`)

```
POST /recalls  ─▶ OPEN ───────────────────────────────────────▶ CLOSED (terminal)
                   │                                close requires ALL affected
                   │ (auto-scan fan-out on create)  items dispositioned, admin-only
                   ▼
   recall_affected_items rows + side effects:
     • LAB_LOT  matches → status set QUARANTINED (if action QUARANTINE/RETURN/DESTROY)
     • POU_EVENT matches → carry hospitalId + patientMrn (patient-notification candidates)
```
Enums: `RECALL_STATES = ['OPEN','INVESTIGATING','CLOSED']` (`INVESTIGATING` defined but unused);
`RECALL_CLASSIFICATIONS = ['CLASS_I','CLASS_II','CLASS_III']`;
`RECALL_ACTIONS = ['QUARANTINE','RETURN','DESTROY','NOTIFY_PATIENT']`;
`RECALL_DISPOSITIONS = ['QUARANTINED','RETURNED','DESTROYED','PATIENT_NOTIFIED','NOT_FOUND']`.

### Recall notification fan-out (on `POST /api/recalls`)

```
                         ┌─────────────────────────────────────────────┐
   POST /recalls         │ match by hcpcCode (+ optional lotNumbers[])  │
  (CLASS_x, action) ─────▶                                              │
                         └───────────────┬──────────────┬──────────────┘
                                         │              │
                       ┌─────────────────▼───┐   ┌──────▼───────────────────────┐
                       │ lab_inventory_lots   │   │ point_of_use_events          │
                       │ (status = ACTIVE)    │   │ (hcpcCode [+ lotNumber])      │
                       └─────────┬────────────┘   └──────────┬───────────────────┘
                                 │                            │
            recall_affected_items(kind=LAB_LOT)   recall_affected_items(kind=POU_EVENT,
            + if action ∈ {QUARANTINE,RETURN,       hospitalId, patientMrn)
              DESTROY}: lot.status = QUARANTINED     → patient-notification candidates
```

### Compliance alert severity (sweep, W6-13)

```
days-to-expiry ≤ 60  →  INFO        days ≤ 30  →  WARN        days ≤ 7  →  CRITICAL
(only the tightest matching threshold emits a row; INSERT OR IGNORE = idempotent per day)
auto-resolve: expires_on now > 60 days out  →  resolved_at set
```

## Cron summary (this domain)

| Schedule | Handler | Workflow |
|----------|---------|----------|
| `0 8 * * *` (daily) | `sweepComplianceAlerts` (via dynamic import) | W6-13 |
| `0 8 * * *` (daily) | `handleExpiryNotifications` | W6-14 |
| `0 6 1 * *` (monthly) | `handleOigRefresh` | W6-15 |

Registered in `packages/api/src/index.ts:336–477`.

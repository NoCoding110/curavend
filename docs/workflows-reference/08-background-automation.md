# 08 — Background Automation Workflows (cron, queues, jobs)

Scope: every scheduled task, queue consumer, and async job that runs without a
direct user request. Curavend uses Cloudflare Workers Cron Triggers
(`scheduled()` in `packages/api/src/index.ts:336`), a Cloudflare Queue consumer
(`queue()` at `:482`, bound as `EVENTS_QUEUE`), and one library job
(`jobs/pushOrderToErp.ts`) invoked from a queue handler.

Cron handlers dispatch on the exact `event.cron` string. There are three
schedules. Each `*/15` and `0 8` schedule fans out to multiple handlers via
`ctx.waitUntil(...)`; failures in one handler are isolated and logged, never
halting the others.

## Master cron map (`cron expression → handlers fired`)

| Cron expression | Cadence | Handlers fired (in order) | Source |
| --- | --- | --- | --- |
| `*/15 * * * *` | every 15 min | `sweepExpiredEventWaits` (W8-01); `handleDelayedOrderNotifications` (W8-02); `handleIntegrationRetry` (W8-03); `runAllStockPolls` (W8-04) | `index.ts:338-364` |
| `0 8 * * *` | daily 08:00 UTC | `handleExpiryNotifications` (W8-05); `handleContractLifecycle` (W8-06); `handleRecurringOrderSpawner` (W8-07); `handleOrderSlaMonitor` (W8-08); `handleKitLetterSync` (W8-09); `handleRentalBilling` (W8-10); `handleDmeposExpiry` (W8-11); `handleLabAutoReplenishment` (W8-12); `handleLabExpiration` (W8-13); `sweepComplianceAlerts` (W8-14); `handlePractitionerSync` (W8-15a); `computeVendorScorecards` (W8-15b) | `index.ts:366-462` |
| `0 6 1 * *` | monthly, 1st @ 06:00 UTC | `handleOigRefresh` (W8-16) | `index.ts:464-472` |

Queue (`EVENTS_QUEUE`) event types → handlers (`index.ts:487-517`): `order.created`,
`order.status_changed`, `order.shipped`, `order.delivered`, `chat.new_message`,
`invoice.created`, `invoice.sent`, `invoice.paid`, `workflow.step`. On error a
message is `retry()`-ed; otherwise `ack()`-ed.

## Workflow index

Crons:
- **W8-01** — Workflow event-wait timeout sweep
- **W8-02** — Delayed order notifier
- **W8-03** — Integration retry / dead-letter sweep
- **W8-04** — Vendor stock-feed poll
- **W8-05** — Credential / contract / fee-schedule expiry notifier
- **W8-06** — Contract lifecycle (activate / expire / remind)
- **W8-07** — Recurring order spawner
- **W8-08** — Order SLA breach monitor (5 checks)
- **W8-09** — Kit-letter catalog sync
- **W8-10** — DME rental billing sweep
- **W8-11** — DMEPOS supplier-compliance expiry sweep
- **W8-12** — Lab auto-replenishment
- **W8-13** — Lab lot expiration sweep
- **W8-14** — Compliance alert sweep
- **W8-15** — Epic Practitioner directory sync (15a) + vendor scorecard compute (15b)
- **W8-16** — Monthly OIG LEIE refresh

Queues:
- **W8-17** — order.created consumer
- **W8-18** — order.status_changed consumer (+ ERP push, chat-room create, invoice.created emit)
- **W8-19** — order.shipped / order.delivered consumers
- **W8-20** — invoice.created / invoice.sent / invoice.paid consumers
- **W8-21** — chat.new_message consumer
- **W8-22** — workflow.step consumer

Job:
- **W8-23** — pushOrderToErp (ERP connector push)

---

### W8-01: Workflow event-wait timeout sweep
- **Actors:** System-cron
- **Trigger:** `*/15 * * * *`
- **Entry points:** `sweepExpiredEventWaits(env)` (`services/workflowService.ts:454`)
- **Permissions / tenant scope:** Platform-wide.
- **Steps:** Selects `workflow_instances` where `status='WAITING_FOR_EVENT'` and `eventWaitExpiresAt < now`; sets each to `FAILED` with `errorMessage='Event timeout: <waitingForEvent>'` and `completedAt`.
- **State machine:** `WAITING_FOR_EVENT → FAILED`.
- **Side effects:** workflow_instances updates; returns `{expired}`.
- **Related services:** workflowService.ts.
- **Source:** `cron driven from index.ts:340-346`; `services/workflowService.ts:454-478`.

### W8-02: Delayed order notifier
- **Actors:** System-cron
- **Trigger:** `*/15 * * * *`
- **Entry points:** `handleDelayedOrderNotifications(env)`
- **Permissions / tenant scope:** All hospitals (limit 50 per run).
- **Steps:** Finds orders with `notifiedHospital=0` and `createdAt < now-15min` (the comment says VENDOR_ASSIGNED >15min, but the query keys on `notifiedHospital` + age). For each: in-app `notifyHospitalUsers` ("awaiting vendor action"), optional email to hospital shared inbox, then set `notifiedHospital=1`.
- **State machine:** order flag `notifiedHospital` 0→1.
- **Side effects:** notifications, emails, order flag update.
- **Related services:** emailService, notificationHelpers.
- **Source:** `cron/delayedOrderNotifier.ts`.

### W8-03: Integration retry / dead-letter sweep
- **Actors:** System-cron
- **Trigger:** `*/15 * * * *`
- **Entry points:** `handleIntegrationRetry(env)`
- **Permissions / tenant scope:** Platform-wide.
- **Steps:** Selects `integration_log` rows `status='RETRYING'` with `attemptCount >= MAX_ATTEMPTS (5)` → promotes to `DEAD_LETTER` (`nextRetryAt=null`). Logs a status-count summary. (Re-firing of arbitrary calls is a future enhancement; today the sweep only ages out stuck rows.) Pairs with the operator retry/abort tooling in file 07 W7-14.
- **State machine:** `RETRYING → DEAD_LETTER`.
- **Side effects:** integration_log updates.
- **Related services:** integrationLog schema.
- **Source:** `cron/integrationRetry.ts`.

### W8-04: Vendor stock-feed poll
- **Actors:** System-cron
- **Trigger:** `*/15 * * * *`
- **Entry points:** `runAllStockPolls({ env })` (`services/vendorStockConnectors.ts`)
- **Permissions / tenant scope:** All active stock-feed connectors.
- **Steps:** Polls each active vendor stock-feed connector and ingests inventory levels. Returns `{attempted, ok, failed}` (logged).
- **State machine:** n/a (per-connector).
- **Side effects:** stock/inventory updates per connector.
- **Related services:** vendorStockConnectors.ts.
- **Source:** `index.ts:354-363`; `services/vendorStockConnectors.ts`.

### W8-05: Credential / contract / fee-schedule expiry notifier
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleExpiryNotifications(env)`
- **Permissions / tenant scope:** Vendors + contracts + fee schedules (limit 100 each).
- **Steps:** Finds vendor accreditation/state-license/liability-insurance dates ≤ now+30d → email + in-app `notifyVendorUsers`. Contracts with `endDate < now+30d` → `notifyVendorUsers` (NO_REDIRECT). Custom fee schedules with `endDate < now+30d` → notify.
- **State machine:** n/a (re-notifies daily; intentional, no cross-day dedup).
- **Side effects:** emails + in-app notifications.
- **Related services:** emailService, notificationHelpers.
- **Source:** `cron/expiryNotifier.ts`.

### W8-06: Contract lifecycle (activate / expire / remind)
- **Actors:** System-cron (`SYSTEM_USER_ID='cron-contract-lifecycle'`)
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleContractLifecycle(env)`
- **Permissions / tenant scope:** All contracts.
- **Steps:**
  1. `APPROVED → ACTIVE` when `startDate ≤ today`; insert `contract_history`.
  2. `ACTIVE → EXPIRED` when `endDate < today`; insert history + `notifyContractEvent(...,'expired')`.
  3. Expiring reminders at exactly 30/14/7 days before `endDate` → `notifyContractEvent(...,'expiring')` (daily reminder in last week is intentional).
- **State machine:** contract `APPROVED → ACTIVE → EXPIRED`.
- **Side effects:** contract status, contract_history rows, notifications.
- **Related services:** contractNotifications.ts.
- **Source:** `cron/contractLifecycle.ts`.

### W8-07: Recurring order spawner
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleRecurringOrderSpawner(env)`
- **Permissions / tenant scope:** All ACTIVE recurrence plans due.
- **Steps:**
  1. Auto-resume: `PAUSED` plans with `pauseUntil ≤ today` → `ACTIVE`.
  2. Find ACTIVE plans where `nextOccurrenceDate − leadTimeDays ≤ today`.
  3. Idempotency: skip if a child order exists for `(recurrencePlanId, recurrenceIndex)` (DB partial UNIQUE index is the second guard; UNIQUE race treated as benign no-op).
  4. Clone template order + items; child status `IN_PROGRESS/VENDOR_ASSIGNED` if plan has a vendor, else `PENDING/NEW_ORDER`; insert `order_history`; enqueue `order.created`.
  5. Advance plan: compute next occurrence; reauth gate (`requireReauthEvery` boundary) → `PAUSED` reason `INSURANCE_REAUTH_REQUIRED`; `totalOccurrences` cap or no next date → `COMPLETED`.
- **State machine:** plan `ACTIVE ↔ PAUSED`, `ACTIVE/PAUSED → COMPLETED`; child order created at PENDING or IN_PROGRESS.
- **Side effects:** new orders + items + history; `order.created` enqueue; plan updates. Returns `{considered, spawned, paused, completed, errors}`.
- **Related services:** lib/recurrence, sequenceMinter, EVENTS_QUEUE.
- **Source:** `cron/recurringOrderSpawner.ts`.

### W8-08: Order SLA breach monitor (5 checks)
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleOrderSlaMonitor(env)` — each check try/catch-isolated.
- **Permissions / tenant scope:** Grouped per tenant (hospitalId or labGroupId) → one email per tenant per event.
- **Steps (checks):**
  1. `ORDER_AWAITING_APPROVAL_SLA`: PENDING + sub ∈ {NEW_ORDER, ORDER_REQUESTED_FOR_MODIFY}, `createdAt` > 48h.
  2. `ORDER_FULFILLMENT_STALLED_SLA`: IN_PROGRESS + sub ∈ {VENDOR_CONFIRMED_RECEIPT, PATIENT_VISITED_AND_ASSESSED}, `updatedAt` > 48h.
  3. `ORDER_NO_SHIPMENT_SLA`: sub ∈ {VENDOR_ASSIGNED, VENDOR_CONFIRMED_RECEIPT}, no shipment row, `updatedAt` > 24h.
  4. `LAB_ORDER_APPROVAL_OVERDUE`: lab status `READY_FOR_APPROVAL` > 48h.
  5. `LAB_ORDER_WORKFLOW_FAILED`: `workflow_instances` type `LAB_ORDER_ASSET_GEN` status `FAILED` > 1h.
  - Dedup: per (event, entity) suppressed 30 min via `notification_delivery_log` (`recentlyDispatched`); multi-row emails log per-entity SENT rows so each dedups independently.
- **State machine:** n/a (read + notify).
- **Side effects:** grouped SLA-breach emails + delivery-log rows. Returns counts per check + errors[].
- **Related services:** notificationRouter (`dispatchCustomerEvent`), emailService (`slaBreachTemplate`).
- **Source:** `cron/orderSlaMonitor.ts`.

### W8-09: Kit-letter catalog sync
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleKitLetterSync(env)` → `syncKitLetters(env, {dryRun:false})`
- **Permissions / tenant scope:** Platform-wide.
- **Steps:** Polls the external kit-letter catalog and upserts to local DB. Returns a `KitLetterSyncReport`.
- **State machine:** n/a.
- **Side effects:** kit-letter table upserts.
- **Related services:** kitLetterSyncService.ts.
- **Source:** `cron/kitLetterSync.ts`; `services/kitLetterSyncService.ts:62`.

### W8-10: DME rental billing sweep
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleRentalBilling(env)`
- **Permissions / tenant scope:** All `dme_rental_periods` status `SCHEDULED` with `periodEnd ≤ today`.
- **Steps:** Per due period: resolve order + DME extension (rentalType, default CAPPED_RENTAL). Cap enforcement (`RENTAL_CAPS`: CAPPED_RENTAL 13, OXYGEN_RENTAL 36, INEXPENSIVE_ROUTINELY 1, PARENTERAL_ENTERAL 99, PURCHASE 1, NOT_APPLICABLE 0) — period beyond cap → `TERMINATED` (ownership transfers). Else mint invoice number, insert `invoices` (status `INVOICE_GENERATED`) + `invoice_items` (code `RENTAL`); mark period `BILLED` with `invoiceId`. Missing order → `SKIPPED`.
- **State machine:** rental period `SCHEDULED → BILLED | TERMINATED | SKIPPED`.
- **Side effects:** invoices + invoice items; period updates. Returns `{processed, billed, capped, errors}`. (Companion `initializeRentalPeriods` spawns SCHEDULED periods at order create — invoked elsewhere, not by cron.)
- **Related services:** sequenceService.
- **Source:** `cron/dmeRentalBilling.ts`.

### W8-11: DMEPOS supplier-compliance expiry sweep
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleDmeposExpiry(env)`
- **Permissions / tenant scope:** Notifies platform admins (`ACCOUNT_MANAGER`, `ACCOUNT_MANAGER_USER`).
- **Steps:** Collects `vendor_compliance_docs` (active, `expirationDate ≤ now+30d`) and `vendor_dmepos_compliance` accreditation / surety-bond expiries; groups by vendor; one consolidated in-app notification per vendor per run to each admin (message differs for already-EXPIRED vs expiring-soon).
- **State machine:** n/a.
- **Side effects:** in-app notifications. Returns `{notified, expiring, alreadyExpired}`.
- **Related services:** NotificationService.
- **Source:** `cron/dmeposExpiry.ts`.

### W8-12: Lab auto-replenishment
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleLabAutoReplenishment(env)` (`services/labReplenishmentService.ts:151`)
- **Permissions / tenant scope:** Lab inventory items below reorder threshold.
- **Steps:** Considers lab items, computes forecast/reorder need, and creates replenishment requisitions (skips items that already have an open one).
- **State machine:** n/a (creates requisitions).
- **Side effects:** lab replenishment requisitions. Returns `{itemsConsidered, requisitionsCreated, skippedExisting, errors}`.
- **Related services:** labReplenishmentService.ts.
- **Source:** `cron/labReplenishment.ts` (re-export); `services/labReplenishmentService.ts:151`.

### W8-13: Lab lot expiration sweep
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handleLabExpiration(env)` (`services/labReplenishmentService.ts:299`)
- **Permissions / tenant scope:** Lab lots.
- **Steps:** Flags expired lots and bins of expiring-soon lots (30/60/90 day horizons).
- **State machine:** lot status flagged expired.
- **Side effects:** lot status updates / alerts. Returns `{expired, expiringIn30, expiringIn60, expiringIn90}`.
- **Related services:** labReplenishmentService.ts.
- **Source:** `cron/labReplenishment.ts`; `services/labReplenishmentService.ts:299`.

### W8-14: Compliance alert sweep
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `sweepComplianceAlerts(env.DB)` (`services/complianceAlertService.ts:76`)
- **Permissions / tenant scope:** Platform-wide (vendor accreditation/license/insurance + lab lots).
- **Steps:** Generates/resolves unified compliance alerts. Returns `{vendorAccreditation, vendorLicense, vendorInsurance, labLots, resolved}`.
- **State machine:** alert open/resolved.
- **Side effects:** compliance alert rows.
- **Related services:** complianceAlertService.ts.
- **Source:** `index.ts:428-438`; `services/complianceAlertService.ts:76`.

### W8-15: Epic Practitioner directory sync (15a) + vendor scorecard compute (15b)
- **Actors:** System-cron
- **Trigger:** `0 8 * * *`
- **Entry points:** `handlePractitionerSync(env)` (15a); `computeVendorScorecards(env.DB)` (15b)
- **Permissions / tenant scope:** 15a: active EPIC connections only (Backend Services). 15b: all vendors.
- **Steps:**
  - **15a:** For each active EPIC connection with `fhirBaseUrl`+`authClientId`, system-mode `Practitioner?_count=100` paginated up to 100 pages (10k cap), maps each active Practitioner, caches in KV by id, by NPI (`epic:practitioner-by-npi:...`), and a per-connection summary (`epic:practitioners:{connId}`), TTL 30d. Errors per connection isolated. Returns `{connectionsAttempted, connectionsSucceeded, connectionsFailed, totalPractitionersSynced, errors}`. (See file 07 W7-09 for the Backend-Services token.)
  - **15b:** Recomputes vendor scorecard snapshots. Returns `{vendorsProcessed, snapshotsWritten, errors}`.
- **State machine:** n/a.
- **Side effects:** 15a: KV practitioner cache; 15b: scorecard snapshot rows.
- **Related services:** fhir/fhirClient.ts, backendServicesAuth.ts; vendorScorecardService.ts.
- **Source:** `cron/practitionerSync.ts`; `index.ts:450-461`; `services/vendorScorecardService.ts:28`.

### W8-16: Monthly OIG LEIE refresh
- **Actors:** System-cron
- **Trigger:** `0 6 1 * *` (1st of month, 06:00 UTC)
- **Entry points:** `handleOigRefresh(env)`; then writes KV `oig:last_refresh`
- **Permissions / tenant scope:** Platform-wide.
- **Steps:** Fetches the public HHS/OIG LEIE CSV (`https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv`, 60s timeout); truncates `oig_exclusion_list`; bulk-inserts all rows (batch 50). Companion `screenOig()` checks an entity against the list (NPI/EIN/name) for non-reinstated exclusions.
- **State machine:** n/a (full table replacement).
- **Side effects:** `oig_exclusion_list` truncate+reload; KV `oig:last_refresh`.
- **Related services:** —
- **Source:** `cron/oigScreeningRefresh.ts`; `index.ts:464-472`.

### W8-17: order.created consumer
- **Actors:** Queue consumer
- **Trigger:** `EVENTS_QUEUE` event `order.created`
- **Entry points:** `handleOrderCreated(env, {orderId})`
- **Steps:** Notify hospital users ("New order created"); if vendor assigned, notify vendor; send customer-facing order-confirmation email (`ORDER_CONFIRMATION` via `dispatchCustomerEvent`).
- **State machine:** n/a.
- **Side effects:** notifications + email.
- **Related services:** notificationHelpers, notificationRouter, customerEmailTemplates.
- **Source:** `queues/orderEvents.ts:14-73`; dispatch `index.ts:488-490`.

### W8-18: order.status_changed consumer
- **Actors:** Queue consumer
- **Trigger:** `EVENTS_QUEUE` event `order.status_changed`
- **Entry points:** `handleOrderStatusChanged(env, {orderId, newStatus, newSubStatus, oldStatus, changedByUserId})`
- **Steps:** Pick a status message; vendor-triggered substatuses → notify hospital; hospital-triggered (VENDOR_ASSIGNED, FACILITY_CANCELLED, CANCELLED, SPEND_CONFIRMED) → notify vendor. On `VENDOR_ASSIGNED` auto-create a chat `rooms` row if none. On `ORDER_COMPLETED` with an invoice → enqueue `invoice.created`. Always calls `pushOrderToErp` for connectors whose `triggerEvent` matches the new substatus (W8-23).
- **State machine:** drives downstream notifications, not order state itself.
- **Side effects:** notifications, chat room, `invoice.created` enqueue, ERP push.
- **Related services:** notificationHelpers, jobs/pushOrderToErp.ts.
- **Source:** `queues/orderEvents.ts:162-271`; dispatch `index.ts:491-493`.

### W8-19: order.shipped / order.delivered consumers
- **Actors:** Queue consumer
- **Trigger:** events `order.shipped`, `order.delivered`
- **Entry points:** `handleOrderShipped`, `handleOrderDelivered`
- **Steps:** shipped → customer `ORDER_SHIPPED` email (carrier/tracking/vendor tracking template). delivered → `ORDER_DELIVERED` email (POD url, delivered-at).
- **State machine:** n/a.
- **Side effects:** customer emails.
- **Related services:** notificationRouter, customerEmailTemplates.
- **Source:** `queues/orderEvents.ts:76-160`; dispatch `index.ts:494-499`.

### W8-20: invoice.created / invoice.sent / invoice.paid consumers
- **Actors:** Queue consumer
- **Trigger:** events `invoice.created`, `invoice.sent`, `invoice.paid`
- **Entry points:** `handleInvoiceCreated`, `handleInvoiceSent`, `handleInvoicePaid`
- **Steps:** created → notify vendor; sent → notify hospital ("payment due") + email; paid → notify vendor + customer-facing `INVOICE_PAID` receipt email. `invoice.paid` is enqueued by the Stripe webhook (file 07 W7-12).
- **State machine:** n/a.
- **Side effects:** notifications + emails.
- **Related services:** notificationHelpers, notificationRouter, customerEmailTemplates.
- **Source:** `queues/invoiceEvents.ts`; dispatch `index.ts:503-511`.

### W8-21: chat.new_message consumer
- **Actors:** Queue consumer
- **Trigger:** event `chat.new_message`
- **Entry points:** `handleChatMessage(env, {roomId, messageId, senderUserId})`
- **Steps:** Resolve room/message/sender; determine receivers on the opposite side (active users of the room's vendor or hospital, excluding sender); in-app notification (redirect ROOM) + email preview to each.
- **State machine:** n/a.
- **Side effects:** notifications + emails.
- **Related services:** NotificationService, EmailService.
- **Source:** `queues/chatEvents.ts`; dispatch `index.ts:500-502`.

### W8-22: workflow.step consumer
- **Actors:** Queue consumer
- **Trigger:** event `workflow.step` (`payload.instanceId`)
- **Entry points:** `runWorkflowStep(env, instanceId)` → `workflowService.runStep`
- **Steps:** Advances one step of a workflow instance (the asset-gen / control-plane state machine). Drives instance `status`/`currentStep`; can move to `WAITING_FOR_EVENT` (swept by W8-01) or `FAILED`.
- **State machine:** workflow_instances step/status progression.
- **Side effects:** workflow_instances + activity-log rows.
- **Related services:** workflowService.ts.
- **Source:** `index.ts:512-514`; `services/workflowService.ts:83 (runStep)`.

### W8-23: pushOrderToErp (ERP connector push)
- **Actors:** Job (invoked from W8-18 queue handler)
- **Trigger:** order substatus change matching an active connector's `triggerEvent`
- **Entry points:** `pushOrderToErp(env, {orderId, triggerEvent})`
- **Permissions / tenant scope:** Per-vendor active `vendor_erp_connectors` with matching trigger. Outbound URL SSRF-guarded (`assertPublicHttpUrl`).
- **Steps:** Build transform context (order, vendor, hospital, facility, items enriched with vendor SKU/pack math). For each connector: `MANUAL`/`EDI_850` skipped (EDI logs a stub row); else apply field map → JSON, resolve Bearer secret from env, `WEBHOOK_POST` adds HMAC-SHA256 signature header; POST with up to 3 attempts (backoff 0/2/6s, 10s timeout); one `vendor_erp_push_log` row per attempt; update connector `lastPushedAt/lastSuccessAt/lastError`.
- **State machine:** per-attempt log status `OK | RETRYING | FAILED`; connector final `OK | FAILED | SKIPPED`.
- **Side effects:** outbound HTTP, push-log rows, connector timestamps.
- **Related services:** lib/erpFieldMap, lib/safeFetch.
- **Source:** `jobs/pushOrderToErp.ts`.

---

## Notes / ambiguities

- `handleDelayedOrderNotifications` (W8-02) file comment says "VENDOR_ASSIGNED >15
  min" but the actual query filters on `notifiedHospital=0 AND createdAt < now-15min`
  without a substatus filter. Documented per the code.
- W8-12/W8-13 are thin cron wrappers re-exporting from
  `services/labReplenishmentService.ts`; detailed internal logic lives there
  (only the return shapes were confirmed from the service signatures + index.ts
  log lines).
- `runAllStockPolls` (W8-04), `sweepComplianceAlerts` (W8-14), and
  `computeVendorScorecards` (W8-15b) were documented from their exported
  signatures + `index.ts` summary log lines; their full internal logic was not
  line-by-line read.
- `initializeRentalPeriods` (in `dmeRentalBilling.ts`) is a helper invoked on
  order create, not by the cron itself.

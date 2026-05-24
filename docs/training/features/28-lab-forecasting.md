# Lab Forecasting + Auto-Replenishment

## What it does

**Lab Forecasting** turns recent test-run history into a per-consumable, per-site 30-day demand projection so the lab never runs out of an EDTA tube on a Monday morning. It pairs with an **auto-replenishment cron** that walks the forecast nightly, finds items below their reorder point, and creates `SUBMITTED` requisitions — pre-grouped by hospital × preferred vendor and routed through the existing [approval rules engine](./05-approvals.md).

There are two distinct moving parts:

1. **`forecastDemand()`** — a read-only function exposed at `GET /api/lab-inventory/forecast`. Anyone with lab access can query it on-demand.
2. **`handleLabAutoReplenishment()`** — a cron job that runs daily and writes requisitions. There is no UI button to "trigger" it; it's a scheduled side-effect that produces visible artifacts in the requisitions queue.

## Who uses it

| Persona | Why |
|---|---|
| **Lab** account managers | Sanity-check the days-of-supply projection before a big batch run |
| **Hospital** approvers | Receive the auto-generated requisitions in their [Approvals queue](./05-approvals.md) |
| **Admin** | Watches the cron logs and tunes the test → consumable recipe map |

## The page

The forecast has two surfaces:

- **`/labs/inventory` → "Reorder needed" tab** — shows the items the cron will act on tonight (everything where `on_hand ≤ reorder_point`).
- **`/labs/test-mappings`** — the recipe editor. Renders `TestConsumableMapPage.tsx` and is the **single most important page** for forecast accuracy. Without recipes the model has zero signal.

![Lab forecasting](../images/feature-lab-forecasting.png)

The recipe page uses a left-pane / right-pane layout:

- **Left** — every test code that appears in `lab_test_consumables` (deduped), with a row count + a 🛈 red flag if any of the consumables for that test is marked `isCritical`.
- **Right** — a table of `(consumableId, quantityPerTest, isCritical, notes)` rows for the selected test. **Add consumable** / **Delete** buttons inline.

## The forecast model

`forecastDemand(env, { siteId?, labGroupId? })` returns one row per `(consumableId, siteId)`. The math:

```
testCount(testCode, siteId) = COUNT(lab_orders WHERE testCode = ? AND siteId = ? AND createdAt >= today - 60d)
consumed(consumableId, siteId) = SUM over mapped tests of testCount × quantityPerTest
avgDailyConsumption = consumed / 60
projected30Day = ceil(avgDailyConsumption × 30)
daysOfSupply = floor(currentOnHand / avgDailyConsumption)   // null when avgDaily == 0
suggestedOrderQty = max(reorderQuantity, maxThreshold − onHand)   // 0 when onHand > reorderPoint
```

🛈 *Why 60 days trailing → 30 days forward?* Sixty days smooths weekly seasonality (Mondays vs. Sundays). Thirty days forward matches the typical vendor lead time + safety stock for lab supplies. The window is a constant in code — change it in `labReplenishmentService.ts` if your lab's lead time is meaningfully different.

### Worked example

A site runs the **CBC** test 50 times per day on average. The recipe says `1 EDTA tube per test`.

| Step | Value |
|---|---|
| Tests in trailing 60 days | 3000 |
| Consumed in 60d (qty × count) | 3000 EDTA tubes |
| avg daily consumption | 50.0 |
| projected 30d demand | 1500 tubes |
| current on-hand | 800 |
| days of supply | `floor(800 / 50) = 16` |
| reorder point | 1000 |
| max threshold | 2000 |
| **suggested order qty** | `max(reorderQuantity, 2000 − 800) = 1200` |

Because `800 ≤ reorderPoint=1000`, this row gets picked up by the auto-replen cron tonight.

## Actions you can take

| Action | What it does | Allowed when |
|---|---|---|
| **Query forecast** | `GET /api/lab-inventory/forecast?siteId=…` returns the projection table | Anyone with lab access |
| **Add a recipe row** | Map a `testCode` → `consumableId` with `quantityPerTest`, optional `isCritical` + `notes` | Lab role |
| **Delete a recipe row** | `DELETE /api/lab-inventory/test-consumables/:id` | Lab role |
| **Trigger cron manually** | (Admin only) Hit the `/admin/cron/run` debug endpoint with `handleLabAutoReplenishment` | Admin |

## The auto-replenishment cron

Runs at **`0 8 * * *` UTC** alongside the rental billing and DMEPOS expiry jobs. Implementation: `handleLabAutoReplenishment(env)` in `labReplenishmentService.ts`. Per run:

1. Pull every reorder candidate via `getReorderCandidates({})` (all sites, all labs).
2. Resolve each site's `hospitalId` from `lab_kit_sites` (joined through `lab_groups`).
3. Look up each consumable's `preferredVendorId` from the catalog.
4. **Batch** items by `(hospitalId, vendorId)` — one requisition per batch.
5. For each batch, compute the per-item order qty:
   - `target = consumable.maxThreshold ?? reorderPoint × 2`
   - `orderQty = max(reorderQuantity, target − onHand)`
6. **Idempotency check** — skip the batch if a requisition exists today with title `Auto-replen YYYY-MM-DD [<hospital-prefix>…]`.
7. Call `pickPrimaryApprover('REQUISITION', { hospitalId, amountUsd, containsOffFormulary: true })` from the [approval rules engine](./05-approvals.md) to assign an approver.
8. Insert into `requisitions` (status `SUBMITTED`, source `system-auto-replen`), `requisition_items`, and `requisition_history`.

The cron returns `{ itemsConsidered, requisitionsCreated, skippedExisting, errors }` — visible in the Worker tail logs at `/admin/integration-log`.

🛈 *Why one requisition per (hospital × vendor)?* So the human approver can sign off on a single PO that turns into a single shipment from a single vendor, rather than 12 separate scribbled-together requisitions. Items without a `preferredVendorId` get batched under the synthetic key `NONE`.

## Permissions

| Action | Resource & level |
|---|---|
| Read forecast | Lab role OR Admin |
| Edit recipe map | Lab role OR Admin |
| Auto-replen cron writes | Runs as system user `system-auto-replen`; approver routing follows the same rules as a human-submitted requisition |
| Approve the resulting requisition | Same as any [requisition approval](./03-requisitions.md) — driven by the [approval rules engine](./05-approvals.md) |

## Behind the scenes

- **Service**: `packages/api/src/services/labReplenishmentService.ts`.
- **Routes**: `GET /api/lab-inventory/forecast` + `/test-consumables` CRUD in `packages/api/src/routes/labInventory.ts`.
- **DB tables**: `lab_test_consumables` (the recipe map), `lab_orders` (consumption signal), `lab_inventory_lots` (current on-hand), `lab_consumables` (thresholds + preferred vendor).
- **Cron entry**: declared in `wrangler.toml` (`triggers.crons = ["0 8 * * *"]`), dispatched in `packages/api/src/scheduled.ts`.
- **Sibling cron**: `handleLabExpiration()` runs in the same daily window and writes `EXPIRE` movements for any lot past `expiration_date`.
- **Idempotency key**: the per-day requisition title (`Auto-replen 2026-05-23 [a7b3c2f1…]`). Re-running the cron the same day is safe.

### Tuning knobs

| Field | Where | Effect |
|---|---|---|
| `reorderPoint` | `lab_consumables` row | Below this → eligible for auto-replen |
| `reorderQuantity` | `lab_consumables` row | Floor on the auto-generated qty |
| `maxThreshold` | `lab_consumables` row | Target on-hand the cron orders up to |
| `preferredVendorId` | `lab_consumables` row | Controls vendor batching |
| `isCritical` | `lab_test_consumables` row | Surfaced on the recipe pane for human attention — does not (yet) change the math |

## Related

- [Lab Inventory](./27-lab-inventory.md)
- [Requisitions](./03-requisitions.md)
- [Approvals queue + rules engine](./05-approvals.md)
- [Demand Forecasting (general procurement)](./13-forecasting.md) — sibling system for non-lab SKUs
- [Lab persona](../personas/lab.md)
- Recipes: [Set up test consumable map](../workflows/20-set-up-test-consumable-map.md), [Receive a lab shipment](../workflows/19-receive-lab-shipment.md)

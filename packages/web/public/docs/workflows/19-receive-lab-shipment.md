# Workflow 19 — Receive a Lab Shipment

## At a glance

| | |
|---|---|
| **What** | Log a physical lab supplies delivery (swabs, reagents, tubes, PCR mix) against the source order. Posting the GRN auto-creates `lab_inventory_lots` rows and spawns backorder lines for any under-delivered quantity — no second data entry required. |
| **Persona** | Hospital receiving clerk **or** Lab CSR (`FACILITY_ACCOUNT_MANAGER_USER` / `LAB_ACCOUNT_MANAGER_USER` with `WRITE` on `goods-receipts`). |
| **Prerequisites** | An open supply order in any post-`VENDOR_ASSIGNED` state whose line items match `lab_consumables.itemCode` values. UPS box on the dock with packing slip + per-item lot numbers + expirations. A configured kit site to receive into. |
| **Estimated time** | 4-7 minutes for a mixed shipment of 6-10 lines. |

---

## Steps

### A — Open the source order

1. From the sidebar pick **Orders** → **`/supply-orders`**.
2. Filter by vendor (e.g. *"Quidel"*) or status. Click into the order → **`/supply-orders/{id}`**.
3. Eyeball the **Lines** tab to confirm what was supposed to ship: 200 NP swabs (`seed-swab-np`), 4× PCR mix (`pcr-mix-flu`), 50 EDTA tubes (`tube-edta-4ml`).
4. Compare against the carrier's packing slip. Note any obvious shortages — those will become backorders.

### B — Start a new goods receipt

5. In the order header click **New receipt** (or navigate to **`/goods-receipts`** → **New receipt** and pre-select the order).

   ![Step 5](../images/wf-receive-lab-shipment-step-5.png)

6. Fill the header fields:
   - **Order** — pre-filled from the previous click.
   - **Carrier** + **Tracking #** — paste from the UPS slip (auto-pulled if a `order_shipments` row exists).
   - **Receiving site** — *important*: pick the **kit site** the lab actually stores stock at (e.g. *"Riverside Lab — Cooler 2"*). The site you pick here is what `receiveLot()` will use when it auto-creates `lab_inventory_lots` rows.
   - **Packing-slip photo / damage photos** — drag-and-drop into the upload zone.

7. Click **Auto-seed lines from order**. Curavend copies every `order_items` row into the receipt-lines table pre-filled with `quantityOrdered`.

### C — Per line: enter received qty, lot #, expiration

8. For **every** line, fill or correct:
   - **Quantity received** — what's actually in the box. May be less than ordered (will become a backorder), more than ordered (`OVERSHIPPED` condition).
   - **Condition** — `GOOD` (default), `DAMAGED`, `EXPIRED`, `WRONG_ITEM`, `SHORT_SHIPPED`, `OVERSHIPPED`.
   - **Lot / serial number** — **required** for items where `lab_consumables.requiresLotTracking = 1` (true for all reagents, controls, calibrators, kits). Read it off the box label.
   - **Expiration date** — required for any item with `requires_expiration = 1` in the catalog. **Critical**: this is what feeds the FEFO engine and the 30/60/90-day expiry sweep.

   ![Step 8](../images/wf-receive-lab-shipment-step-8.png)

9. For the example shipment:
   | Item | Ordered | Received | Lot # | Expires |
   |---|---|---|---|---|
   | `seed-swab-np` | 200 | 200 | `NPS-2026-K4` | 2027-11-30 |
   | `pcr-mix-flu` | 4 | 3 | `PCRMX-26F-019` | 2026-12-15 |
   | `tube-edta-4ml` | 50 | 50 | `EDTA-2025-Q4` | 2027-06-30 |

   Note the PCR mix is short-shipped by 1. Leave the line as-is; **do not** edit the order — the backorder will track the missing unit automatically.

10. Add freeform **Notes** if anything was unusual (e.g. *"Cooler 2 thermometer read 6°C on arrival — in spec"*).

### D — Post the receipt (lock + auto-magic)

11. Click **Post**. The receipt's status flips `DRAFT → POSTED` (immutable; only **Cancel** is available after this).

12. The API returns a JSON body with two key counts the toast will surface:
    - `backordersCreated` — one backorder line per short-shipped line. In our example: 1 (PCR mix).
    - `labLotsCreated` — one lab inventory lot per matched lab line. In our example: 3.

---

## What happens behind the scenes

- `POST /api/goods-receipts/:id/post` does five things in sequence:
  1. Flip the GRN to `POSTED`, stamp `postedAt` + `postedByUserId`.
  2. Re-run `threeWayMatchService.runThreeWayMatch(invoiceId)` for any existing invoices on this order — newly-arrived deliveries can clear a previous `NO_RECEIPT` exception.
  3. **For each GRN line** with `quantityReceived < quantityOrdered`, `INSERT order_backorders` row with `status='OPEN'` and `quantityRemaining = quantityOrdered − quantityReceived`. See [Order Backorders](../features/29-backorders.md).
  4. **For each GRN line** whose `hcpcCode` matches a row in `lab_consumables`, call `receiveLot({ consumableId, siteId, lotNumber, quantity, expirationDate, receivedFromGrnId })`. This inserts a `lab_inventory_lots` row (or tops up an existing one with the same lot #) and writes a `RECEIVE` movement.
  5. Returns `{ status: 'POSTED', backordersCreated, labLotsCreated }`.
- All photo uploads land in the `curavend-uploads` R2 bucket under `goods-receipts/{id}/`.

---

## Verification

1. **GRN list** — at **`/goods-receipts`** the new receipt shows `POSTED` with the correct `GRN-YYYY-NNNNNN` number.
2. **Lab inventory** — go to **`/labs/inventory`**, pick the receiving site in the left pane:
   - **Stock summary** tab — on-hand for each of the three items should have increased by the received qty.
   - **All lots** tab — three new rows (`NPS-2026-K4`, `PCRMX-26F-019`, `EDTA-2025-Q4`) all in `ACTIVE` status.
   - **KPI tile "SKUs tracked"** ticks up if any of the items were brand-new to the site.
3. **Backorders** — go back to **`/supply-orders/{id}`**. The **Backorders** panel now shows 1 row (`pcr-mix-flu`, remaining = 1, status `OPEN`).
4. **Movement audit** — click the **History** icon on any new lot in `/labs/inventory`. You should see one `RECEIVE` movement with `quantity` matching what you entered and a `relatedOrderId` pointing back to the source order.
5. **Three-way match** — if an invoice already existed for the parent order, navigate to **`/match-exceptions`**. Any `NO_RECEIPT` exceptions for this PO should now be cleared (or downgraded to `QTY_MISMATCH` if the under-delivery affects the matched amount).
6. **Forecast endpoint** — `GET /api/lab-inventory/forecast?siteId=<your site>` now shows non-zero `currentOnHand` for the three received items, and `daysOfSupply` reflects the new stock level.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `labLotsCreated = 0` after posting a lab shipment | None of the line `hcpcCode` values match an existing `lab_consumables.itemCode` | Add the item to the catalog via **`/labs/inventory` → Add item**, then receive the lots manually from the Receive lot button. |
| **Post** button greyed out | At least one line has `quantityReceived` blank | Fill every line — `0` is valid (it becomes a backorder). |
| `"Lot number required"` error | Catalog says `requires_lot_tracking=1` and you left the field empty | Read the box label; if truly missing, contact the vendor before posting. |
| New lots show but no quantities | You posted at the wrong **Receiving site** | The GRN is immutable — cancel it (writes a void) and re-create with the correct site. |
| Expected `backordersCreated` is too high | A previous GRN already covered these lines | Backorders are spawned per-GRN, not per-line-deficit. Cancel the spurious backorders from the order detail panel — see [Backorders](../features/29-backorders.md). |
| `auto-replen` cron created a duplicate requisition this morning | The cron ran before you posted the GRN, so on-hand was still below `reorder_point` | Leave the cron-generated requisition for the approver to decline; tomorrow's run will see the new stock. See [Lab Forecasting](../features/28-lab-forecasting.md). |
| Expiration date field is greyed out for a swab line | Catalog row has `requires_expiration = 0` (typical for non-reagent SKUs) | Leave it blank — the lot will be created without an expiration and won't be picked up by the 30/60/90-day expiry sweep. |
| Posting failed with `409 Conflict` on a `lab_inventory_lots` insert | Same `(consumableId, siteId, lotNumber)` already exists with a *different* expiration date | Open the lot in `/labs/inventory` → **History** to confirm it's the same physical material; if yes, top up via **Receive lot** directly instead of via GRN. If it's actually a different batch, the vendor reused a lot # — change the lot # on the GRN line (e.g. append `-2`) and re-post. |
| `relatedOrderId` is missing from the new lot's movement history | The receiving site was set at the GRN header level, not the line level — older GRNs created before May 2026 don't carry the order link | Cosmetic only; the `receivedFromGrnId` is still set on the lot row. |

---

---

## Variations

- **Partial shipment, no lab consumables match** — the GRN still posts, backorders still spawn, but `labLotsCreated` will be `0`. Add the items to the `lab_consumables` catalog and the *next* shipment will auto-populate inventory.
- **Drop-ship to a remote kit site** — the **Receiving site** must be set to the remote kit site, not the central warehouse. Otherwise FEFO issuance at the remote site won't see the stock.
- **Hand-keyed receipt (no source PO)** — if the shipment arrived without a purchase order, use **`/labs/inventory` → Receive lot** directly; no backorder is spawned and no three-way match is attempted.
- **Recalled material in the same shipment** — receive everything normally, then **Recall** the specific lot from `/labs/inventory` immediately. The recall reason is required and the audit chain (RECEIVE → RECALL on the same lot) is preserved for compliance review.

---

## Related

- Feature reference: [`features/27-lab-inventory.md`](../features/27-lab-inventory.md), [`features/29-backorders.md`](../features/29-backorders.md), [`features/07-goods-receipts.md`](../features/07-goods-receipts.md), [`features/28-lab-forecasting.md`](../features/28-lab-forecasting.md)
- Adjacent workflows: [`04-record-goods-receipt.md`](./04-record-goods-receipt.md) (the non-lab parent), [`20-set-up-test-consumable-map.md`](./20-set-up-test-consumable-map.md), [`05-resolve-match-exception.md`](./05-resolve-match-exception.md)
- Personas: [Lab](../personas/lab.md), [Hospital](../personas/hospital.md)

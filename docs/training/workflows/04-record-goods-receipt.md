# Workflow 04 — Record a Goods Receipt for a Delivered Order

## At a glance

| | |
|---|---|
| **What** | Log what physically arrived at the dock against a purchase order: quantities, lot/serial numbers, expiration dates, condition. |
| **Persona** | Hospital receiving clerk (`FACILITY_ACCOUNT_MANAGER_USER` with `WRITE` on `orders`). |
| **Prerequisites** | An open order in any post-`VENDOR_ASSIGNED` state. Physical shipment in hand. |
| **Estimated time** | 2-4 minutes per delivery. |

---

## Steps

### A — Open the source order

1. From the sidebar pick **Orders** → **`/supply-orders`**.
2. Find the order (filter by vendor or status). Click into it → **`/supply-orders/{id}`**.
3. Inspect the **Lines** tab and the optional packing-slip attachment so you know what to expect.

### B — Start a new receipt

4. In the order header click **New receipt**, OR navigate directly to **`/goods-receipts`** and click **New receipt** with the order pre-selected.

   ![Step 4](../images/wf-goods-receipt-step-4.png)

5. The create drawer opens with:
   - **Order** — pre-filled if you came from the order page.
   - **Carrier** / **Tracking #** — optional; pulled from `order_shipments` if a shipment row exists.
   - **Packing-slip photo / damage photos** — drag-and-drop into the upload zone (stored in R2 under the receipt's folder; keys saved on the row).
6. Click **Auto-seed lines from order**. Curavend pulls every `order_items` row and pre-fills the receipt-lines table with `quantityOrdered`.

### C — Verify each line

7. For every line, fill or correct:
   - **Quantity received** — integer; can exceed ordered (will mark `OVERSHIPPED`).
   - **Quantity rejected** — items you're refusing.
   - **Condition** — one of:
     - `GOOD` (default)
     - `DAMAGED`
     - `EXPIRED`
     - `WRONG_ITEM`
     - `SHORT_SHIPPED`
     - `OVERSHIPPED`
   - **Lot / serial number** — required for lot-tracked biologics; recommended for everything.
   - **Expiration date** — required for items with `requires_expiration=1` in the catalog.

   ![Step 7](../images/wf-goods-receipt-step-7.png)

8. Add freeform **Notes** if anything was unusual (e.g. _"Box 2 of 3 had a damaged corner; supplier emailed"_).

### D — Post the receipt

9. While **Save as draft** is fine for partial work, **Post** is what locks the receipt and feeds the 3-way match engine.
10. Click **Post**. The receipt's status flips `DRAFT → POSTED`. From here on it is **immutable** — you cannot edit lines, only **Cancel** (writes a void event without deleting).
11. The drawer footer changes to show only the **Cancel** action plus the **Recorded by … at …** timestamp.

---

## What happens behind the scenes

- `POST /api/goods-receipts` inserts a row in `goods_receipts` and mints `GRN-{YEAR}-{6digit}` via `sequences`.
- The `auto-seed` button calls `POST /api/goods-receipts/:id/seed-from-order` which copies `order_items` into `goods_receipt_lines`.
- `POST /api/goods-receipts/:id/post`:
  - Flips status to `POSTED` and stamps `postedAt` + `postedByUserId`.
  - For every invoice that already exists against the parent order, re-runs `threeWayMatchService.runThreeWayMatch(invoiceId)`. Any newly-arrived deliveries can clear a previous `NO_RECEIPT` exception.
  - Damage / wrong-item lines trigger a `ORDER_FULFILLMENT_STALLED_SLA` candidate if the qty issue is large enough (handled by the daily SLA cron).
- All photo uploads land in `curavend-uploads` R2 under `goods-receipts/{id}/`.

---

## Verification

1. The receipt is listed at **`/goods-receipts`** with status `POSTED` and the correct GRN number.
2. The source order's detail page now shows a **Received against** strip with the receipt pill.
3. If an invoice already exists for the order, navigate to **`/match-exceptions`** — qty / no-receipt exceptions for that PO should have changed status (and possibly disappeared).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Post button greyed out** | At least one line has `quantityReceived` blank | Set every line to 0 or higher; 0-received `SHORT_SHIPPED` rows are valid. |
| **"Lot number required"** | Catalog row for that HCPC has `requires_lot=1` (typical for biologics) | Read the box label; if truly missing, contact the vendor before posting. |
| **"Receipt cannot be edited"** when you click a line | Status is `POSTED` (immutable) | Cancel the receipt and create a new one with the correction. |
| Photos upload but don't preview | The R2 binding `BUCKET` is misconfigured, or the file is > 25 MB | Re-compress to under 10 MB; check **`/admin/integration-log`** for upload errors. |
| 3-way match still shows `NO_RECEIPT` after posting | HCPC on the receipt doesn't match the HCPC on the invoice line | Open the invoice; if the vendor billed a different HCPC, this is a legit `AMBIGUOUS` match — go resolve at **`/match-exceptions`**. |

---

## Related

- Feature reference: [`features/07-goods-receipts.md`](../features/07-goods-receipts.md), [`features/02-orders.md`](../features/02-orders.md), [`features/08-three-way-match.md`](../features/08-three-way-match.md)
- Adjacent workflows: [`05-resolve-match-exception.md`](./05-resolve-match-exception.md), [`03-approve-requisition-and-convert.md`](./03-approve-requisition-and-convert.md)

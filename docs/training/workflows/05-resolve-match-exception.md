# Workflow 05 — Resolve a 3-Way Match Exception

## At a glance

| | |
|---|---|
| **What** | Triage and resolve discrepancies between purchase order, goods receipt, and vendor invoice. |
| **Persona** | AP clerk / Hospital admin (`FACILITY_ACCOUNT_MANAGER` or any user with `WRITE` on `orders` / billing). |
| **Prerequisites** | At least one invoice with a generated 3-way match (run automatically on invoice creation; can be re-run manually). |
| **Estimated time** | 1-3 minutes per exception. |

---

## Steps

### A — Open the exceptions queue

1. From the sidebar pick **Match Exceptions** → **`/match-exceptions`**.
2. The page lists every match row whose status is **not** `PERFECT`. Top of the page has a filter chip strip:
   - `QTY_VARIANCE` — billed qty ≠ received qty.
   - `PRICE_VARIANCE` — billed unit price ±2 % from PO price.
   - `NO_RECEIPT` — vendor billed but nothing was received yet.
   - `NO_PO` — invoice line has no matching purchase order line.
   - `CONDITION_BAD` — billed line was received in `DAMAGED` / `EXPIRED` / `WRONG_ITEM` condition.
   - `AMBIGUOUS` — multiple PO / receipt candidates matched on HCPC.

   ![Step 2](../images/wf-match-exception-step-2.png)

3. Click a filter chip to narrow the table. Sort by **Variance $** descending to triage by financial impact.

### B — Read the row

4. Each row shows 5 column groups side-by-side:
   - **Invoice** — invoice #, HCPC, billed qty × unit price, billed total.
   - **PO** — PO #, ordered qty × contract price.
   - **Received** — receipt #, received qty, condition.
   - **Variance** — `qtyDelta`, `priceDelta`, `dollarDelta`, percentage.
   - **Resolution** — Accept / Dispute / Override actions.
5. Click the row to expand a detail drawer with the full audit (who created each side, when, free-text notes from receiver/AP).

### C — Resolve

6. Pick one of three actions:

   | Action | When to use | Effect |
   |---|---|---|
   | **Accept** | The variance is real and you'll pay as billed (e.g. vendor honestly billed for a substitute). | Status → `ACCEPTED`. Invoice line stays as-is. |
   | **Dispute** | You'll push back to the vendor. | Status → `DISPUTED`. Modal asks for **Notes**. Notes are sent in the next vendor communication. Invoice line remains unpaid. |
   | **Override** | Admin-only escape hatch (e.g. manual price adjustment outside Curavend's flow). | Status → `OVERRIDDEN`. Notes required. Match treated as resolved without changing invoice. |

   ![Step 6](../images/wf-match-exception-step-6.png)

7. Click the chosen button. The drawer footer shows _"Resolved by **you** at **timestamp**"_.

### D — Re-run match on a corrected invoice

8. If the vendor sends a corrected invoice, open the original at **`/billing-orders/{id}`**.
9. In the header click **Re-run 3-way match**. This wipes prior matches for that invoice and recomputes them against the latest PO + receipts.

---

## What happens behind the scenes

- The 3-way match engine lives in `services/threeWayMatchService.ts`. `runThreeWayMatch(invoiceId)` is **idempotent** — it deletes prior `three_way_matches` rows for that invoice first, then re-correlates each invoice line:
  - LEFT JOIN `order_items` on `(orderId, hcpcCode)` for PO side.
  - LEFT JOIN `goods_receipt_lines` on `(orderId, hcpcCode)` for receipt side.
  - Classification matrix: qty exact + price ±2 % → `PERFECT`. Anything else routes to one of the exception types listed above.
- `POST /three-way-match/run/:invoiceId` is what the "Re-run" button calls. It also fires on every invoice insert.
- `POST /three-way-match/:matchId/resolve` writes `resolution`, `resolvedByUserId`, `resolvedAt`, and `resolutionNotes`.
- All endpoints are tenant-scoped via `invoice.hospitalId`, so an AP clerk only sees their own hospital's exceptions.

---

## Verification

1. The exception drops off the filtered table.
2. The match row's `resolution` field is populated (visible in the row detail drawer).
3. If you re-ran the match after the vendor sent a corrected invoice, the table should now show the corrected lines as `PERFECT`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **`NO_RECEIPT` exception won't clear** | Receipt was created but not **posted** | Open **`/goods-receipts`**, find the GRN, click **Post**. The next time the invoice is recomputed the line should resolve. |
| **`PRICE_VARIANCE` for a contracted item** | Active contract changed mid-period; invoice was priced against the old rate | Confirm with vendor, then **Accept** if their billing was correct at time-of-order. Or **Dispute** if they should rebill. |
| Re-run button does nothing | Browser cached a previous response | Hard-refresh (Ctrl-Shift-R). |
| Exception count keeps growing | Auto-match runs on invoice insert; if many invoices recently posted, expected | Sort by **Variance $** and work the biggest-dollar exceptions first. |
| **`AMBIGUOUS` won't resolve** | Same HCPC ordered against multiple POs from the same vendor in the same window | Use **Override** with a note explaining which PO you're applying the line against. |
| **`NO_PO` for a line you do see in `/supply-orders`** | HCPC code on the invoice line differs (vendor used the wrong code) | Edit the invoice line's HCPC if you have permission, then re-run match. Otherwise **Dispute** and ask the vendor to re-issue. |

---

## Related

- Feature reference: [`features/08-three-way-match.md`](../features/08-three-way-match.md), [`features/07-goods-receipts.md`](../features/07-goods-receipts.md), [`features/09-invoices.md`](../features/09-invoices.md)
- Adjacent workflows: [`04-record-goods-receipt.md`](./04-record-goods-receipt.md), [`10-detect-contract-leakage.md`](./10-detect-contract-leakage.md)

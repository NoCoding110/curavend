# Workflow 22 — Handle a Damaged Shipment End-to-End

## At a glance

| | |
|---|---|
| **What** | A vendor shipment arrived broken / wrong / cold-chain-violated. Post the goods receipt with damaged lines, watch the system auto-spawn an RMA, submit it to the vendor, ship the return, receive the credit. End state: closed-out RMA with `actualCreditUsd` recorded, full audit chain. |
| **Persona** | Hospital receiving clerk (`FACILITY_ACCOUNT_MANAGER_USER` with WRITE on `goods-receipts`) for steps A–D; same persona or `ACCOUNT_MANAGER` for steps E–H. |
| **Prerequisites** | An open supply order in any post-`VENDOR_ASSIGNED` state. A physical shipment on the dock with at least one damaged or wrong-item line. Vendor must have an `ACTIVE` onboarding row — otherwise the RMA can't be submitted via the portal (vendors with `SUSPENDED` onboarding don't see it). |
| **Estimated time** | 5-8 minutes at receiving; 1-3 minutes per state advance afterward; total elapsed depends on vendor turnaround (typically 5-15 business days). |

---

## Steps

### A — Receive at the dock, identify the damage

1. Open the source order at **`/supply-orders/{id}`**; cross-reference the packing slip with what's on the pallet.
2. If the shipment was cold-chain, glance at **`/logistics`** for the tracking row — if the **Cold chain** column shows a red `EXCURSION` tag, the receiving decision is "reject"; treat the entire pallet as `DAMAGED`. See [Logistics & Cold Chain](../features/43-logistics-cold-chain.md).
3. Click **New receipt** on the order header (or **`/goods-receipts` → New receipt** and pre-select the order).

   ![Step 3](../images/wf-handle-damaged-shipment-step-3.png)

🛈 *Why post a GRN for damaged stuff at all?* Two reasons: (1) it creates the audit trail you need for the RMA, and (2) the auto-spawn from a posted GRN is the only zero-keystroke path to a tracked return. Skipping the GRN means a manual RMA entry with hand-typed line items.

### B — Fill the receipt lines with the damage detail

4. Click **Auto-seed lines from order** — pulls every order item into the receipt with `quantityOrdered` pre-filled.
5. For each affected line, set:
   - **Quantity received** — even damaged goods count as received (you'll send them back, but they arrived).
   - **Condition** — `DAMAGED` (broken / leaked / contaminated / cold-chain breached) or `WRONG_ITEM` (vendor shipped a different SKU than ordered). These two conditions are what triggers RMA auto-spawn — see [RMA Workflow](../features/36-rma-workflow.md).
   - **Lot number** / **Expiration** — fill normally; the lot still gets created (you'll see it in inventory, in `QUARANTINE` status if your site auto-quarantines on damage).
   - **Notes** — *"Box crushed, 3 of 5 vials shattered, photos attached"* — this text lands in the GRN line and can be copied into the RMA later.
6. **Upload damage photos** — drag-and-drop into the GRN's attachment zone. R2 stores them at `goods-receipts/{id}/`; the URLs are picked up by the auto-spawn for vendor evidence.

### C — Post the receipt (the auto-spawn fires)

7. Click **Post**. Receipt flips `DRAFT → POSTED` (immutable).
8. The API returns a JSON body whose `rmasCreated` value will be the number of `(vendor, condition)` buckets:
   - 3 DAMAGED + 2 WRONG_ITEM lines → `rmasCreated: 2` (one DAMAGED RMA, one WRONG_ITEM RMA).
   - 4 DAMAGED + 0 WRONG_ITEM lines → `rmasCreated: 1`.
9. A toast names the new RMA numbers: *"Posted GRN-2026-001234; created RMA-2026-00045, RMA-2026-00046."*

   ![Step 9](../images/wf-handle-damaged-shipment-step-9.png)

🛈 *Why bucket by condition?* Vendors handle DAMAGED returns differently from WRONG_ITEM returns (different RMA workflows on their side, different freight programs, different credit calculations). Curavend separates them up front so the operator can address each on the vendor's own terms.

### D — Open the RMA, verify it looks right

10. Navigate to **`/rmas`** or click an `RMA-...` link in the toast.
11. The new RMA shows in `DRAFT` state with:
    - **Reason** — `DAMAGED` or `WRONG_ITEM` (from the bucket).
    - **Reason detail** — `Auto-spawned from GRN GRN-2026-001234 (N lines)`.
    - **Lines** — each grn line with HCPC, qty, condition, and a back-reference to `grnLineId`.
    - **Source GRN ID** / **Source order ID** — populated for traceability.
12. Edit if needed — add an estimated **Expected credit (USD)** so finance can encumber a credit receivable; tighten the **Notes** with the on-dock specifics.

### E — Submit to the vendor

13. In the RMA detail drawer, click **Submit to vendor**.
14. State flips `DRAFT → SUBMITTED`; `submittedAt` stamped. The vendor's portal queue at **`/vendor/rmas`** now shows the RMA (vendor user with `goods-receipts` READ for their `vendorId` sees it).
15. *Vendor side* — vendor opens the RMA, decides:
    - **Vendor approved** — types their own **Vendor RMA number** (e.g. `RMA-VENDOR-987`), clicks the button. State → `APPROVED`, `approvedAt` stamped.
    - **Vendor rejected** — closes the RMA at `REJECTED` (state machine terminal). The credit-shortfall feeds [Vendor Scorecard](../features/17-vendor-scorecard.md).

### F — Ship the return

16. Pack the damaged goods (in original packaging where possible, with photos enclosed).
17. Generate a carrier label (vendor often provides one along with their RMA number; if not, use the hospital's standard return-shipping account).
18. In the RMA drawer, click **Mark shipped**, paste the **Return tracking number**, confirm. State → `SHIPPED`, `shippedAt` stamped.

### G — Vendor receives

19. When the carrier delivers and the vendor processes the return, the vendor user clicks **Vendor received** in their portal. State → `RECEIVED`, `receivedAt` stamped.
20. (If your tenant trusts the vendor's tracking, the hospital can also click this from the receiving side — `goods-receipts` WRITE permission is enough.)

### H — Record the credit

21. The vendor issues a credit memo (paper or EDI 812) — typically 5-10 business days after receipt.
22. When you see the credit on the next statement, open the RMA → click **Credit issued**, enter the **Actual credit (USD)**. State → `CREDITED`, `creditedAt` stamped.

🛈 *Why is actualCreditUsd required?* Vendors don't always pay out the expected amount (restocking fees, partial credit, contractual deductions). Forcing the operator to type the real number means downstream KPIs (especially [Vendor Scorecard](../features/17-vendor-scorecard.md)) compute on actuals, not optimistic estimates.

---

## What happens behind the scenes

- **Auto-spawn site** in `POST /api/goods-receipts/:id/post`:
  - Filters lines to `condition IN ('DAMAGED', 'WRONG_ITEM')`.
  - Buckets by condition (one RMA per unique condition).
  - For each bucket: increments `vendor_rmas` sequence (`RMA-YYYY-NNNNN`), inserts header with `state=DRAFT`, inserts `vendor_rma_lines` with the grn line references.
  - Wrapped in try/catch — RMA insert failure logs but does **not** fail the GRN post (receipt is the source of truth; missing RMA can be re-created manually).
- **State transitions** in `POST /api/rmas/:id/{submit,approve,reject,ship,receive,credit,cancel}` — single transition factory `makeTransition()` validates the `from` state and applies the `toState` + stamp column atomically.
- **Tenant scope** — `loadAndAuth()` enforces hospital or vendor ownership at every endpoint. Admins bypass.
- **Sequence numbers** — `getNextValue(db, 'vendor_rmas')` is monotonic per year; both auto-spawn and manual create draw from the same counter so numbers never collide.

---

## Verification

1. **GRN list** at **`/goods-receipts`** — your receipt shows `POSTED` and the new `GRN-YYYY-NNNNNN` number.
2. **RMA list** at **`/rmas`** — one row per (vendor, condition) bucket; state should match where you've advanced to.
3. **Lab inventory** (if any line went to a lab consumable) — the damaged lots show in `QUARANTINE` status at **`/labs/inventory`** → **All lots**, prevented from FEFO issuance. See [Lab Inventory](../features/27-lab-inventory.md).
4. **Vendor portal** — log in as the vendor user; the SUBMITTED RMA appears at **`/vendor/rmas`**.
5. **After CREDITED**, check the vendor's open A/P statement against the hospital's `actualCreditUsd` — should match.
6. **Audit chain** — `GET /api/goods-receipts/:id` shows the GRN; `GET /api/rmas/:id` shows the source GRN linkage; `GET /api/rmas?sourceGrnId=<grn>` returns all RMAs from that GRN.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `rmasCreated: 0` after posting a GRN with damaged lines | No `condition` was set on any line — defaulted to `GOOD` | Cancel the GRN (writes a void), recreate with explicit `condition=DAMAGED` per affected line. |
| **Submit to vendor** button greyed out | RMA is not in `DRAFT` (someone already advanced it) | Check the state tag; if already SUBMITTED+, continue the workflow from that point. |
| Vendor says they never got the RMA | Their portal view filters by `vendorId`; check the RMA's `vendorId` matches their account | If wrong vendor was on the source order, cancel this RMA, fix the order, re-receive. |
| Vendor rejects citing "wrong reason code" | The auto-spawn picked DAMAGED but vendor classifies it as DEFECTIVE | Cancel the RMA (FULL permission required), create a new manual RMA with `reason=DEFECTIVE`. The auto-spawn only handles DAMAGED + WRONG_ITEM. |
| Stuck in `APPROVED` waiting for return label | Vendor hasn't emailed the label yet | Email vendor with the RMA's `vendorRmaNumber`; once label arrives, click **Mark shipped** with the tracking number. |
| `actualCreditUsd` is less than `expectedCreditUsd` | Vendor applied a restocking fee or didn't credit freight | Type the actual amount the vendor paid; the delta feeds the [Vendor Scorecard](../features/17-vendor-scorecard.md) credit-shortfall metric. |
| Need to file an RMA for a line the GRN posted as `GOOD` (failed later in clinical use) | Auto-spawn only catches dock-time damage | Create manually: **`/rmas`** → use the API `POST /api/rmas` with `reason=DEFECTIVE`, supply `sourceOrderId` to preserve linkage. See [RMA Workflow](../features/36-rma-workflow.md). |

---

## Related

- Feature reference: [`features/36-rma-workflow.md`](../features/36-rma-workflow.md), [`features/38-item-master-hygiene.md`](../features/38-item-master-hygiene.md), [`features/42-backorder-triage.md`](../features/42-backorder-triage.md), [`features/43-logistics-cold-chain.md`](../features/43-logistics-cold-chain.md), [`features/07-goods-receipts.md`](../features/07-goods-receipts.md)
- Adjacent workflows: [`04-record-goods-receipt.md`](./04-record-goods-receipt.md) (the happy-path receipt), [`19-receive-lab-shipment.md`](./19-receive-lab-shipment.md), [`05-resolve-match-exception.md`](./05-resolve-match-exception.md)
- Personas: [Hospital](../personas/hospital.md), [Vendor](../personas/vendor.md)

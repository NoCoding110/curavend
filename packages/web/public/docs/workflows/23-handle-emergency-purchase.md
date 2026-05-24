# Workflow 23 — Handle an Emergency Purchase

## At a glance

| | |
|---|---|
| **What** | A clinician or supply chain user needs items *now* (trauma case in the OR, sudden stockout of a critical SKU). File a requisition with the `Emergency` flag, watch it auto-approve via the fast-lane, convert to orders + send POs. Within 24-48 hours, a manager triages the bypass in the **Emergency Review Queue** and marks it `OK` or `FLAG`. Total time before vendors see the order: minutes, not hours. |
| **Persona** | Requester: any Hospital user with `requisitions` WRITE. Reviewer: Hospital department director / materials manager with `requisitions` FULL, or Admin. |
| **Prerequisites** | One or more items the requester wants to order (HCPCs known; preferred vendor optional). A real emergency that justifies bypassing normal approval — the audit trail will be reviewed. |
| **Estimated time** | 2-5 minutes to file + send POs; 1-2 minutes for the post-hoc review. The emergency itself is solved as fast as the vendor can deliver. |

---

## Steps

### A — Decide it's actually an emergency

1. Ask: would normal [requisition routing](./02-create-and-submit-requisition.md) (approver assignment via [Approval Rules](./06-set-up-approval-rules.md)) cause patient harm or stockout in the next 4-24 hours?
2. If **yes** → proceed. If **no** → file a normal requisition with `priority=HIGH` or `URGENT` instead; the fast-lane is for cases that can't wait for any approval cycle at all.

🛈 *Why be strict?* Every fast-lane requisition gets reviewed. If your justification doesn't hold up, it gets `REVIEWED_FLAG` and the pattern feeds the monthly compliance audit. Repeated flagged requisitions are a policy conversation.

### B — File the requisition with the Emergency flag

3. Navigate to **`/requisitions`** → **New requisition**.
4. Fill in the standard header: **Title** (e.g. *"OR 3 chest tube kits — trauma"*), **Department**, **Facility**, **Needed by date** (today).
5. **Tick the Emergency checkbox**. A required **Emergency reason** textarea appears.
6. Type a concrete reason: *"Trauma case underway in OR 3, ETA from regular vendor is 4 hours, attending requires kits within 30 min"*. Avoid vague *"urgent"* — the reviewer will read this verbatim.

   ![Step 6](placeholder.png)

7. Add line items with HCPC, description, quantity, optional preferred vendor.
8. Click **Save as DRAFT**.

### C — Submit (fast-lane fires)

9. From the DRAFT detail view, click **Submit**.
10. Behind the scenes, `POST /api/requisitions/:id/submit` sees `isEmergency=true` and:
    - Skips the [Approval Rules engine](./06-set-up-approval-rules.md) lookup entirely.
    - Sets `status=APPROVED`, `approvedAt=now`, `approverUserId=<requester>`.
    - Sets `emergencyReviewStatus=PENDING_REVIEW`.
    - Writes an `EMERGENCY_APPROVED` history row with your reason text appended.
    - Still encumbers the budget (calls `commitBudget()` — emergency cost still hits the department's budget).
11. The page redirects to the requisition detail; the status badge shows `APPROVED` immediately.

🛈 *Why does the budget still get committed?* Emergencies cost money. The fast-lane skips the *approval* but not the *accounting*. Departments that fast-lane heavily will see budget pressure in [Department Spend](../features/33-department-spend.md) just like any other approved requisition.

### D — Convert to orders + send POs

12. On the requisition detail, click **Convert to orders** (or **Convert to PO** if your hospital uses the PO transmission flow).
13. The engine groups lines by preferred vendor, spawns one order or PO per vendor, and returns the new IDs.
14. For each PO, open it in [PO Transmission](../features/32-po-transmission.md) and click **Send now** (EDI / API / cXML / email / portal — whichever channel the vendor uses). For pure-orders flow, the vendor sees the new order in their portal queue.

   ![Step 14](placeholder.png)

15. Confirm the vendor received it (vendor portal queue ping, EDI 855 ack, or phone call for high-stakes orders). Track ETA in [Logistics & Cold Chain](../features/43-logistics-cold-chain.md) once a tracking number is in hand.

### E — Receive the shipment

16. When the courier arrives, follow [Workflow 04 — Record a goods receipt](./04-record-goods-receipt.md) as usual. The emergency context doesn't change the receiving workflow.
17. If anything arrived damaged, follow [Workflow 22 — Handle a damaged shipment](./22-handle-damaged-shipment.md) — RMA auto-spawn is the same.

### F — Manager triages the emergency post-hoc

18. The next business day (or per your hospital's policy — some require same-day), a department director or materials manager opens **`/admin/emergency-review-queue`**.
19. The page lists pending-review requisitions with **Req #**, **Title**, **Approved at**, **Total**, **Reason**, and action buttons **OK** / **Flag**.

    ![Step 19](placeholder.png)

20. The reviewer reads the **Reason** column verbatim.
21. Click **OK** if the justification holds up. Modal opens with optional **Note** textarea. Confirm → row writes `emergencyReviewStatus=REVIEWED_OK`, stamps `emergencyReviewedAt` + `emergencyReviewedByUserId`, appends an `EMERGENCY_REVIEWED` history row.
22. Click **Flag** if the justification is thin (operator routinely fast-lanes non-emergencies; reason field is vague; alternate ordering path would have worked). Same modal pattern → `REVIEWED_FLAG`.

⚠ *Flagging does NOT roll back the orders.* The flag is an audit signal only. The orders already shipped (or are shipping); the vendor is paid; the budget is consumed. Flagging just marks the bypass for monthly review.

---

## What happens behind the scenes

- **Fast-lane gate** — `POST /api/requisitions/:id/submit` (in `packages/api/src/routes/requisitions.ts`) reads `row.isEmergency`. The branch at lines 475-494 sets `finalStatus='APPROVED'` and `emergencyReviewStatus='PENDING_REVIEW'` instead of the usual `SUBMITTED` + approver lookup.
- **No approver notification** — the normal branch fires `NotificationService.createNotification()` to the assigned approver. The emergency branch skips this (there is no third-party approver to notify).
- **History distinguishability** — `appendHistory(action='EMERGENCY_APPROVED', ...)` instead of `action='SUBMITTED'`. Audit scripts can grep history for `EMERGENCY_APPROVED` to find every fast-lane requisition.
- **Budget still encumbered** — `resolveBudget()` + `commitBudget()` runs unconditionally. Strict-budget mode (`?strictBudget=1`) is honoured: an emergency over budget in strict mode is still rejected with `409 Conflict`. (In non-strict, the budget over-allocation is recorded but the requisition still APPROVES.)
- **Off-formulary still requires justification** — the per-line check `if (it.isOffFormulary === 1 && !it.justification)` runs *before* the fast-lane branch. Filing an emergency for an off-formulary HCPC without justification gets `ValidationError`.
- **Review endpoint guard** — `POST /:id/emergency-review` throws `ConflictError` if `emergencyReviewStatus !== 'PENDING_REVIEW'`. So you can't OK a flagged one or re-flag an OK'd one — first decision sticks.
- **Queue scope** — `GET /emergency-review-queue` auto-filters by `hospitalId` for non-admins. Admins see every hospital's pending rows; useful for the platform compliance audit.

---

## Verification

1. **After step 11** — requisition detail status badge shows `APPROVED` (not `SUBMITTED` → `IN_REVIEW` → `APPROVED`). Look at the history strip; the most recent row should be `EMERGENCY_APPROVED` with your reason text.
2. **After step 13** — `convertedOrderIds` array on the requisition has one or more IDs. Open one — it should be a normal order in `PENDING / NEW_ORDER` substatus.
3. **After step 15** — for EDI vendors, watch [PO Transmission](../features/32-po-transmission.md) for the `SENT` state and the inbound 855 acknowledgement.
4. **After step 19** — the requisition is no longer in the emergency review queue; its `emergencyReviewStatus` is `REVIEWED_OK` or `REVIEWED_FLAG`. Inspect via `GET /api/requisitions/<id>` or the detail page.
5. **Audit replay** — `GET /api/requisitions?status=APPROVED` filtered to the past 7 days; cross-reference each row's history for the `EMERGENCY_APPROVED` action to find every fast-lane requisition for the week.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Submit** rejects with *"Off-formulary item X requires justification"* | An off-formulary line lacks `justification`; emergency flag doesn't bypass the per-line justification check | Edit the line, add a `justification` string, re-submit. |
| **Submit** rejects with *"Requisition $X exceeds available $Y (strict mode)"* | `?strictBudget=1` was set and the budget is over-allocated | Either drop the strict flag (non-strict mode lets the emergency through with a budget warning) or have finance bump the budget first. |
| Requisition lands at `APPROVED` but no orders are visible | You haven't clicked **Convert to orders** yet — fast-lane only handles the approval; conversion is still a manual step | Open the requisition detail → **Convert to orders** → verify the new order IDs in the response. |
| Vendor never receives the PO | PO transmission stuck in `PENDING` or `FAILED` | Open [PO Transmission](../features/32-po-transmission.md) → find the row → check the failure reason → fix vendor config or use the manual-send override. |
| **Emergency Review Queue** is empty but I just filed an emergency | You're scoped to a different hospital than the requisition's `hospitalId`, OR the requisition didn't actually flip to `PENDING_REVIEW` | Check the requisition detail — `emergencyReviewStatus` should be `PENDING_REVIEW`. If null, the `isEmergency` flag wasn't `true` at submit (the create form may not have ticked the box). |
| Reviewer clicks **Flag** but wants to undo it | `POST /:id/emergency-review` is single-decision; ConflictError on re-review | Decision is permanent in MVP. File a separate `COMMENT` action on the requisition history explaining the reversal context. |
| Reason text is too short — reviewer can't tell what happened | Operator was rushed and typed vague text | Coaching opportunity. Use **Flag** for the bypass, and note in the flag comment what additional detail would have helped. |

---

## Related

- Feature reference: [`features/44-emergency-purchasing.md`](../features/44-emergency-purchasing.md) — the full feature reference for the fast-lane + review queue
- Feature reference: [`features/03-requisitions.md`](../features/03-requisitions.md) — the base requisition model
- Feature reference: [`features/05-approvals.md`](../features/05-approvals.md) — what the fast-lane bypasses
- Adjacent workflows: [`02-create-and-submit-requisition.md`](./02-create-and-submit-requisition.md) (normal path), [`03-approve-requisition-and-convert.md`](./03-approve-requisition-and-convert.md) (normal approval + convert), [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md) (the rule engine the fast-lane skips), [`04-record-goods-receipt.md`](./04-record-goods-receipt.md) (receive the emergency shipment)
- Personas: [Hospital](../personas/hospital.md), [Admin](../personas/admin.md)

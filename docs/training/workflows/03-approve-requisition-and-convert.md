# Workflow 03 — Approve a Requisition and Convert It to Orders

## At a glance

| | |
|---|---|
| **What** | Review a submitted requisition, approve (or reject) it, then convert it into one or more vendor purchase orders. |
| **Persona** | Approver — usually a `FACILITY_ACCOUNT_MANAGER` or a member of a Group/Role flagged on the matching `approval_rules` row. |
| **Prerequisites** | A requisition in `SUBMITTED` or `IN_REVIEW` state where you are the resolved approver. |
| **Estimated time** | 2-5 minutes per requisition. |

---

## Steps

### A — Find the requisition

1. You'll have received a notification — click the bell icon top-right and pick the **Requisition pending your approval** entry, OR navigate directly:
   - **Approvals queue** at **`/approvals`** lists every item awaiting your decision across requisitions, contracts, and orders.
   - **Requisitions** at **`/requisitions`** with the **Submitted** stat tile selected.
2. Click the row → the detail drawer slides in from the right.

   ![Step 2](../images/wf-approve-requisition-step-2.png)

### B — Review

3. Walk the three tabs in the drawer:
   - **Overview** — totals, requester, facility/department, priority, needed-by, notes.
   - **Items** — every line with its formulary tag, unit cost source (CONTRACT / GPO / FEE_SCHEDULE / MEDICARE / MANUAL), and preferred vendor.
   - **History** — full audit trail (`CREATE`, `SUBMIT`, `COMMENT`, etc.) from `requisition_history`.
4. Pay attention to any **orange OFF_FORMULARY** or **purple REQUIRES_PRIOR_AUTH** tags. Off-formulary lines have a justification you should actually read.

### C — Approve, request changes, or reject

5. **Move to In Review** (optional intermediate state) — click **Start review**. Useful if more than one approver collaborates; signals "I have this".
6. **Approve** — click the green **Approve** button. State flips `SUBMITTED|IN_REVIEW → APPROVED`. The requester gets a notification.
7. **Reject** — click **Reject**. A modal asks for a reason (required). State flips to `REJECTED` and the rejection reason is written into `requisition_history`. The requester can clone-as-draft to retry.
8. **Comment** — for back-and-forth without changing state, use the **Comment** action; it writes a `COMMENT` event into history and notifies the requester.

   ![Step 7](../images/wf-approve-requisition-step-7.png)

### D — Convert to orders

9. With status `APPROVED`, the drawer's action footer now shows **Convert to orders**. Click it.
10. The confirmation dialog explains: lines will be **grouped by `preferredVendorId`** and one order will be spawned per vendor, numbered `{requisitionNumber}-{N}` (e.g. `REQ-2026-00042-1`, `REQ-2026-00042-2`).
11. Click **Confirm**. The requisition flips to `CONVERTED` and you're navigated to **`/supply-orders`** with the new orders prefiltered.

### E — Verify spawned orders link back

12. Open any of the new orders → the detail header now shows a **Created from REQ-2026-00042** chip that deep-links back to the requisition.
13. Conversely, opening the requisition's drawer shows a **Spawned orders** strip with each child order pill.

---

## What happens behind the scenes

- `POST /api/requisitions/:id/approve` flips state, stamps `approvedAt` + `approvedByUserId`, and writes a `APPROVE` row into `requisition_history`.
- `POST /api/requisitions/:id/convert` groups `requisition_items` by `preferredVendorId`, then for each group:
  - Calls `lib/contractPricing.ts` to re-price using the full cascade.
  - Inserts a row in `orders` with `requisitionId` set (column added in migration `0013_orders_requisition_link.sql`).
  - Copies line items into `order_items`.
  - Enqueues `order.created` on the `curavend-events` queue → notifications + ERP push job fires.
- A line that has no `preferredVendorId` falls into a synthetic "unassigned" bucket and the routing engine picks the vendor at order-creation time.

---

## Verification

1. The requisition's stat tile moves from **Submitted** to **Approved** then **Converted**.
2. **`/supply-orders`** lists the new orders, each with the **Created from REQ-…** chip.
3. `GET /api/requisitions/:id` returns `state='CONVERTED'` and `spawnedOrderIds[]` populated.
4. The original requester gets two notifications: one on approval, one when the orders are created (`order.created` queue event).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Approve button greyed out** | You're not the resolved approver for this requisition | Check the **Overview** tab — `approverUserId` may belong to someone else (e.g. an `IN_REVIEW` requisition is owned by the first user to start review). Ask them to reassign or reject. |
| **Convert button missing** | Requisition is not in `APPROVED` state | Approve first. |
| **Convert fails: "no vendor resolved for line X"** | A line has no preferred vendor and the routing engine couldn't find a candidate | Edit the requisition's line to set a preferred vendor manually, or have admin add vendor coverage for that HCPC/state. |
| Spawned orders have $0 totals | Pricing cascade returned nothing | Verify a contract / GPO contract / fee schedule covers the HCPCs. Use **`/contract-pricing`** to test pricing in isolation. |
| Rejection didn't notify the requester | `RESEND_API_KEY` not set or in-app notifications disabled in their prefs | Check **`/admin/integration-log`** + the requester's **`/notification-preferences`**. |

---

## Related

- Feature reference: [`features/03-requisitions.md`](../features/03-requisitions.md), [`features/05-approvals.md`](../features/05-approvals.md), [`features/02-orders.md`](../features/02-orders.md)
- Adjacent workflows: [`02-create-and-submit-requisition.md`](./02-create-and-submit-requisition.md), [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md), [`04-record-goods-receipt.md`](./04-record-goods-receipt.md)

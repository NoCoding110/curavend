# Workflow 02 — Create and Submit a Requisition

## At a glance

| | |
|---|---|
| **What** | Create a procurement requisition, add line items (manually or from a template), and submit it for approval. |
| **Persona** | Hospital materials manager / supply-chain user (`FACILITY_ACCOUNT_MANAGER`, `FACILITY_ACCOUNT_MANAGER_USER`, or any user with `WRITE` on the `orders` resource — requisitions are scoped via the same permission). |
| **Prerequisites** | Hospital admin has set up the formulary (recommended) and at least one approval rule (so submission has somewhere to route). |
| **Estimated time** | 3-5 minutes per requisition. |

---

## Steps

### A — Start a new requisition

1. From the sidebar pick **Requisitions** → land on **`/requisitions`**.
2. The page shows a 6-stat dashboard (Draft / Submitted / In Review / Approved / Converted / Rejected). Click **New requisition** (top-right).

   ![Step 2](../images/wf-create-requisition-step-2.png)

3. The **Create Requisition** modal opens. Fill:
   - **Facility** — the receiving facility (required).
   - **Department** — owning cost center (optional but improves spend-by-dept analytics).
   - **Priority** — `ROUTINE` / `EXPEDITED` / `STAT`. `STAT` will trigger any approval rule that filters on priority.
   - **Needed by** — date picker.
   - **Notes** — free text for the approver.
4. Click **Create draft**. The drawer slides open on the new requisition (status `DRAFT`, number `REQ-2026-NNNNN`).

### B — Add line items (two options)

#### Option 1 — Manual entry

5. In the drawer's **Items** tab click **Add line**.
6. Enter:
   - **HCPC code** — autocomplete from `hcpc_codes`.
   - **Description** — auto-fills from the HCPC; editable.
   - **Quantity** — integer ≥ 1.
   - **Unit cost (est.)** — optional; if left blank, Curavend resolves it from contract → GPO → fee schedule → Medicare at submission time.
   - **Preferred vendor** — optional; if blank, the routing engine picks at conversion time.
7. Click **Save line**. Curavend immediately queries `GET /api/formulary/resolve?hcpcCode=…` and tags the line with one of:
   - `ON_FORMULARY` — green tag, no friction.
   - `OFF_FORMULARY` — orange tag, **justification required before submit**.
   - `RESTRICTED` — red tag, blocked unless an admin has whitelisted the user.
   - `REQUIRES_PRIOR_AUTH` — purple tag, will need an approved PA to convert to an order.

#### Option 2 — Instantiate a template

5b. Close the create modal. Go to **`/requisition-templates`** → pick a saved cart → click **Instantiate as requisition**.
6b. You're redirected to **`/requisitions`** with the new DRAFT requisition already populated. Edit quantities as needed.

### C — Resolve off-formulary warnings

7. For every line with an `OFF_FORMULARY` tag, click into the line and fill the **Justification** textarea.

   ![Step 7](../images/wf-create-requisition-step-7.png)

8. If the formulary lists **substitutes**, the drawer suggests them inline with a one-click **Use substitute** button that swaps the HCPC.

### D — Submit

9. With all warnings cleared, click **Submit** in the drawer footer.
10. Confirm the routing summary that appears (it shows which approver the rule engine resolved).
11. Status transitions `DRAFT → SUBMITTED`; the drawer's action footer changes to show only **Cancel** (Submitter) and **Approve** / **Reject** (visible only to the resolved approver).

---

## What happens behind the scenes

- `POST /api/requisitions` inserts into `requisitions` (state `DRAFT`) and mints `REQ-{YEAR}-{6digit}` via `sequences`.
- Each `POST /api/requisitions/:id/items` re-runs the formulary resolver and stamps `isOffFormulary` / `requiresPriorAuth` on the line. `estimatedTotalUsd` on the parent row is re-summed.
- `POST /api/requisitions/:id/submit` flips the state to `SUBMITTED` and calls `approvalRuleEngine.pickPrimaryApprover('REQUISITION', {hospitalId, amount, priority, flags})`. The resolved `approverUserId` is stamped on the row and an `IN_APP` + `EMAIL` notification dispatches via `services/notificationRouter.ts`.
- An audit row goes into `requisition_history`.

---

## Verification

1. The requisition appears in the **Submitted** stat tile at **`/requisitions`**.
2. The approver sees a new notification badge in the top-right bell and a row at **`/approvals`**.
3. `GET /api/requisitions/:id` returns the row with `state='SUBMITTED'`, `approverUserId` populated, and a `history[]` array including a `SUBMIT` event.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `"Off-formulary item requires justification"` on submit | One or more lines tagged `OFF_FORMULARY` have an empty justification | Click into each line, fill the **Justification** field, save, retry submit. |
| `"No approval rule matched"` toast on submit | No `approval_rules` row matches the requisition's amount / priority / flags | Have an admin create a catch-all rule (see [workflow 06](./06-set-up-approval-rules.md)). |
| `"Restricted HCPC"` error | Line is `RESTRICTED` in the formulary | Ask the hospital admin to whitelist the user, or swap to a non-restricted alternative. |
| Total $ shown is `$0.00` after adding a line | Unit cost left blank and no fee-schedule fallback hit | Either enter an estimated unit cost manually, or ask admin to load a contract/fee schedule covering that HCPC. |
| Submit button disabled | At least one line has 0 quantity, or the requisition has 0 lines | Add at least one line with qty ≥ 1. |

---

## Related

- Feature reference: [`features/03-requisitions.md`](../features/03-requisitions.md), [`features/04-formulary.md`](../features/04-formulary.md), [`features/05-approvals.md`](../features/05-approvals.md)
- Adjacent workflows: [`03-approve-requisition-and-convert.md`](./03-approve-requisition-and-convert.md), [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md), [`07-create-formulary-with-substitutes.md`](./07-create-formulary-with-substitutes.md), [`08-process-prior-authorization.md`](./08-process-prior-authorization.md)

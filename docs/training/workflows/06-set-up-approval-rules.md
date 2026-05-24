# Workflow 06 — Set Up Approval Routing Rules

## At a glance

| | |
|---|---|
| **What** | Configure declarative rules that automatically route requisitions (and other approvable artifacts) to the right approver based on amount, priority, facility, and content flags. |
| **Persona** | Hospital admin (`FACILITY_ACCOUNT_MANAGER`) or platform admin. |
| **Prerequisites** | Users / Groups / Roles you want to route to already exist. |
| **Estimated time** | 5-10 minutes per rule. |

---

## Steps

### A — Open the rule editor

1. From the sidebar pick **Admin** → **Approval Rules** (admin-only menu item) → land on **`/admin/approval-rules`**.
2. The page is split by **Trigger type** tabs:
   - `REQUISITION` (the most common).
   - `CONTRACT` (used by the contract approval workflow).
   - `ORDER` (rarely used; orders are mostly auto-routed by the vendor engine).
3. Pick the **REQUISITION** tab and click **New rule** (top-right).

   ![Step 3](../images/wf-approval-rules-step-3.png)

### B — Define the rule

4. The **Create rule** drawer opens with five sections.

   **Identity**
   - **Name** — short, human-readable (e.g. _"STAT > $5k → CFO"_).
   - **Active** — toggle (defaults on).

   **Match conditions** (all conditions ANDed together; absent fields ignored):
   - **Amount ≥ USD** / **Amount < USD** — half-open interval on `estimatedTotalUsd`.
   - **Facility** — restrict to a specific `hospital_facilities` row.
   - **Department** — restrict to a specific `hospital_departments` row.
   - **Priorities** — multi-select: `ROUTINE`, `EXPEDITED`, `STAT`.
   - **Flags** — three checkboxes: `containsOffFormulary`, `containsRestricted`, `containsPriorAuth`.
   - **Categories** — multi-select from the same item categories used by vendors (DME, biologics, etc.).

   **Approver**
   - **Type** — `USER`, `GROUP`, or `ROLE`.
   - **Approver** — searchable picker. For `USER` it queries `/api/users`; for `GROUP` it queries `/api/user-groups`; for `ROLE` it's a freeform string (e.g. `FACILITY_ACCOUNT_MANAGER`).
   - **Require all** — if approver is a `GROUP`, tick this to require every active member to approve (default: single member).

   **Priority and chaining**
   - **Priority** — integer, **lowest wins**. Use 10 / 20 / 30 to leave room.
   - **Is terminal** — if checked, this rule stops evaluation. Uncheck to chain into subsequent rules (rarely needed).

   ![Step 4](../images/wf-approval-rules-step-4.png)

5. Click **Save**. The rule appears in the table sorted by **Priority asc**.

### C — Preview before going live

6. With the rule saved, click the **Preview** button next to it.
7. The preview drawer takes a sample object — fill it like a requisition:
   - **Amount** (USD)
   - **Priority**
   - **Facility**
   - **Contains off-formulary** (yes/no)
   - **Contains restricted** (yes/no)
   - **Contains prior-auth** (yes/no)

   ![Step 7](../images/wf-approval-rules-step-7.png)

8. Click **Resolve**. The drawer renders the evaluation chain — every rule it considered, why each matched or skipped, and the final picked approver.
9. Tweak the rule until preview shows the expected approver for the cases you care about.

### D — Make sure something catches everything

10. Always have at least one **catch-all** rule at high priority (e.g. priority `999`, no conditions, approver = facility manager). Otherwise a requisition that matches nothing fails to submit with `"No approval rule matched"`.

---

## What happens behind the scenes

- Rules live in the `approval_rules` table. The `conditions` field is a JSON blob: `{amountGteUsd?, amountLtUsd?, facilityId?, departmentId?, priority?: string[], containsOffFormulary?, containsRestricted?, containsPriorAuth?, categoryAny?: string[]}`.
- The approver descriptor: `{type: 'USER' | 'GROUP' | 'ROLE', id: string, requireAll?: boolean}`.
- `services/approvalRuleEngine.ts` exports `resolveApprovers(triggerType, context)` (returns full chain) and `pickPrimaryApprover(triggerType, context)` (returns first non-empty resolution).
- Evaluation order: `priority ASC`. First match wins **unless** `isTerminal=0`, in which case evaluation continues and resolutions are merged.
- The requisition `submit` endpoint stamps the result on `requisitions.approverUserId`.

---

## Verification

1. Run the **Preview** for each scenario your hospital actually sees: small routine, large STAT, off-formulary, etc.
2. Submit a real test requisition. The drawer's **Overview** tab should show the same approver Preview predicted.
3. Inspect `GET /api/approval-rules?triggerType=REQUISITION` — your rules are listed sorted by `priority ASC`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **"No approval rule matched"** on submit | No rule's conditions are satisfied AND no catch-all exists | Add a catch-all rule at priority 999. |
| Wrong approver gets routed | A higher-priority rule (lower number) matched first | Use **Preview** to confirm; either raise the wrong rule's priority number, or tighten its conditions. |
| Group rule with **Require all** never fires the second approval | Group has only one active member | Add another member at **`/profile`** → User Groups, or untick **Require all**. |
| Rule disappears from the list | Someone toggled **Active** off; inactive rules are hidden by default | Toggle the **Show inactive** filter. |
| Two rules with same priority — which wins? | Tie-breaker is `created_at ASC` | Give them distinct priorities. |
| `ROLE` approver resolves to nobody | No active user holds that role in the requesting hospital's tenant | Either use a `USER`/`GROUP` approver, or grant the role to the right person. |

---

## Related

- Feature reference: [`features/05-approvals.md`](../features/05-approvals.md), [`features/19-permissions-groups.md`](../features/19-permissions-groups.md)
- Adjacent workflows: [`02-create-and-submit-requisition.md`](./02-create-and-submit-requisition.md), [`03-approve-requisition-and-convert.md`](./03-approve-requisition-and-convert.md), [`14-grant-user-permissions.md`](./14-grant-user-permissions.md)

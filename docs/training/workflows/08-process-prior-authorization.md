# Workflow 08 — Process a Prior Authorization

## At a glance

| | |
|---|---|
| **What** | Open a prior-authorization request to a payor, track its state through to Approved or Denied, and attach the resulting auth number / quantity to your order. |
| **Persona** | Hospital biller, intake coordinator, or provider's admin. |
| **Prerequisites** | Patient, payor, HCPC, and at least one ICD-10 code are known. |
| **Estimated time** | 5 minutes to create; payor turnaround varies (hours to days). |

---

## Steps

### A — Open the PA queue

1. From the sidebar pick **Prior Authorizations** → **`/prior-auths`**.
2. The page shows a 6-stat dashboard:
   - **Needed** (created locally, not yet submitted to payor)
   - **Submitted** (sent, awaiting payor pickup)
   - **Pending** (payor confirmed receipt, working on it)
   - **Approved** (good for the coverage window)
   - **Denied** (with reason)
   - **Expiring within 30 days** (an already-APPROVED PA whose `endDate` is < 30d away)

   ![Step 2](../images/wf-prior-auth-step-2.png)

### B — Create a new PA

3. Click **New PA** (top-right). The drawer opens.
4. Fill the create form:
   - **Patient** — searchable from your hospital's patient table.
   - **Payor** — picker; only `ACTIVE` payors from `/admin/payors` show.
   - **Payor member ID** — the patient's plan member number.
   - **Payor group ID** — optional plan group.
   - **HCPC code** — the item you need authorized.
   - **ICD-10 code(s)** — at least one; multi-select.
   - **Coverage window** — start and end date (defaults: today + 90 days).
   - **Quantity requested** — integer.
   - **Clinical note** — free-text justification; this is what the payor's reviewer reads.
5. Click **Save as Needed**. State = `NEEDED`. The PA gets a sequence number (e.g. `PA-2026-00042`).

### C — Submit to the payor

6. With the PA in `NEEDED`, the drawer's action footer shows **Move to Submitted**. Click it.
7. (Optional) Attach supporting documents — medical records, photos — via the **Documents** tab. Files land in R2 and are linked on the PA row.

   ![Step 7](../images/wf-prior-auth-step-7.png)

8. The state machine flips: `NEEDED → SUBMITTED`. Curavend stamps `submittedAt`. (If the payor has a configured 278 connector, the X12 message fires here. Most payors today use portals; treat this state as "we sent it to the portal".)
9. When the payor confirms receipt, manually click **Move to Pending** (no auto-state from payor portals today).

### D — Record the payor's response

10. When the payor responds, open the PA from **`/prior-auths`** and pick one of the allowed transitions from the **Move to X** buttons:

    **If Approved:**
    - Click **Move to Approved**.
    - The drawer prompts for **Authorization number** (required) and **Quantity approved** (integer; defaults to the qty you requested).
    - Optionally set **Effective dates** if different from what you requested.
    - Click **Save**.

      ![Step 10](../images/wf-prior-auth-step-10.png)

    **If Denied:**
    - Click **Move to Denied**.
    - Modal prompts for **Denial reason** (required) and an optional **Reviewer note**.
    - Click **Save**. State machine allows `DENIED → SUBMITTED` later if you want to resubmit after appeal.

    **If Expired (auto):**
    - The 08:00 UTC cron flips any `APPROVED` PA whose `endDate` passed to `EXPIRED` automatically.

### E — Link to an order

11. With the PA in `APPROVED`, navigate to the matching order at **`/supply-orders/{id}`**.
12. In the header click **Attach prior auth** → pick your `PA-2026-00042` from the picker (filtered to active approvals for the patient/HCPC).
13. The order row now stamps `priorAuthId`; the auth number is propagated to the invoice and shows in the billing record.

### F — Timeline view

14. The PA detail drawer's **Timeline** tab shows every transition, who made it, and when, sourced from `prior_auth_history`. Useful for audit and appeals.

---

## What happens behind the scenes

- PAs live in `prior_auths` (7-state machine: `NEEDED`, `SUBMITTED`, `PENDING`, `APPROVED`, `DENIED`, `EXPIRED`, `CANCELLED`). History rows in `prior_auth_history`. Migration `0009_prior_auths.sql`.
- The **transition matrix is enforced server-side** in `routes/priorAuths.ts`. For example, `DENIED` can only transition back to `SUBMITTED` (for appeal). Invalid transitions return 400.
- `POST /api/prior-auths/:id/transition` writes the new state, the actor, and (if approved) the `authNumber` / `quantityApproved` / `effective*` fields. Triggers an in-app notification to the requester.
- The daily cron walks all `APPROVED` PAs and flips any past `endDate` to `EXPIRED`.

---

## Verification

1. **`/prior-auths`** dashboard's stat tiles reflect your new PA.
2. `GET /api/prior-auths/:id` returns the current state and a `history[]` array.
3. The linked order's row shows the auth # on the **Overview** tab.
4. The eventual invoice for that order carries the auth # forward to the vendor's billing.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **"Invalid transition"** when trying to flip state | The matrix forbids that move (e.g. trying to go from `APPROVED` straight to `DENIED`) | Use the allowed path; cancel and re-submit if you need a fresh review. |
| **Approve dialog rejects empty auth number** | Auth # is required for `APPROVED` state | Enter the payor's auth # from their confirmation. |
| PA never auto-expires | Cron didn't run (rare) or `endDate` was set to `null` | Trigger manually via **`POST /api/admin/cron/run-pa-expiry`** or set an end date. |
| Order won't accept PA attach | PA's HCPC doesn't match the order's line HCPC | Either pick a different PA or create a new PA for the right HCPC. |
| Resubmission after denial isn't tracked | You created a new PA instead of moving the denied one back to `SUBMITTED` | For appeal trails, prefer to re-use the original PA and transition it; create new PAs for genuinely new requests. |

---

## Related

- Feature reference: [`features/06-prior-auths.md`](../features/06-prior-auths.md), [`features/12-payors-eligibility.md`](../features/12-payors-eligibility.md), [`features/04-formulary.md`](../features/04-formulary.md)
- Adjacent workflows: [`02-create-and-submit-requisition.md`](./02-create-and-submit-requisition.md), [`07-create-formulary-with-substitutes.md`](./07-create-formulary-with-substitutes.md)

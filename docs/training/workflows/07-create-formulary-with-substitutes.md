# Workflow 07 — Build a Formulary with Substitutes

## At a glance

| | |
|---|---|
| **What** | Define the approved-HCPC whitelist for your hospital (org-wide or per-facility), plus ranked substitute items the system will suggest when a requested HCPC isn't preferred. |
| **Persona** | Hospital admin / platform admin. |
| **Prerequisites** | HCPC codes seeded (they are — see `seed_hcpc_codes.sql`). At least one vendor with a SKU catalog for the HCPCs you'll list. |
| **Estimated time** | 30-60 minutes for an initial formulary; 1-2 minutes per add afterwards. |

---

## Steps

### A — Pick the scope

1. From the sidebar pick **Admin** → **Formulary** → land on **`/admin/formulary`**.
2. Top of the page is a **Scope picker**:
   - **Org-wide** — applies across every facility unless overridden.
   - **Facility-specific** — picks one `hospital_facilities` row; overrides org-wide entries for that facility.
3. Choose **Org-wide** for an initial baseline.

   ![Step 3](../images/wf-formulary-step-3.png)

### B — Add a single item

4. Click **Add item** (top-right of the table).
5. Fill the modal:
   - **HCPC code** — autocomplete from `hcpc_codes`.
   - **Description** — auto-filled; editable.
   - **Status** — `ACTIVE` (default), `INACTIVE` (hidden from new requisitions but historical kept), `RETIRED` (purely archival).
   - **Preferred vendor** — required; used by the requisition's auto-select.
   - **Secondary vendor** — optional fallback.
   - **Max unit price (USD)** — guardrail; lines billing above this raise an audit flag on 3-way match.
   - **Requires prior auth** — boolean. If `true`, requisitions for this HCPC get tagged `REQUIRES_PRIOR_AUTH` and cannot convert to an order without an `APPROVED` PA.
   - **Is restricted** — boolean. If `true`, only users with an explicit grant can requisition (rejected at the `formulary/resolve` step).
   - **Par level** — target on-hand quantity (used by reorder suggestions).
   - **Reorder quantity** — how many to order when below par.
6. Click **Save**. Row appears in the table.

### C — Bulk import (the fast path)

7. From the **`/admin/formulary`** page click **Bulk import** (top-right, next to **Add item**).
8. The drawer accepts a CSV-style textarea. Format (header row optional):
   ```csv
   hcpcCode,description,preferredVendorId,secondaryVendorId,maxUnitPriceUsd,requiresPriorAuth,isRestricted,parLevel,reorderQty,status
   L1832,Knee orthosis adjustable,vend-001,vend-002,425.00,0,0,5,10,ACTIVE
   L3900,Wrist hand finger orthosis,vend-001,,750.00,1,0,2,5,ACTIVE
   L0637,Lumbar sacral orthosis,vend-003,vend-001,690.00,0,0,3,5,ACTIVE
   ```

   ![Step 8](../images/wf-formulary-step-8.png)

9. Click **Validate**. The server returns a row-by-row result (`OK` / `ERROR: vendor not found` / etc.). Fix any errors in the textarea.
10. When all rows are `OK`, click **Import**. Existing rows on the same `hcpcCode` are updated; new rows are inserted.

### D — Add substitutes to a formulary item

11. Click into a row → the **detail drawer** slides in.
12. Switch to the **Substitutes** tab → click **Add substitute**.
13. Pick a substitute HCPC and set its **Priority** (integer, lowest first). Click **Save**.
14. Repeat for as many substitutes as you want — the requisition UI will suggest them in priority order when a user types in the parent HCPC and it's tagged off-formulary.

   ![Step 14](../images/wf-formulary-step-14.png)

### E — Verify with a test resolve

15. Open a terminal or use the in-app HCPC search at **`/sku-catalog`**: pick an item and trigger a requisition draft (workflow 02). The line should auto-tag green `ON_FORMULARY` for items you just added; substitutes should appear under any item you typed that isn't on the formulary.

---

## What happens behind the scenes

- Items live in `formulary_items` (per-hospital `hospitalId` + optional `facilityId`). Substitutes live in `formulary_substitutes` (parent `formularyItemId` + child `hcpcCode` + `priority`). Both tables landed in migration `0011_formulary.sql`.
- The frontend table is paged via `GET /api/formulary?scope=ORG|FACILITY&facilityId=…`.
- `POST /api/formulary/bulk-import` is wrapped in a D1 transaction — either all rows succeed or none do.
- `GET /api/formulary/resolve?hcpcCode=X11` returns `{status: ON_FORMULARY | OFF_FORMULARY | RESTRICTED, requiresPriorAuth, item, substitutes[]}` and is what every requisition-line save calls.

---

## Verification

1. **`/admin/formulary`** lists every item you imported, sorted by HCPC code.
2. `GET /api/formulary/resolve?hcpcCode=L1832` returns `status: 'ON_FORMULARY'` with the preferred vendor populated.
3. Creating a requisition for `L1832` shows a green ON_FORMULARY tag.
4. Creating a requisition for an HCPC **not** in the formulary that has substitutes shows the orange OFF_FORMULARY tag plus the **Use substitute** quick-action.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **`"HCPC code not found"`** when adding | The code isn't in `hcpc_codes` | Add it via the catalog admin tools or use a valid HCPC. |
| Bulk import returns `ERROR: vendor not found` for many rows | Vendor IDs (`vend-…`) misspelled or vendors not yet created | Run **`/vendors`** to copy the correct IDs and re-paste. |
| Substitutes don't appear in the requisition UI | Parent item's status is `INACTIVE` | Edit the parent to `ACTIVE`. |
| Facility-scoped formulary doesn't override org-wide for a user | User's `facilityId` (from their JWT memberships) doesn't match | Have user switch active membership to the right facility, or grant them membership to it. |
| Imported but `requiresPriorAuth` not applied | CSV value was anything other than `1` / `true` (case-sensitive) | Re-import with `1` for true; the parser is strict. |

---

## Related

- Feature reference: [`features/04-formulary.md`](../features/04-formulary.md), [`features/03-requisitions.md`](../features/03-requisitions.md), [`features/06-prior-auths.md`](../features/06-prior-auths.md)
- Adjacent workflows: [`02-create-and-submit-requisition.md`](./02-create-and-submit-requisition.md), [`08-process-prior-authorization.md`](./08-process-prior-authorization.md), [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md)

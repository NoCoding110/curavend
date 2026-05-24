# Workflow 15 — Set Up GPO Membership for a Hospital

## At a glance

| | |
|---|---|
| **What** | Register a hospital's membership with a Group Purchasing Organization (Vizient / Premier / HealthTrust / Intalere / Capstone / Other), then load that GPO's contract rates so Curavend's pricing cascade can use them. |
| **Persona** | Platform admin or hospital admin with admin rights. |
| **Prerequisites** | Hospital's GPO member ID (provided by the GPO). The GPO's contract rate sheet (CSV-able) or per-item rates. |
| **Estimated time** | 20-40 minutes including bulk-importing a real GPO rate sheet. |

---

## Steps

### A — Open the GPO admin page

1. Sign in as admin and go to **`/admin/gpo-contracts`**.
2. The page is a 2-column layout:
   - **Left** — GPO sidebar with the 6 seeded GPOs (Vizient, Premier, HealthTrust, Intalere, Capstone, Other).
   - **Right** — Selected GPO's items table.

   ![Step 2](../images/wf-gpo-step-2.png)

3. If your GPO isn't pre-seeded, click **New GPO** (top of sidebar) and add it: **Name**, **Kind** (one of the picker values), **Active**.

### B — Set the hospital's membership

4. Pick a GPO in the sidebar → top-right of the right pane click **Set hospital membership**.
5. The modal asks for:
   - **Hospital** — searchable picker; pick the target hospital.
   - **Member ID** — the hospital's account number with the GPO (provided by the GPO).
   - **Active** — toggle.
6. Click **Save**. The hospital's row in `hospitals` is updated: `gpoOrganizationId` = chosen GPO, `gpoMemberId` = the ID.

   ![Step 6](../images/wf-gpo-step-6.png)

### C — Add a single contract item

7. With the GPO selected, click **Add item** (top-right of the items table).
8. Fill the modal:
   - **HCPC code** — autocomplete from `hcpc_codes`.
   - **Vendor** — the vendor honoring this GPO rate. Optional; if blank, applies to any vendor.
   - **Unit price (USD)** — the negotiated rate.
   - **Effective start date** — date picker.
   - **Effective end date** — date picker; defaults +1 year.
9. Click **Save**. Row appears in the table.

### D — Bulk-import a rate sheet (the realistic path)

10. Click **Bulk import** (top-right of the items table).
11. The drawer accepts a CSV-style textarea. Format (header row optional):
    ```csv
    hcpcCode,vendorId,unitPriceUsd,effectiveStartDate,effectiveEndDate
    L1832,vend-001,395.00,2026-01-01,2026-12-31
    L3900,,710.00,2026-01-01,2026-12-31
    L0637,vend-003,650.00,2026-01-01,2026-12-31
    A4253,,28.50,2026-01-01,2026-12-31
    ```

    ![Step 11](../images/wf-gpo-step-11.png)

12. Click **Validate** → server returns per-row results (`OK` / `ERROR: vendor not found` / etc.).
13. Fix any errors and click **Import**. Rows insert into `gpo_contract_items`.

### E — Verify the pricing cascade picks up the new rates

14. Open the price tester at **`/contract-pricing`** or the requisition draft drawer.
15. Enter an HCPC that has a GPO rate. The pricing card now shows:
    ```
    Source: GPO
    Rate: $395.00
    From: Vizient GPO contract, eff 2026-01-01 → 2026-12-31
    Cascade: Contract → [GPO ✓] → Fee Schedule → Medicare → Manual
    ```

    ![Step 15](../images/wf-gpo-step-15.png)

16. If the hospital has a tighter bilateral contract for that HCPC, that wins instead — the cascade always picks the **first hit**.

### F — Confirm leakage report changes

17. Run **`/reporting/contract-leakage`** (workflow 10) for the recent period. Lines covered by the new GPO rates should either:
    - Drop off the report (now within tolerance of the new best), or
    - Have `Best source` flip from `CONTRACT` to `GPO` if the GPO rate is lower than your bilateral contract.

---

## What happens behind the scenes

- `gpo_organizations` and `gpo_contract_items` tables were added in migration `0007_gpo_pricing.sql`.
- Setting membership writes `hospitals.gpoOrganizationId` + `hospitals.gpoMemberId`.
- The pricing cascade in `lib/contractPricing.ts` is: **Contract → GPO Contract → Fee Schedule → Medicare → Manual**. `getGpoRate()` and `getGpoRatesBulk()` query for `(gpoOrganizationId, hcpcCode)` rows active on the order date, optionally narrowed to a specific vendor.
- The contract-leakage report (`/api/reports/contract-leakage`) `UNION ALL`s the active contract rates with the active GPO rates and takes `MIN(unitPrice)` to determine "best available" — so loading GPO rates immediately affects leakage detection.
- Bulk import wraps inserts in a D1 transaction; partial failures roll back.

---

## Verification

1. The hospital's row in `hospitals` shows the GPO and member ID.
2. `GET /api/gpo/:gpoId/items` lists every row you imported.
3. Pricing the test HCPC at **`/contract-pricing`** returns source `GPO` with the right rate.
4. The contract-leakage report reflects the new best-available prices.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Member ID rejected** | Field is freeform; rejection means GPO isn't `ACTIVE` | Toggle the GPO `Active` on first. |
| Pricing cascade still picks Medicare instead of GPO | Hospital membership not set, OR GPO item's effective window doesn't include the order date | Verify membership on **`/admin/gpo-contracts`**; confirm dates on the item. |
| Bulk import fails entirely after one error | Transactional — rolls back the whole batch | Fix the bad row and re-paste. |
| Vendor-specific GPO rate not applied to that vendor | Vendor ID typo OR vendor not linked to the hospital | Verify vendor at **`/vendors`** and link via **`/facility-vendors`**. |
| Two GPO rates for the same HCPC + vendor + date | Latest start-date wins (matches contract behavior) | If wrong, deactivate the older row by editing its end date. |
| Leakage report doesn't refresh after import | Report is computed live — refresh the page | Hard-refresh; values should update within seconds. |

---

## Related

- Feature reference: [`features/11-gpo-contracts.md`](../features/11-gpo-contracts.md), [`features/10-contracts-pricing.md`](../features/10-contracts-pricing.md), [`features/15-contract-leakage.md`](../features/15-contract-leakage.md)
- Adjacent workflows: [`10-detect-contract-leakage.md`](./10-detect-contract-leakage.md), [`12-onboard-a-hospital.md`](./12-onboard-a-hospital.md)

# Workflow 09 — Run a Multi-Site Spend Report

## At a glance

| | |
|---|---|
| **What** | Roll up procurement spend across every facility in your hospital tenant, drill into per-department detail, and surface match-exception hot spots. |
| **Persona** | Hospital admin, CFO, materials director. |
| **Prerequisites** | At least one posted invoice in the chosen date range. |
| **Estimated time** | 1-2 minutes to run; 10-30 minutes to analyze. |

---

## Steps

### A — Open the report

1. From the sidebar pick **Reporting** → **Multi-Site Spend** → land on **`/reporting/multi-site-spend`**.
2. The header has a **Date range picker** (default: trailing 90 days). Adjust and click **Apply**.

   ![Step 2](../images/wf-multi-site-spend-step-2.png)

3. The page renders 4 KPI cards across the top:
   - **Total spend (USD)** — sum of `grand_total_cents` on every invoice in range.
   - **Invoices** — count.
   - **Orders** — count of distinct orders billed.
   - **Match exceptions** — count of `three_way_matches` rows not in `PERFECT`/`ACCEPTED`.

### B — Cross-site rollup

4. Below the KPIs are three tabs. The default is **Cross-site rollup**: one row per hospital tenant (relevant for admins managing more than one) with the same 4 columns plus an **Exception flag** dot.
5. For a single-hospital user, this tab is one row. Skip ahead to **By facility**.

### C — By facility

6. Switch to the **By facility** tab. Now you have one row per `hospital_facilities` entry with:
   - Facility name + city/state
   - Total spend
   - Invoice count
   - Order count
   - Match-exception count
   - Avg invoice $
7. Sort by **Total spend** descending. Look for facilities punching above their volume.

   ![Step 7](../images/wf-multi-site-spend-step-7.png)

8. Click any facility row → drills into a focused view of just that facility's data on the **By department** tab.

### D — By department

9. Switch to the **By department** tab. One row per department with:
   - Department name + facility
   - Total spend
   - Invoice / order count
10. Use the **Facility filter dropdown** at the top of this tab to scope to a single facility. Dropdown is auto-populated from your tenant's `hospital_facilities`.

    ![Step 10](../images/wf-multi-site-spend-step-10.png)

11. Sort by **Total spend** to find the high-cost departments.

### E — Investigate hot spots

12. Click any department row → opens a side drawer with that department's top 10 HCPCs by spend in the period.
13. From the drawer click an HCPC → navigates to **`/reporting/contract-leakage`** filtered to that HCPC to see if you're paying above contract rates (see workflow 10).
14. From the rollup tab, the **Exception flag** dot — if red — links to **`/match-exceptions`** prefiltered to that facility's date-range invoices.

### F — Export

15. Top-right of the page has an **Export CSV** button. Downloads whatever tab you're currently on, scoped to your date range and any filters.

---

## What happens behind the scenes

- The page fetches three endpoints in parallel:
  - `GET /api/reports/multi-site-rollup?from=…&to=…`
  - `GET /api/reports/spend-by-facility?from=…&to=…`
  - `GET /api/reports/spend-by-department?from=…&to=…&facilityId?=…`
- Each endpoint runs a raw SQL aggregate over `invoices × invoice_items × orders × hospital_facilities × hospital_departments LEFT JOIN three_way_matches`. (D1 / SQLite — no materialized views — every call recomputes.)
- Tenant scoping: HOSPITAL users see only their own hospital's rows. Platform admins see everyone unless they explicitly filter by `hospitalId`.
- Match-exception count comes from `three_way_matches.matchStatus NOT IN ('PERFECT')` AND `resolution IS NULL`.

---

## Verification

1. Totals on the **Cross-site rollup** tab match what you see on **`/billing-orders`** filtered to the same date range.
2. Drilling from a facility row to its department breakdown preserves the date range.
3. Exporting and summing the CSV matches the KPI card values.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **All cards show $0** | Date range excludes every invoice | Widen the range; check **`/billing-orders`** to confirm invoices exist. |
| **Department tab is empty** for a facility | Orders weren't tagged with `departmentId` | Have requesters fill the **Department** field on requisitions, or back-fill on existing orders. |
| Report takes 10+ seconds | Very large date range (multi-year) on a tenant with thousands of invoices | Narrow the range; consider exporting to CSV and analyzing offline. |
| Cross-site rollup shows other hospitals' data | You logged in as a platform admin | Switch to a hospital membership at **`/profile`** → Memberships, or accept the multi-tenant view. |
| Numbers differ from your accounting system | Curavend totals invoices in `grandTotalCents`; your accounting may use `subtotalCents` (pre-tax) | Use the **Export CSV** which has every component column. |
| Exception flag red but zero on `/match-exceptions` | You resolved the exceptions but the dot uses raw count not resolution status | Refresh — the dot uses `matchStatus`, which is right; but read it as "had exceptions" not "currently has exceptions". |

---

## Related

- Feature reference: [`features/14-multi-site-spend.md`](../features/14-multi-site-spend.md), [`features/09-invoices.md`](../features/09-invoices.md), [`features/08-three-way-match.md`](../features/08-three-way-match.md)
- Adjacent workflows: [`10-detect-contract-leakage.md`](./10-detect-contract-leakage.md), [`05-resolve-match-exception.md`](./05-resolve-match-exception.md)

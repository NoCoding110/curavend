# Contract Leakage

## What it does

Contract Leakage finds invoice lines you paid too much on relative to the best available rate (your direct contracts and your GPO rates). For every invoice line in a date range, the report looks up the minimum of `(active contract rate, active GPO rate)` for that HCPC + vendor at the invoice date, and flags lines where the paid price was more than 2 % above the best available. Results are sorted by biggest dollar leak first.

This is the "show me where we overpaid" report — every dollar it surfaces is a dollar you can claim back from the vendor or fix in your next contract negotiation.

## Who uses it

- **Hospital** finance / supply chain leadership.
- **Admin** for IDN-wide visibility.
- Vendor users do **not** see this report.

## The page

**Sidebar →** Reporting → Contract Leakage. Route is `/reporting/contract-leakage`.

![Contract leakage report](../images/feature-contract-leakage.png)

- **Date range picker** at the top (defaults to YTD).
- **3 KPI cards**:
  - Total leakage $ (sum of every flagged line's overpayment)
  - Leaking line count
  - Average leak per line
- **Table** (descending by leak total):
  - Invoice # · invoice date
  - HCPC · description
  - Vendor
  - Quantity
  - Paid unit price
  - Best available unit price
  - Leak per unit ($)
  - Leak total ($) — color-coded by severity
  - Leak % (paid vs best) — green / yellow / red bands

## Actions you can take

| Action | What it does | Permission |
|---|---|---|
| **Change date range** | Refetches the report | always |
| **Click an invoice row** | Opens the invoice detail | `orders: READ` (invoices) |
| **Export CSV** | Downloads the flagged rows | reporting access |

## Workflow

### Per-invoice-line leakage logic

```mermaid
flowchart TD
  A[Invoice line: HCPC L1832,<br/>qty 5, paid $130] --> B[Look up best available rate<br/>at invoice date]
  B --> C[Best = MIN of:<br/>active contract rate · active GPO rate]
  C --> D{Paid > best × 1.02?}
  D -- No --> N[Not leaking]
  D -- Yes --> L[Leak = (paid − best) × qty]
  L --> R[Append to result · sort by leak DESC]
```

🛈 **Why `MIN(contract, GPO)` instead of the cascade order** — the cascade is what you *should have* used at order time. Leakage looks for cases where the cascade picked a worse price than was actually available (e.g. a stale contract was loaded, or the GPO membership wasn't set). Using `MIN` catches both bugs and policy gaps.

🛈 **SQLite has no FULL OUTER JOIN** — the implementation uses `UNION ALL` to combine contract rates + GPO rates into a single best-rate CTE.

## Common tasks

- [Detect contract leakage](../workflows/10-detect-contract-leakage.md)
- [Set up GPO membership for a hospital](../workflows/15-set-up-gpo-membership.md) (a common root-cause fix)

## Permissions

Hospital users see leakage for their own `hospitalId`. Admins can filter by hospital. The endpoint returns `403` for vendor / provider users.

## Behind the scenes

- **API endpoint**: `GET /api/reports/contract-leakage?startDate=&endDate=&hospitalId=` → `{totalLeakageUsd, leakingLineCount, avgLeakUsd, items: […]}`.
- **Tolerance**: hard-coded **2 %**. Lines paid up to `best × 1.02` are considered within rounding tolerance.
- **SQL shape**: one CTE for contract rates, one for GPO rates, `UNION ALL` to produce all rate candidates, `GROUP BY (hcpc, vendor)` to pick the MIN, then LEFT JOIN to invoice lines.
- **Performance note**: this is a heavy query — for large date ranges results are paginated and the API caps at 5000 rows.

## Related

- [Contracts & Pricing](./10-contracts-pricing.md)
- [GPO Contracts](./11-gpo-contracts.md)
- [Multi-Site Spend](./14-multi-site-spend.md)
- [Invoices](./09-invoices.md)

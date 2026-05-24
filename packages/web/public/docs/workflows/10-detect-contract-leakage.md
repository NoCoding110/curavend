# Workflow 10 — Detect Contract Leakage

## At a glance

| | |
|---|---|
| **What** | Surface every invoice line you've paid above the best-available rate (contract or GPO) so you can recover overpayments or renegotiate. |
| **Persona** | Hospital admin, supply-chain analyst, CFO. |
| **Prerequisites** | Active contracts and/or GPO contract items loaded covering the HCPCs in question. Posted invoices in the date range. |
| **Estimated time** | 5 minutes to run; 30+ minutes to act on the findings. |

---

## Steps

### A — Open the leakage report

1. From the sidebar pick **Reporting** → **Contract Leakage** → land on **`/reporting/contract-leakage`**.
2. The header has a **Date range picker** (default: trailing 90 days). Choose a window and click **Apply**.

   ![Step 2](../images/wf-contract-leakage-step-2.png)

### B — Read the KPIs

3. Three cards across the top:
   - **Total leakage (USD)** — sum of `leakTotal` across all flagged lines.
   - **Leaking lines** — count of invoice lines paid above best-available + 2%.
   - **Avg leak per line** — total / count.
4. If total leakage is $0, congratulations — every line was within 2% of the best contract or GPO rate. Widen the date range to confirm.

### C — Read the table

5. The table below is sorted by **Leak total descending** — biggest dollar hits first. Columns:
   - **Invoice #** (clickable)
   - **HCPC** — the billed code
   - **Vendor**
   - **Qty** — billed quantity
   - **Paid unit $** — what you actually paid per unit
   - **Best unit $** — the best-available rate Curavend could find at the time
   - **Best source** — `CONTRACT` or `GPO` (whichever was cheaper)
   - **Leak per unit** — `paid - best`
   - **Leak total** — `leakPerUnit × qty`
   - **Leak %** — color-coded: yellow 2-5%, orange 5-15%, red > 15%

   ![Step 5](../images/wf-contract-leakage-step-5.png)

### D — Drill into a specific invoice

6. Click any **Invoice #** → navigates to **`/billing-orders/{id}`** with the invoice detail open.
7. In the invoice's **Lines** tab, the leaking line is highlighted. Compare:
   - The contract or GPO rate (visible by clicking the line → **Pricing source** drawer).
   - The vendor's billed unit price.
8. Possible explanations (in order of likelihood):
   - Vendor billed an old rate (contract was amended after).
   - Wrong HCPC on the invoice (e.g. unbundled into a more expensive code).
   - Active contract not loaded into Curavend (admin error).
   - Vendor missed a GPO discount they're contractually required to honor.

### E — Take corrective action

9. Pick one of:

   | Action | When | How |
   |---|---|---|
   | **Dispute the invoice line** | Vendor billed wrong | On the invoice's line, click **Dispute** → opens the same flow as 3-way match dispute. Vendor gets notified, line is unpaid until resolved. |
   | **Renegotiate the contract** | Contract rate is now too high relative to market | Go to **`/contracts`** → open the contract → click **Amend** → edit rates → submit for approval. |
   | **Switch vendor** | Repeat leakage from same vendor | Open the formulary at **`/admin/formulary`** → swap the **Preferred vendor** on the leaking HCPCs to a more competitive one. |
   | **Load missing GPO rates** | Best source shows `CONTRACT` at a high rate when you know a GPO has a lower one | Run [workflow 15](./15-set-up-gpo-membership.md). |

### F — Export and share

10. Click **Export CSV** in the header → produces a row per leaking line with every column from the table plus PO #, order date, and contract # (if any).

---

## What happens behind the scenes

- The endpoint is `GET /api/reports/contract-leakage?from=…&to=…` (added in session 11; see `routes/reporting.ts`).
- For each invoice line in the period, the query looks up best-available unit price as the **MIN of**:
  - Active contract rates for `(hospitalId, vendorId, hcpcCode)` that overlap `invoiceDate`.
  - Active GPO contract rates for `(gpoOrganizationId, hcpcCode)` where the hospital has membership in that GPO.
- The two are `UNION ALL`'d (SQLite doesn't have `FULL OUTER JOIN`) and `MIN()`'d.
- Lines paid > `best × 1.02` are flagged. The 2% tolerance matches the 3-way match price-variance tolerance.
- Result sorted by `(leakTotal DESC)` and returned as `{rows: [...], totalLeakUsd, leakingLineCount, avgLeakPerLine}`.

---

## Verification

1. Pick a row from the table. Open **`/contracts`**, find the contract, confirm the rate matches what the report calls `Best unit $`.
2. The invoice the row points to does show the higher paid price in its **Lines** tab.
3. If you load a previously-missing GPO contract (workflow 15) and re-run the report, lines covered by that GPO should drop off (or the `Best source` should switch to `GPO` with a lower rate).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Total leakage is $0** but you know vendors over-bill | No active contracts or GPO rates loaded — the report has no "best" to compare against | Load at least one contract or GPO rate covering the HCPCs in question, then re-run. |
| **Best source always `CONTRACT`** even though you set up GPO membership | Hospital not marked as a member of that GPO (no `gpoOrganizationId` + `gpoMemberId` on the hospital row) | Workflow 15 step D — set membership. |
| Leak % flagged at exactly 2.01% — feels like noise | The 2% tolerance is intentionally tight to catch small slippage | If too noisy, filter the CSV in Excel to leakages > 5%. The threshold is not currently UI-tunable. |
| Same vendor / HCPC repeats with identical leak across many invoices | Vendor's pricing system out of sync | Send them the exported CSV; this is a strong negotiation lever. |
| Report shows a leak but the invoice is in `DISPUTED` status | The report doesn't filter on resolution — it sees the billed price | Wait until the invoice is fully resolved before counting; or filter exported CSV by invoice status. |

---

## Related

- Feature reference: [`features/15-contract-leakage.md`](../features/15-contract-leakage.md), [`features/10-contracts-pricing.md`](../features/10-contracts-pricing.md), [`features/11-gpo-contracts.md`](../features/11-gpo-contracts.md)
- Adjacent workflows: [`15-set-up-gpo-membership.md`](./15-set-up-gpo-membership.md), [`05-resolve-match-exception.md`](./05-resolve-match-exception.md), [`09-run-multi-site-spend-report.md`](./09-run-multi-site-spend-report.md)

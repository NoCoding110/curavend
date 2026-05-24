# Workflow 21 — Audit Lab Stock Movements for Compliance

## At a glance

| | |
|---|---|
| **What** | Pull the append-only log of every lab stock change (RECEIVE / ISSUE / ADJUST / EXPIRE / TRANSFER / QUARANTINE / RECALL) for an inspector, an internal QA review, or a "what happened to lot X?" investigation. |
| **Persona** | Lab Account Manager (`LAB_ACCOUNT_MANAGER`), Admin (`ACCOUNT_MANAGER`), or any lab user with `lab-inventory` READ. |
| **Prerequisites** | At least one `lab_stock_movements` row at the site (any receive / issue / adjust has happened). |
| **Estimated time** | 1-3 minutes per filter pass; 5-10 minutes for a multi-site inspector report. |

---

## Steps

### A — Open the audit page

1. From the sidebar pick **Lab Operations → Audit Log**, or go directly to **`/labs/audit`**.
2. The page header shows **Stock Movement Audit** with **Export CSV** and **Refresh** in the top-right.

   ![Step 1](../images/wf-audit-stock-movements-step-1.png)

🛈 *Why this matters.* CLIA §493.1252, ISO 15189 §5.3, and CAP All-Common Checklist all require a traceable record of every reagent / consumable that went into a clinical result — who issued it, from which lot, on what date. This page is the system of record for that requirement.

### B — Pick a site

3. In the filter row, the **All sites** select defaults to everything across the lab group. For a single-site inspection, pick the site by name.
4. Selecting a site immediately re-queries — there is no separate **Apply** button.

### C — Pick a consumable (optional)

5. In **All consumables**, type the item code or description. Useful for "show me every movement against PCR Master Mix 5×" lines of questioning.
6. Leave it blank for a full ledger.

### D — Pick a movement type (optional)

7. In **All types** pick from:
   - `RECEIVE` — new lot in via goods receipt
   - `ISSUE` — consumed by a test run (auto or manual)
   - `ADJUST` — cycle-count correction with reason
   - `EXPIRE` — auto-flagged by the daily cron
   - `TRANSFER OUT` / `TRANSFER IN` — inter-site moves (paired by `relatedTransferId`)
   - `QUARANTINE` — pulled from active rotation, on-hand preserved
   - `RECALL` — terminal, vendor / manufacturer recall

   ![Step 7](../images/wf-audit-stock-movements-step-7.png)

8. Common inspector queries are filter combinations, e.g.:
   - "Show every `QUARANTINE` in March across all sites" → leave site blank, type `QUARANTINE`, set date range.
   - "Show every `RECALL` ever" → leave site, consumable, and date blank, type `RECALL`.

### E — Pick a date range

9. **Date range** defaults to the **trailing 30 days**. Click to override — supports custom from / to. The RangePicker normalizes to start-of-day and end-of-day on the server side.

### F — Read the table

10. Columns:
    - **When** — local time; hover for full ISO timestamp.
    - **Type** — color-coded tag (green RECEIVE, blue ISSUE, gold ADJUST, red EXPIRE / RECALL, magenta QUARANTINE, orange TRANSFER OUT, cyan TRANSFER IN).
    - **Site** — friendly site name from `/labs/kit-sites`.
    - **Consumable** — bolded item code + description.
    - **Lot** — first 8 chars of the lot UUID (open `/labs/inventory` → **All lots** for the full row).
    - **Qty** — **signed**: `+5` (green) for receipts, `-3` (red) for issues, `0` for the paired `TRANSFER_IN` marker.
    - **After** — `quantity_after`, the lot's on-hand snapshot **immediately after this movement**.
    - **Reason** — freeform; auto-filled by the system for `Initial receipt` / `Restock` / `Test run <testCode>` / `Transfer to site …` / `Transfer from site …`.
    - **Related** — chips for `Lab` (`relatedLabOrderId`), `Order` (`relatedOrderId` — usually a GRN's parent purchase order), `Transfer` (`relatedTransferId`).

### G — Export for the inspector

11. Click **Export CSV**. File name is `lab-audit-{YYYY-MM-DD}.csv`. Columns: `Timestamp, Type, Site, Consumable, Lot, Qty, After, Reason, User`.
12. CSV is generated **client-side from the visible row set**, so re-filter and re-export to slice the data exactly how the inspector wants it.

⚠ *Don't filter the CSV in Excel after export.* Re-filter at the source (the page) and re-export, so the file you hand the inspector matches the headline (e.g. file name says "March" → rows are only March).

---

## What happens behind the scenes

- The page calls `GET /api/lab-movements?siteId=…&consumableId=…&movementType=…&fromDate=…&toDate=…` (mounted by `packages/api/src/routes/labInventory.ts`).
- The route reads the `lab_stock_movements` table — an **append-only** ledger. There is no UPDATE or DELETE endpoint on movements, only INSERT via `recordMovement()`. So the audit log is structurally tamper-evident: corrections are new `ADJUST` rows, not edits.
- `quantity_after` is recorded **on write**, not derived at read, so the log can be replayed to rebuild any lot's history without consulting `lab_inventory_lots`.
- Tenant scoping: lab users see only their `labGroupId`'s sites; admins see everything.
- The page uses `LabAuditLogPage` (`packages/web/src/features/labs/pages/LabAuditLog.tsx`) which auto-refreshes on every filter change via a React effect on `[siteId, consumableId, movementType, range]`.

---

## Verification

1. After exporting, open the CSV — row count should match the table's pagination footer ("Total N").
2. Pick a single `ISSUE` row, note the lot UUID prefix, then go to **`/labs/inventory`** → **All lots** → search by lot. The lot's current on-hand should equal `quantity_after` for the **most recent** movement against it.
3. For a `TRANSFER_OUT` row, search for the same `relatedTransferId` — you should find exactly one paired `TRANSFER_IN` at the destination site.
4. For a row with the `Lab` chip, the lab order in question should still exist at **`/labs/orders/<orderNumber>`**.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Table shows **No movements in this window** | Filters are too narrow, or the site truly had no activity | Widen the date range first, then drop the consumable / type filter. If still empty, the site has no lots yet — start with [Workflow 19](./19-receive-lab-shipment.md). |
| Inspector wants every consumption tied to **one specific lab order** | The UI doesn't expose a `relatedLabOrderId` filter | Power users can hit the API directly: `GET /api/lab-movements?relatedLabOrderId=<labOrderId>`. The CSV-export trick still works — paste the JSON into a spreadsheet. A first-class filter is planned but not yet shipped. |
| **Export CSV** button is disabled | Table is empty | Widen filters until rows appear. |
| `Qty` column is `0` on a row | Expected for the `TRANSFER_IN` paired marker — see [auto-consumption feature doc](../features/30-lab-auto-consumption.md) for the rationale | Find the matching `TRANSFER_OUT` row via the `relatedTransferId` chip to see the actual moved quantity. |
| Two `ADJUST` rows on the same lot moments apart | Cycle-count correction followed by an immediate offsetting entry — no bug | Check the **Reason** column for both rows; together they should net to the intended delta. |
| `Type` shows **EXPIRE** but the lot still appears active at `/labs/inventory` | The `EXPIRE` movement was inserted but the lot status flip is from the same cron pass — refresh the inventory page | If still inconsistent, file an admin ticket — this would be a real data integrity bug, not a UI glitch. |

---

## Related

- Feature reference: [`features/30-lab-auto-consumption.md`](../features/30-lab-auto-consumption.md), [`features/27-lab-inventory.md`](../features/27-lab-inventory.md), [`features/28-lab-forecasting.md`](../features/28-lab-forecasting.md)
- Adjacent workflows: [`19-receive-lab-shipment.md`](./19-receive-lab-shipment.md), [`20-set-up-test-consumable-map.md`](./20-set-up-test-consumable-map.md)
- Lab persona walkthrough: [`personas/lab.md`](../personas/lab.md)

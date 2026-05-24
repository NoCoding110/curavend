# Workflow 20 — Set Up a Test → Consumable Recipe

## At a glance

| | |
|---|---|
| **What** | Tell Curavend which consumables (and how much of each) get used every time a given lab test is run. The map powers the demand forecast and the nightly auto-replenishment cron — without recipes, the model has no signal and inventory never auto-orders. |
| **Persona** | Lab admin (`LAB_ACCOUNT_MANAGER` or `LAB_ACCOUNT_MANAGER_USER`). Admins can also edit. |
| **Prerequisites** | The consumables you want to map must already exist in the `lab_consumables` catalog (add via **`/labs/inventory` → Add item**). The test code you want to map should exist in your lab order history or LIS test catalog. |
| **Estimated time** | 1-2 minutes per test (≈ 30 seconds per consumable). |

---

## Steps

### A — Open the recipe editor

1. From the sidebar pick **Labs** → **Test Recipes** (route **`/labs/test-mappings`**).
2. The page opens with a two-pane layout: tests on the left, the selected test's consumable rows on the right.

   ![Step 2](../images/wf-test-consumable-map-step-2.png)

### B — Pick or add a test

3. Browse the left pane. Each card shows the test code, description, row count, and a 🛈 red flag if any consumable in that recipe is marked **Critical**.
4. To map an existing test, **click the card** (e.g. `87502 — Influenza A/B & RSV PCR panel`). The right pane reloads with the recipe rows for that test.
5. To map a brand-new test that has no rows yet, click **+ New test** in the left-pane header and enter:
   - **Test code** — the CPT, internal LIS code, or LOINC (e.g. `87502`).
   - **Test description** — human-readable label.

### C — Add the first consumable

6. With the test selected, click **Add consumable** in the right-pane header. A modal opens.
7. Fill in:
   - **Consumable** — searchable dropdown of the active `lab_consumables` catalog. Pick `seed-swab-np — NP swab, sterile, rayon tip`.
   - **Quantity per test** — `1` (one swab per test run).
   - **Critical** — toggle **on**. Critical means a stock-out blocks the test from running. The flag surfaces on the test card and in future will gate auto-replen urgency.
   - **Notes** — optional (e.g. *"Use blue-cap variant only — pink causes inhibition"*).
8. Click **Save**. A row appears in the right-pane table.

### D — Add a second consumable (different UOM)

9. Click **Add consumable** again.
10. Fill in:
    - **Consumable** — `pcr-mix-flu — Flu A/B + RSV PCR mastermix`.
    - **Quantity per test** — `0.025` (25 µL per test; the catalog row for `pcr-mix-flu` has `usage_uom = mL` and on-hand is tracked in mL).
    - **Critical** — toggle **on**.
    - **Notes** — *"Aliquot from frozen vial within 4h of test run"*.
11. Click **Save**. The recipe now has two rows.

🛈 *Why fractional quantities?* `quantityPerTest` is a float. A 96-well PCR plate that runs 88 samples + 8 controls would map to `1 / 88 = 0.0114` plates-per-test. The forecast multiplies by the trailing test count regardless of fractional weirdness — you only need to make sure the UOM on the consumable matches the units you express here.

### E — Verify the forecast picks up consumption

12. Run a lab order or two against the test (or wait — `lab_orders` is the consumption signal).
13. Open **`/labs/inventory`** → **Reorder needed** tab. After a few days of `87502` runs at typical volume, `seed-swab-np` and `pcr-mix-flu` should appear in the reorder list when their on-hand drops near `reorderPoint`.
14. To check the math directly, hit `GET /api/lab-inventory/forecast?siteId=<your site>` (you can use the **Network** tab from the Reorder Needed page). You should see rows like:
    ```
    { consumableId: "…seed-swab-np…", testsInPeriod: 240, consumedInPeriod: 240,
      avgDailyConsumption: 4.0, projected30Day: 120, currentOnHand: 200,
      daysOfSupply: 50, reorderPoint: 250, suggestedOrderQty: 800 }
    ```

---

## What happens behind the scenes

- **Save** posts to `POST /api/lab-inventory/test-consumables` with `{ testCode, consumableId, quantityPerTest, isCritical, notes }`. The row is inserted into `lab_test_consumables`.
- The `(testCode, consumableId, labGroupId)` triple is `UNIQUE` — trying to add the same consumable to the same test twice returns `409 Conflict`. Delete the existing row first.
- `forecastDemand()` reads three tables on every call:
  1. `lab_orders` filtered to the last 60 days → builds `testCount(testCode, siteId)`.
  2. `lab_test_consumables` → joins consumption by `testCode`.
  3. `lab_inventory_lots` (status = `ACTIVE`) → aggregates on-hand by `(consumableId, siteId)`.
- The nightly auto-replen cron (`handleLabAutoReplenishment`) doesn't read the recipe map directly — it uses `getReorderCandidates()` which only cares about on-hand vs. `reorderPoint`. The recipe map indirectly drives reorder triggers by letting on-hand actually decline as tests are issued.
- See [Lab Forecasting + Auto-Replenishment](../features/28-lab-forecasting.md) for the full math.

---

## Verification

1. **Recipe persists** — reload `/labs/test-mappings`, click the same test, both consumable rows are still there.
2. **Test card flag** — back in the left pane, the test card shows the red ⚠ Critical flag (since you marked both rows critical).
3. **Forecast endpoint** returns non-zero `testsInPeriod` and `consumedInPeriod` for the mapped consumables once `lab_orders` rows exist.
4. **Stock summary tab** in `/labs/inventory` — the mapped consumables show a non-zero `daysOfSupply` value (visible in the days-to-oldest-expiration column tooltip, and via the forecast endpoint).
5. **Reorder Needed tab** populates the next time on-hand drops below `reorderPoint` (driven by actual test runs + FEFO issuance).
6. **Approval queue** — the morning after the auto-replen cron runs, the assigned approver sees a new requisition titled `Auto-replen YYYY-MM-DD [<hospital-prefix>…]` in their [Approvals queue](../features/05-approvals.md). The justification on each item line references the on-hand vs. reorder-point math.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Consumable dropdown is empty | No active rows in `lab_consumables` | Add catalog items first at **`/labs/inventory` → Add item**. |
| `409 Conflict — Mapping already exists` | The (testCode, consumableId) pair is already mapped | Find the existing row and edit / delete it; you cannot add a duplicate. |
| `quantityPerTest required` validation error | Field left blank or non-numeric | Even fractional values are fine (`0.025`), but `0` and empty are rejected. |
| Forecast returns `testsInPeriod = 0` for a mapped test | No `lab_orders` rows in the last 60 days for that test code, OR `testCode` mismatch (e.g. you mapped `87502` but the EHR feed sends `87502QW`) | Check the actual test codes in `lab_orders` — the match is case-sensitive exact string. |
| Auto-replen cron never fires for a mapped consumable | On-hand is still above `reorder_point`, OR `reorder_point` is `NULL` in the catalog | Set `reorderPoint` on the catalog row via **Item master** tab → edit. Without it, the item is never a reorder candidate. |
| Suggested order qty looks tiny | `maxThreshold` is too close to `reorderPoint`, or `reorderQuantity` is unset | Edit the catalog row. Target = `maxThreshold ?? reorderPoint × 2`. |
| Recipe edited but forecast didn't change | `forecastDemand()` is computed live on every call — no cache. If you don't see a change, the test code probably has zero matching `lab_orders` rows in the trailing 60 days. | Hit the forecast endpoint and inspect `testsInPeriod` for the consumable. |
| Auto-generated requisition has no approver assigned | No approval rule matched the `(REQUISITION, hospitalId, amountUsd, containsOffFormulary=true)` tuple | Set a fallback approver via [Set up approval rules](./06-set-up-approval-rules.md). Auto-replen requisitions land in the `SUBMITTED` queue regardless and an admin can hand-route them. |
| Same consumable maps to multiple tests (e.g. NP swabs used by both `87502` and `87635`) | This is expected and correct | The forecast sums consumption across all mapped tests. Just add the swab to each test's recipe. |

---

## Worked example — what to map for a 96-well COVID PCR plate

When the lab runs the SARS-CoV-2 PCR (`87635`) test, the typical per-test consumption is:

| Consumable | Qty per test | Critical? |
|---|---|---|
| NP swab (`seed-swab-np`) | 1 | yes |
| PCR mastermix (`pcr-mix-sars`) | 0.020 mL | yes |
| 96-well plate (`plate-96-pcr`) | `1/88 = 0.0114` | yes |
| Sealing film (`film-pcr-seal`) | `1/88 = 0.0114` | no |
| 10 µL filter tip (`tip-10ul-filter`) | 2 | yes |

Add all five rows under the `87635` test. Forecast accuracy depends on this kind of granular mapping — skip the filter tips and you'll mysteriously run out of them mid-week with no auto-replen ever firing.

---

## Related

- Feature reference: [`features/28-lab-forecasting.md`](../features/28-lab-forecasting.md), [`features/27-lab-inventory.md`](../features/27-lab-inventory.md)
- Adjacent workflows: [`19-receive-lab-shipment.md`](./19-receive-lab-shipment.md), [`11-onboard-a-lab.md`](./11-onboard-a-lab.md), [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md) (so the auto-generated requisition routes to the right approver)
- Personas: [Lab](../personas/lab.md)

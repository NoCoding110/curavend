# Workflow 16 — Create a DME Order End-to-End

## At a glance

| | |
|---|---|
| **What** | Take a hospital admin from "patient needs a CPAP" through to "order created, docs materialized, PA auto-submitted if required" using the 6-step DME wizard. |
| **Persona** | Hospital intake staff or discharge planner (`FACILITY_ACCOUNT_MANAGER_USER` with `orders: WRITE`). Provider portal users can also run this. |
| **Prerequisites** | Patient demographics in hand. The prescribing physician's NPI. A payor + member ID. At least one HCPC code (e.g. CPAP `E0601`). |
| **Estimated time** | 5-7 minutes per order. |

---

## Steps

### A — Open the wizard

1. From the sidebar pick **New DME Order** under **Procurement** → route `/create-dme-order`. The Ant Steps strip shows six numbered stops with the first one active.

   ![Step 1](../images/wf-create-dme-order-step-1.png)

   🛈 **Why a wizard, not the regular New Order page?** DME claims need a fixed minimum data set. The wizard refuses to advance until each step is valid, so an off-coverage code or missing F2F date is caught at minute one.

### B — Step 1: Patient + DME intake

2. Fill **Patient name / DOB / MRN**. If the patient already exists in another order, you can pick from the typeahead.
3. **Care setting** — pick `HOME`, `SNF`, `HOSPICE`, or `OTHER`. This drives the LCD `SETTING` criterion in step 2.
4. **Mobility status** (`AMBULATORY` / `WHEELCHAIR` / `BEDBOUND`) — required for PMD / hospital-bed LCDs.
5. **Height + weight** — required for bariatric beds and some PMD LCDs.
6. **Length of need (months)** — typically 99 for permanent need (the maximum CMS recognizes).
7. **Face-to-face evaluation date** — must be ≤ 6 months ago for PMD, hospital beds, and other items that require an F2F encounter.
8. **Clinical indication** (free text) — what's printed on the DWO under "Reason for the item". Click **Next**.

### C — Step 2: Diagnosis + HCPC

9. Add at least one **ICD-10 diagnosis code** (typeahead).
10. Add at least one **HCPC line** (typeahead — e.g. `E0601` for CPAP). On blur, three lookups fire in parallel:
    - **LCD check** → green `MEETS` / red `DOES_NOT_MEET` / orange `NEEDS_CLINICAL_REVIEW` / gray `UNKNOWN` badge.
    - **CMS PA list** → purple **CMS PA required — will auto-create** badge if the code is on the list.
    - **Formulary** → `ON_FORMULARY` / `OFF_FORMULARY` / `RESTRICTED` badge with substitute suggestions.

    ![Step 10](../images/wf-create-dme-order-step-10.png)

11. **Read the badges before clicking Next**. If you see `DOES_NOT_MEET`, expand the row to see which LCD criterion was contradicted (e.g. excluded diagnosis present). You can either change the order or accept the denial risk. The wizard does NOT block you on `DOES_NOT_MEET` — it warns.

### D — Step 3: Document preview

12. The packet checklist is rendered read-only — it's what the order will materialize after finalization. Glance at it so you know what you'll need to collect later (Face-to-Face note, sleep study, etc. depending on HCPC).

   See [DME Document Packet](../features/22-dme-document-packet.md) for the full list of doc types.

### E — Step 4: Eligibility

13. Pick a **Payor** from the dropdown. List comes from the [Payors & Eligibility](../features/12-payors-eligibility.md) admin catalog.
14. Enter the patient's **Member ID** and **Group ID** (if any).
15. Click **Run eligibility check**. The 270/271 stub returns active / inactive + copay + deductible.

   ![Step 15](../images/wf-create-dme-order-step-15.png)

   🛈 The current eligibility check is a deterministic stub (hash of member ID → response). Real X12 270/271 plug-in is on the roadmap.

### F — Step 5: PA review

16. Every HCPC line flagged in step 2 as PA-required (CMS list, payor contract, or formulary) is listed here. Add a **clinical note** the auto-PA should carry. Click **Next**.

### G — Step 6: Supplier picker

17. The picker lists vendors who carry the HCPCs you ordered. A green **DMEPOS-accredited** badge appears next to vendors with current accreditation in [`vendor_dmepos_compliance`](../features/26-dmepos-compliance.md).
18. Pick a vendor and click **Finalize**.

   ![Step 18](../images/wf-create-dme-order-step-18.png)

---

## What happens behind the scenes

The Finalize button fires four backend calls in sequence:

1. **`POST /api/orders`** — creates the order row with `orderNumber`, lines, payor, supplier.
2. **`POST /api/dme-documents/extension/:orderId`** — upserts the `dme_order_extensions` sidecar with all the wizard's clinical fields (LON, mobility, F2F date, clinical indication, `cms_pa_required` flag).
3. **`POST /api/dme-documents/materialize/:orderId`** — looks at every line's HCPC × payor kind, resolves the [document requirements](../features/22-dme-document-packet.md), and inserts a `MISSING` row per required doc type.
4. **`POST /api/prior-auths`** (only if any line is PA-flagged) — creates one `prior_auths` row per flagged line in state `NEEDED`, pre-filled with patient / payor / HCPC / ICD-10 / clinical note.

You're then navigated to `/supply-orders/:id`. The new **DME Document Packet** section is visible, and a banner shows *"Prior authorization auto-created — go review"* if a PA was spawned.

---

## Verification

1. The order list at `/supply-orders` shows the new order at the top with status `PENDING` and a small DME tag.
2. The order detail page shows the **DME Document Packet** section with N rows in `MISSING` state.
3. If a PA was spawned, the **Prior Auths** page at `/prior-auths` lists it in state `NEEDED`.
4. The `dme_order_extensions` row exists: `SELECT * FROM dme_order_extensions WHERE order_id = …` returns one row.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Next button greyed out on Step 2** | At least one HCPC line is missing or invalid | Click into the offending row; HCPC must be in `hcpc_codes` table. |
| **LCD badge stays gray (`UNKNOWN`)** | No LCD seeded for that HCPC | This is informational only — order can still proceed. Admin can ingest the LCD via `/admin/lcd-ingest`. |
| **Eligibility check returns "inactive"** | Member ID format mismatch or payor stub miss | Double-check member ID. The 270/271 stub is deterministic — same member ID always returns same answer. |
| **No DMEPOS badge on any supplier** | None of the vendors have a `vendor_dmepos_compliance` row | Admin needs to populate the [DMEPOS compliance tracker](../features/26-dmepos-compliance.md). You can still pick a non-badged supplier. |
| **Finalize fails with 500** | Usually a missing `prescriber.npi` on the order's clinical contact (auto-PA needs it) | Edit the order's clinical contact and retry from the wizard. |
| **PA didn't auto-create when expected** | The HCPC isn't on the CMS PA list AND the payor contract doesn't have `requires_prior_auth=1` | Confirm `GET /api/lcd/pa-required` includes the code. Manually create the PA from the order detail page. |

---

## Related

- Feature reference: [`features/21-dme-order-wizard.md`](../features/21-dme-order-wizard.md), [`features/22-dme-document-packet.md`](../features/22-dme-document-packet.md), [`features/23-lcd-coverage-checker.md`](../features/23-lcd-coverage-checker.md), [`features/24-cms-pa-required-list.md`](../features/24-cms-pa-required-list.md), [`features/26-dmepos-compliance.md`](../features/26-dmepos-compliance.md)
- Adjacent workflows: [`17-upload-dme-document-packet.md`](./17-upload-dme-document-packet.md), [`18-generate-dme-claim-bundle.md`](./18-generate-dme-claim-bundle.md), [`08-process-prior-authorization.md`](./08-process-prior-authorization.md)
- Persona: [`personas/hospital.md`](../personas/hospital.md)

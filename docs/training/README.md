# Curavend Training Center

Welcome to the Curavend training documentation. Curavend is a multi-tenant healthcare supply-chain platform connecting **hospitals**, **vendors** (DME, orthotics, biologics, wound care), **labs**, and **providers** on a single cloud-native ordering, contracting, and analytics stack.

This documentation is organized in three layers so you can find what you need quickly:

| If you want to… | Go to |
|---|---|
| **Get oriented as a new user in your role** | [Persona Quick-Starts](#1-persona-quick-starts) |
| **Look up how a specific feature works** | [Feature Reference](#2-feature-reference) |
| **Follow a step-by-step recipe for a task** | [Workflow Recipes](#3-workflow-recipes) |

> **In-app help center.** The same docs are available inside the app at **`/help-center`** (look in the avatar dropdown).
>
> **Printable PDFs.** Role-specific PDFs are generated from these MD files — see [Building PDFs](#building-pdfs).

---

## 1. Persona Quick-Starts

Each guide is ~10 minutes of reading and covers only the menus and actions that persona uses day-to-day.

| Persona | Who it's for | Guide |
|---|---|---|
| **Hospital** | Hospital admins, supply chain staff, materials managers | [`personas/hospital.md`](./personas/hospital.md) |
| **Vendor** | DME/orthotics/biologics/wound-care vendor account managers | [`personas/vendor.md`](./personas/vendor.md) |
| **Lab** | Lab account managers and CSRs running test kits | [`personas/lab.md`](./personas/lab.md) |
| **Provider** | Physicians, clinicians, prescribers | [`personas/provider.md`](./personas/provider.md) |
| **Super-Vendor** | Aggregator vendors that contract under multiple sub-vendor accounts | [`personas/super-vendor.md`](./personas/super-vendor.md) |
| **Admin** | Curavend platform administrators (Account Manager, Account Manager User) | [`personas/admin.md`](./personas/admin.md) |

---

## 2. Feature Reference

Every feature area, every page, every button. Use the sidebar or `Ctrl+F` to navigate.

### Day-to-day operations

| Feature | What it does | Doc |
|---|---|---|
| Dashboard | KPI summary, recent orders, procurement KPIs | [`features/01-dashboard.md`](./features/01-dashboard.md) |
| Orders | The 8-step order sub-status state machine | [`features/02-orders.md`](./features/02-orders.md) |
| Requisitions | Enterprise pre-order requests that route through approval | [`features/03-requisitions.md`](./features/03-requisitions.md) |
| Formulary / Item Master | Per-facility approved-item whitelist with substitutes | [`features/04-formulary.md`](./features/04-formulary.md) |
| Approvals queue | Items awaiting your decision | [`features/05-approvals.md`](./features/05-approvals.md) |
| Prior Authorizations | 7-state PA workflow per payor | [`features/06-prior-auths.md`](./features/06-prior-auths.md) |
| Goods Receipts | What physically arrived against each order | [`features/07-goods-receipts.md`](./features/07-goods-receipts.md) |
| 3-Way Matching | PO + Receipt + Invoice reconciliation | [`features/08-three-way-match.md`](./features/08-three-way-match.md) |
| Invoices | Vendor invoicing, payment, posting | [`features/09-invoices.md`](./features/09-invoices.md) |

### Pricing & contracts

| Feature | What it does | Doc |
|---|---|---|
| Contracts & Pricing | Bilateral contracts with fee schedules | [`features/10-contracts-pricing.md`](./features/10-contracts-pricing.md) |
| GPO Contracts | Group Purchasing Organization rate tables | [`features/11-gpo-contracts.md`](./features/11-gpo-contracts.md) |
| Payors & Eligibility | Payor contracts + 270/271 eligibility checks | [`features/12-payors-eligibility.md`](./features/12-payors-eligibility.md) |

### Analytics

| Feature | What it does | Doc |
|---|---|---|
| Demand Forecasting | Trailing-12-month demand model | [`features/13-forecasting.md`](./features/13-forecasting.md) |
| Multi-Site Spend | Cross-facility spend rollups | [`features/14-multi-site-spend.md`](./features/14-multi-site-spend.md) |
| Contract Leakage | Invoice lines paid above the best-available rate | [`features/15-contract-leakage.md`](./features/15-contract-leakage.md) |
| Vendor Scorecard | On-time, QC pass, response time, compliance | [`features/17-vendor-scorecard.md`](./features/17-vendor-scorecard.md) |

### Integrations & administration

| Feature | What it does | Doc |
|---|---|---|
| EHR Connections | Multi-EHR FHIR adapter (Epic, Cerner, Athena, Meditech, eCW, Allscripts) | [`features/16-ehr-connections.md`](./features/16-ehr-connections.md) |
| User Management | Create / suspend / role-change users | [`features/18-user-management.md`](./features/18-user-management.md) |
| Groups & Permissions | Permission bundling and group-based access | [`features/19-permissions-groups.md`](./features/19-permissions-groups.md) |
| Notifications | In-app, email, SMS preferences | [`features/20-notifications.md`](./features/20-notifications.md) |

### DME Ordering

| Feature | What it does | Doc |
|---|---|---|
| DME Order Wizard | 6-step intake wizard at `/create-dme-order` with LCD + PA + formulary checks | [`features/21-dme-order-wizard.md`](./features/21-dme-order-wizard.md) |
| DME Document Packet | Per-order required-document checklist with upload / attest / reject | [`features/22-dme-document-packet.md`](./features/22-dme-document-packet.md) |
| LCD Coverage Checker | Evaluates HCPC × ICD-10 × setting × docs against Medicare LCDs | [`features/23-lcd-coverage-checker.md`](./features/23-lcd-coverage-checker.md) |
| CMS PA-Required List | Auto-creates prior auths for HCPCs on CMS's required-PA list | [`features/24-cms-pa-required-list.md`](./features/24-cms-pa-required-list.md) |
| DWO + Claim Bundle | Generates CMS-compliant DWO PDF and merged claim bundle | [`features/25-dwo-claim-bundle.md`](./features/25-dwo-claim-bundle.md) |
| DMEPOS Compliance | Vendor NSC/PTAN/NPI/accreditation/surety-bond tracker | [`features/26-dmepos-compliance.md`](./features/26-dmepos-compliance.md) |

### Lab Operations

| Feature | What it does | Doc |
|---|---|---|
| Lab Inventory | Per-site, per-lot stock with FEFO issuance, expiry sweep, and quarantine/recall | [`features/27-lab-inventory.md`](./features/27-lab-inventory.md) |
| Lab Forecasting + Auto-Replen | 60→30 day demand model + nightly cron that auto-creates requisitions | [`features/28-lab-forecasting.md`](./features/28-lab-forecasting.md) |
| Order Backorders | Auto-spawned tracker for under-delivered order lines, with partial fills | [`features/29-backorders.md`](./features/29-backorders.md) |
| Lab Auto-Consumption | FEFO auto-decrement of mapped consumables when a lab order is created | [`features/30-lab-auto-consumption.md`](./features/30-lab-auto-consumption.md) |

### Procurement Finance

| Feature | What it does | Doc |
|---|---|---|
| Hospital Budgets | Period × department/cost-center budgets with COMMIT/RELEASE/CONSUME encumbrance | [`features/31-hospital-budgets.md`](./features/31-hospital-budgets.md) |
| PO Transmission | 5-adapter PO delivery (EDI / API / cXML / email / portal) with state machine, retries, audit log | [`features/32-po-transmission.md`](./features/32-po-transmission.md) |
| Department Spend | Per-department burn-down dashboard with over-budget flags | [`features/33-department-spend.md`](./features/33-department-spend.md) |
| GL Ledger | Append-only journal that auto-posts on PO commit / GR receipt / invoice approve / invoice pay, with ERP CSV export | [`features/34-gl-ledger.md`](./features/34-gl-ledger.md) |
| Invoice Match Rules | ±% + ±$ tolerance bands for auto-resolving invoice-vs-PO variance, vendor-specific precedence | [`features/37-invoice-match-rules.md`](./features/37-invoice-match-rules.md) |

### Procurement v2

| Feature | What it does | Doc |
|---|---|---|
| Supplier Onboarding | 7-state machine for vendor intake with per-vendor doc checklist and auto-advance on receipt | [`features/35-supplier-onboarding.md`](./features/35-supplier-onboarding.md) |
| Returns (RMA Workflow) | 8-state vendor-returns flow, auto-spawned from DAMAGED/WRONG_ITEM goods receipts, expected vs actual credit | [`features/36-rma-workflow.md`](./features/36-rma-workflow.md) |
| Item Master Hygiene | Duplicates / missing-fields / vendor-unmapped reports for formulary cleanup | [`features/38-item-master-hygiene.md`](./features/38-item-master-hygiene.md) |
| Point-of-Use Capture | Bedside scan attribution with sticky encounter context and optional inventory decrement | [`features/39-point-of-use-capture.md`](./features/39-point-of-use-capture.md) |
| Cross-Site Inventory | Pivoted consumable × site matrix with OK/LOW/CRITICAL per-cell status | [`features/40-cross-site-inventory.md`](./features/40-cross-site-inventory.md) |
| Compliance Dashboard | Daily-cron pre-expiry alerts for vendor accreditation / license / insurance / lab lots with 60/30/7-day severity ladder | [`features/41-compliance-dashboard.md`](./features/41-compliance-dashboard.md) |
| Backorder Triage | Aging buckets (FRESH/WEEK/AGING/STALE) for open backorders with inline substitute suggestions | [`features/42-backorder-triage.md`](./features/42-backorder-triage.md) |
| Logistics & Cold Chain | Shipment ETA + temperature ingestion with sticky excursion flag and per-source provenance | [`features/43-logistics-cold-chain.md`](./features/43-logistics-cold-chain.md) |

### Procurement v3

| Feature | What it does | Doc |
|---|---|---|
| Emergency Purchasing | Requisition fast-lane that bypasses approvers + post-hoc review queue (`REVIEWED_OK` / `REVIEWED_FLAG`) | [`features/44-emergency-purchasing.md`](./features/44-emergency-purchasing.md) |
| Cross-Facility Inventory Transfers | Facility-to-facility stock moves with 5-state machine (REQUESTED → APPROVED → SHIPPED → RECEIVED) and tracking-number capture | [`features/45-inventory-transfers.md`](./features/45-inventory-transfers.md) |
| Recalls | FDA Class I/II/III recall intake with auto-scan of lab lots + POU events, auto-quarantine, 5 disposition codes | [`features/46-recalls.md`](./features/46-recalls.md) |
| Controlled Substance Log | Append-only DEA Schedule II–V chain-of-custody with 6 event types, Schedule II witness enforcement, running balance | [`features/47-controlled-substance-log.md`](./features/47-controlled-substance-log.md) |
| Substitution Audit Log | Per-context (ORDER_CREATE / BACKORDER / REQUISITION) record of every formulary swap, with approver gate for ad-hoc swaps | [`features/48-substitution-audit-log.md`](./features/48-substitution-audit-log.md) |
| Vendor Scorecard Snapshots | Monthly per-(vendor × hospital) metrics rollup (on-time / fill / defect / match / lead time), nightly cron + manual recompute | [`features/49-vendor-scorecard-snapshots.md`](./features/49-vendor-scorecard-snapshots.md) |
| Hospital Demand Forecast | 12-mo trailing avg × month-of-year seasonality projection, 7-day cached run, force recompute | [`features/50-hospital-demand-forecast.md`](./features/50-hospital-demand-forecast.md) |
| Charge Capture Leakage | POU events without matching invoice_item_id, $ leakage rollup with 3 charge states | [`features/51-charge-capture-leakage.md`](./features/51-charge-capture-leakage.md) |
| Price Variance | PO line bought price vs ACTIVE contract price, per-line delta + per-vendor rollup, > $0.01 threshold | [`features/52-price-variance.md`](./features/52-price-variance.md) |

---

## 3. Workflow Recipes

Step-by-step "how do I…" guides for common tasks.

| # | Recipe | Doc |
|---|---|---|
| 01 | Onboard a new vendor | [`workflows/01-onboard-a-vendor.md`](./workflows/01-onboard-a-vendor.md) |
| 02 | Create and submit a requisition | [`workflows/02-create-and-submit-requisition.md`](./workflows/02-create-and-submit-requisition.md) |
| 03 | Approve a requisition and convert it to orders | [`workflows/03-approve-requisition-and-convert.md`](./workflows/03-approve-requisition-and-convert.md) |
| 04 | Record a goods receipt for a delivered order | [`workflows/04-record-goods-receipt.md`](./workflows/04-record-goods-receipt.md) |
| 05 | Resolve a 3-way match exception | [`workflows/05-resolve-match-exception.md`](./workflows/05-resolve-match-exception.md) |
| 06 | Set up approval routing rules | [`workflows/06-set-up-approval-rules.md`](./workflows/06-set-up-approval-rules.md) |
| 07 | Build a formulary with substitutes | [`workflows/07-create-formulary-with-substitutes.md`](./workflows/07-create-formulary-with-substitutes.md) |
| 08 | Process a prior authorization | [`workflows/08-process-prior-authorization.md`](./workflows/08-process-prior-authorization.md) |
| 09 | Run a multi-site spend report | [`workflows/09-run-multi-site-spend-report.md`](./workflows/09-run-multi-site-spend-report.md) |
| 10 | Detect contract leakage | [`workflows/10-detect-contract-leakage.md`](./workflows/10-detect-contract-leakage.md) |
| 11 | Onboard a new lab | [`workflows/11-onboard-a-lab.md`](./workflows/11-onboard-a-lab.md) |
| 12 | Onboard a new hospital | [`workflows/12-onboard-a-hospital.md`](./workflows/12-onboard-a-hospital.md) |
| 13 | Configure an EHR feed | [`workflows/13-configure-ehr-feed.md`](./workflows/13-configure-ehr-feed.md) |
| 14 | Grant a user fine-grained permissions | [`workflows/14-grant-user-permissions.md`](./workflows/14-grant-user-permissions.md) |
| 15 | Set up GPO membership for a hospital | [`workflows/15-set-up-gpo-membership.md`](./workflows/15-set-up-gpo-membership.md) |
| 16 | Create a DME order end-to-end (6-step wizard) | [`workflows/16-create-dme-order-end-to-end.md`](./workflows/16-create-dme-order-end-to-end.md) |
| 17 | Upload the DME document packet | [`workflows/17-upload-dme-document-packet.md`](./workflows/17-upload-dme-document-packet.md) |
| 18 | Generate a DME claim bundle | [`workflows/18-generate-dme-claim-bundle.md`](./workflows/18-generate-dme-claim-bundle.md) |
| 19 | Receive a lab shipment (auto-create inventory lots + backorders) | [`workflows/19-receive-lab-shipment.md`](./workflows/19-receive-lab-shipment.md) |
| 20 | Set up a test → consumable recipe | [`workflows/20-set-up-test-consumable-map.md`](./workflows/20-set-up-test-consumable-map.md) |
| 21 | Audit lab stock movements for compliance | [`workflows/21-audit-stock-movements.md`](./workflows/21-audit-stock-movements.md) |
| 22 | Handle a damaged shipment end-to-end (GR → RMA → credit) | [`workflows/22-handle-damaged-shipment.md`](./workflows/22-handle-damaged-shipment.md) |
| 23 | Handle an emergency purchase (fast-lane requisition → orders → review) | [`workflows/23-handle-emergency-purchase.md`](./workflows/23-handle-emergency-purchase.md) |

---

## Conventions used in this documentation

- **`Bold text`** in step lists is something you click, type, or look for in the UI.
- `monospace` is a literal value (code, URL, field name).
- 🛈 callout boxes explain *why* a thing is the way it is.
- ⚠ callout boxes warn about destructive or irreversible actions.
- Screenshots show the production app at https://curavend-web.pages.dev. UI may shift slightly version-to-version.

## Roles vs personas

The product's role names (used in the JWT and on database columns) sometimes differ from the human-friendly persona names used in this guide. Quick map:

| Persona | DB / JWT roles |
|---|---|
| Hospital | `FACILITY_ACCOUNT_MANAGER`, `FACILITY_ACCOUNT_MANAGER_USER` |
| Vendor | `VENDOR_ACCOUNT_MANAGER`, `VENDOR_ACCOUNT_MANAGER_USER` |
| Lab | `LAB_ACCOUNT_MANAGER`, `LAB_ACCOUNT_MANAGER_USER` |
| Provider | `PROVIDER_ACCOUNT_MANAGER`, `PROVIDER_ACCOUNT_MANAGER_USER` |
| Super-Vendor | `SUPER_VENDOR_ACCOUNT_MANAGER`, `SUPER_VENDOR_ACCOUNT_MANAGER_USER` |
| Admin | `ACCOUNT_MANAGER`, `ACCOUNT_MANAGER_USER` |

## Building PDFs

The `scripts/build-pdfs.mjs` script bundles each role's docs into a single PDF.

```bash
cd docs/training
node scripts/build-pdfs.mjs   # produces dist/curavend-{role}.pdf
```

PDFs are NOT checked into git. Run on demand and distribute.

## Capturing screenshots

Whenever the UI changes meaningfully, refresh the screenshots:

```bash
cd docs/training
node scripts/capture-screenshots.mjs
```

This logs into the deployed app with the seeded demo accounts and screenshots each page referenced in the docs.

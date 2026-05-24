# Hospital Quick-Start

> **For:** Hospital administrators, supply-chain analysts, materials managers, and central-supply staff
> **DB roles:** `FACILITY_ACCOUNT_MANAGER`, `FACILITY_ACCOUNT_MANAGER_USER`
> **Login:** https://curavend-web.pages.dev

## Introduction

As a **Hospital** user in Curavend you sit on the **buyer side** of every transaction. You browse contracted vendor catalogs, raise requisitions, route them through approval, convert them into purchase orders, receive the goods at your dock, reconcile invoices through 3-way matching, and analyze the spend across your facilities. This guide walks through the menu items you see, the dashboard you land on, and the day-to-day workflows that will fill 90% of your week.

![Hospital landing page](../images/hospital-dashboard.png)

---

## Your menu

When you sign in with a hospital account, the left sidebar shows the following items in order. Click any **Doc link** to jump to the deep-dive reference.

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Dashboard** | KPI tiles, recent orders, open approvals, spend snapshot | [features/01-dashboard.md](../features/01-dashboard.md) |
| **Orders** | The master list of all orders you've placed across every vendor | [features/02-orders.md](../features/02-orders.md) |
| **Approvals** | Items waiting for your decision (requisitions, POs, exceptions) | [features/05-approvals.md](../features/05-approvals.md) |
| **Prior Auths** | Payor-side authorizations attached to orders | [features/06-prior-auths.md](../features/06-prior-auths.md) |
| **Procurement → Requisitions** | Enterprise pre-order requests routed through approval | [features/03-requisitions.md](../features/03-requisitions.md) |
| **Procurement → Templates** | Reusable requisition templates for repeat carts | [features/03-requisitions.md#templates](../features/03-requisitions.md#templates) |
| **Procurement → Goods Receipts** | Record what physically arrived at your dock | [features/07-goods-receipts.md](../features/07-goods-receipts.md) |
| **Procurement → Match Exceptions** | Resolve PO/Receipt/Invoice mismatches | [features/08-three-way-match.md](../features/08-three-way-match.md) |
| **Invoices** | Vendor invoices waiting to be reviewed and paid | [features/09-invoices.md](../features/09-invoices.md) |
| **Contract & Pricing** | Your active bilateral contracts and fee schedules | [features/10-contracts-pricing.md](../features/10-contracts-pricing.md) |
| **Customer POs** | Your purchase orders organized by vendor | [features/02-orders.md#customer-pos](../features/02-orders.md#customer-pos) |
| **Recurring Orders** | Standing-order schedules for repeat consumables | [features/02-orders.md#recurring](../features/02-orders.md#recurring) |
| **Catalog** | Browse products from vendors you've contracted with | [features/04-formulary.md](../features/04-formulary.md) |
| **Price Lookup** | Find the best price for a HCPCS / SKU across your contracts | [features/10-contracts-pricing.md#price-lookup](../features/10-contracts-pricing.md#price-lookup) |
| **My Vendors** | Your approved-vendor list (facility-vendor links) | [features/19-permissions-groups.md#facility-vendors](../features/19-permissions-groups.md#facility-vendors) |
| **Vendor Coverage** | Coverage map: which vendor supplies which HCPCS in which region | [features/10-contracts-pricing.md#coverage](../features/10-contracts-pricing.md#coverage) |
| **Facilities** | Your hospital sites (campuses, satellite clinics) | [features/19-permissions-groups.md#facilities](../features/19-permissions-groups.md#facilities) |
| **Departments** | Cost centers / departments inside each facility | [features/19-permissions-groups.md#departments](../features/19-permissions-groups.md#departments) |
| **Physicians** | Prescribers attached to your facilities | [features/19-permissions-groups.md#physicians](../features/19-permissions-groups.md#physicians) |
| **Chat** | Direct messaging with vendor reps, providers, and Curavend support | [features/20-notifications.md#chat](../features/20-notifications.md#chat) |
| **Reporting** | 11 spend and KPI reports (see [Your dashboard](#your-dashboard) below) | [features/14-multi-site-spend.md](../features/14-multi-site-spend.md) |
| **Notification Settings** | In-app, email, and SMS preferences | [features/20-notifications.md](../features/20-notifications.md) |
| **Help & Support** | Open a ticket or chat with the Curavend team | — |
| **FAQ** | Frequently asked questions | — |

> 🛈 The **Procurement** group is collapsed by default. Click it to expand Requisitions, Templates, Goods Receipts, and Match Exceptions.

---

## Day-to-day workflows

The 7 things you'll do most often, each linked to a step-by-step recipe.

| # | What you're doing | Recipe |
|---|---|---|
| 1 | Create a requisition and submit it for approval | [workflows/02-create-and-submit-requisition.md](../workflows/02-create-and-submit-requisition.md) |
| 2 | Approve someone else's requisition and convert it to POs | [workflows/03-approve-requisition-and-convert.md](../workflows/03-approve-requisition-and-convert.md) |
| 3 | Record a goods receipt when product arrives at your dock | [workflows/04-record-goods-receipt.md](../workflows/04-record-goods-receipt.md) |
| 4 | Resolve a 3-way match exception on an invoice | [workflows/05-resolve-match-exception.md](../workflows/05-resolve-match-exception.md) |
| 5 | Build a per-facility formulary with substitute items | [workflows/07-create-formulary-with-substitutes.md](../workflows/07-create-formulary-with-substitutes.md) |
| 6 | Submit and track a prior authorization | [workflows/08-process-prior-authorization.md](../workflows/08-process-prior-authorization.md) |
| 7 | Run a multi-site spend report for your quarterly review | [workflows/09-run-multi-site-spend-report.md](../workflows/09-run-multi-site-spend-report.md) |

### Less-frequent but important tasks

- **Set up approval routing rules** — define $-threshold, department, and HCPCS-based routing. See [workflows/06-set-up-approval-rules.md](../workflows/06-set-up-approval-rules.md).
- **Onboard a new vendor** — invite a vendor, sign a contract, agree on a fee schedule. See [workflows/01-onboard-a-vendor.md](../workflows/01-onboard-a-vendor.md).
- **Detect contract leakage** — find invoice lines paid above your best contracted rate. See [workflows/10-detect-contract-leakage.md](../workflows/10-detect-contract-leakage.md).
- **Set up GPO membership** — apply your GPO rate table on top of vendor contracts. See [workflows/15-set-up-gpo-membership.md](../workflows/15-set-up-gpo-membership.md).

---

## Your dashboard

![Hospital dashboard tiles](../images/hospital-dashboard-tiles.png)

The dashboard you see at `/dashboard` is tuned for hospital users. It shows, top to bottom:

### Row 1 — Operational KPIs

- **Open Orders** — count + dollar value of orders that have not yet been delivered or invoiced
- **Awaiting Approval** — requisitions and POs sitting in your approval queue
- **Goods Receipts Due Today** — orders confirmed for delivery today
- **Match Exceptions** — PO/Receipt/Invoice mismatches needing your attention

### Row 2 — Spend at a glance

- **MTD Spend** vs same period last month
- **Top 5 Vendors this month** with $ and order-count bars
- **Top 5 HCPCS this month**
- **Contract Leakage $** — dollars paid above best-available rate this month

### Row 3 — Activity

- **Recent Orders** (last 10, click to drill in)
- **Recent Receipts** (last 10)
- **Recent Invoices** (last 10)

### Row 4 — Reporting shortcuts

Quick-launch tiles for the 11 reports under **Reporting**:

| Report | Use it to… |
|---|---|
| Spend by Vendor | Compare vendor spend over a period |
| Top 10 HCPC | Find your highest-volume HCPCS codes |
| Spend by Month | Trend total spend over time |
| Spend by Physician | Find prescribing outliers |
| Spend by Facility | Roll up across multi-site systems |
| Spend by Department | Roll up by cost center |
| Vendor KPIs | On-time delivery, fill rate, response time |
| Vendor Scorecard | The full balanced scorecard per vendor |
| Demand Forecast | Trailing-12-month order forecast per SKU |
| Multi-Site Spend | Cross-facility spend comparison |
| Contract Leakage | Lines paid above contracted rate |

> 🛈 Reporting filters all respect your facility scope — if you only have access to Facility A, you will only see Facility A data even when running multi-site reports.

---

## Permissions you have

### You CAN

- Create, submit, approve, and cancel **requisitions** for facilities you have access to
- Approve **purchase orders** up to your configured $-threshold (set under Admin → Approval Rules)
- Record **goods receipts** at your facilities
- Review and dispute **vendor invoices**; mark them paid (when integrated with your AP system the mark-paid step is automated)
- Manage your facility's **formulary** (add/remove approved items, define substitutes)
- Create and manage **facilities**, **departments**, and **physicians** under your hospital
- Add and remove **users** within your hospital (subject to having the Administer Users permission)
- Sign **contracts** with vendors that you have approved (visible under My Vendors)
- View all 11 **reports**; export to CSV/XLSX

### You CANNOT

- Change the **vendor catalog** — only the vendor owns their SKUs and prices
- See orders, invoices, or contracts belonging to other hospitals on the platform
- Create or edit **GPO contracts** — this is a platform-admin function
- Approve PA decisions on the payor's behalf — you can only submit and track PAs
- Edit the **Item Master** (HCPCS / canonical SKU dictionary) — that's admin-only
- Access **Platform Management** items (Manage Vendors, Manage Hospitals, EHR Connections, Workflows, etc.) — admin-only

### Permission groups

Within your hospital, your Account Manager can assign you to one or more permission groups:

- **Buyer** — create requisitions, place orders
- **Approver** — approve up to $X, scoped to a facility or department
- **Receiver** — record goods receipts only
- **AP Clerk** — review invoices, mark paid
- **Analyst** — read-only reporting access
- **Administrator** — full hospital-side admin

See [features/19-permissions-groups.md](../features/19-permissions-groups.md) for the full permission matrix.

---

## Where to get help

| If you need to… | Look at |
|---|---|
| Understand a specific feature | [features/](../features/) — start with [01-dashboard.md](../features/01-dashboard.md) and follow links |
| Follow a step-by-step recipe | [workflows/](../workflows/) — pick the recipe that matches your task |
| Understand the order lifecycle | [features/02-orders.md](../features/02-orders.md) — covers the 8-step sub-status state machine |
| Understand 3-way matching | [features/08-three-way-match.md](../features/08-three-way-match.md) |
| Configure notifications | [features/20-notifications.md](../features/20-notifications.md) |
| Open a support ticket | **Help & Support** in the sidebar, or chat the **Curavend Support** account from `/chat` |

### Common gotchas

- **"Why can't I see a vendor in the catalog?"** — You need an active facility-vendor link AND an active contract. Check **My Vendors** and **Contract & Pricing**.
- **"Why is my order stuck in PENDING_APPROVAL?"** — Someone on the approval chain needs to act. Check **Approvals**, or have an Administrator review your approval rules under Admin → Approval Rules.
- **"Why doesn't the invoice match the PO?"** — That's the whole point of **Match Exceptions**. Open the exception, see the side-by-side, and either approve the variance or send the invoice back to the vendor.
- **"Where did the order go after the receipt?"** — Receipt → Invoice → 3-way match → Posted. Track from the order detail page.

### In-app help

Inside the app, click your avatar in the top-right and choose **Help Center**. The same docs live there with quick-jump search.

---

*Next up:* If you administer your hospital's Curavend tenant, also read [`admin.md`](./admin.md) for an overview of platform-admin functions you may need to request from Curavend support.

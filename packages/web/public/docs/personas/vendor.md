# Vendor Quick-Start

> **For:** DME, orthotics, biologics, and wound-care vendor account managers and CSRs
> **DB roles:** `VENDOR_ACCOUNT_MANAGER`, `VENDOR_ACCOUNT_MANAGER_USER`
> **Login:** https://curavend-web.pages.dev

## Introduction

As a **Vendor** user in Curavend you sit on the **seller side** of every transaction. You publish your SKU catalog, push real-time stock feeds from your warehouse, receive purchase orders from contracted hospitals, fulfill and ship them, generate invoices, and monitor your scorecard. You also manage warehouses, fitting centers, consignment closets at hospital sites, and the connectors that sync Curavend with your ERP. This guide walks through everything you see in the sidebar and the workflows that drive your day.

![Vendor landing page](../images/vendor-dashboard.png)

---

## Your menu

When you sign in with a vendor account, the left sidebar shows the following items in order.

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Dashboard** | KPI tiles, incoming orders, fulfillment queue, scorecard snapshot | [features/01-dashboard.md](../features/01-dashboard.md) |
| **Orders** | All orders placed against you across every hospital | [features/02-orders.md](../features/02-orders.md) |
| **Approvals** | Items awaiting your decision (price-change requests, returns, escalations) | [features/05-approvals.md](../features/05-approvals.md) |
| **Procurement → Goods Receipts** | Receipts that hospitals have recorded against your shipments | [features/07-goods-receipts.md](../features/07-goods-receipts.md) |
| **Invoices** | Invoices you've sent and their payment status | [features/09-invoices.md](../features/09-invoices.md) |
| **Inventory** | Master inventory across all your locations | [features/02-orders.md#inventory](../features/02-orders.md#inventory) |
| **Contract & Pricing** | Your bilateral contracts with hospitals and the fee schedules attached | [features/10-contracts-pricing.md](../features/10-contracts-pricing.md) |
| **Recurring Orders** | Standing-order schedules customers have set up with you | [features/02-orders.md#recurring](../features/02-orders.md#recurring) |
| **Catalog** | Browse your own catalog the way a hospital sees it | [features/04-formulary.md](../features/04-formulary.md) |
| **Price Lookup** | Look up your published rate for any SKU/HCPCS for any customer | [features/10-contracts-pricing.md#price-lookup](../features/10-contracts-pricing.md#price-lookup) |
| **Bulk Tracking** | Bulk-edit tracking numbers and ship-confirm many orders at once | [features/02-orders.md#bulk-tracking](../features/02-orders.md#bulk-tracking) |
| **SKU Groups** | Group SKUs into kits, bundles, families | [features/04-formulary.md#sku-groups](../features/04-formulary.md#sku-groups) |
| **Purchase Orders** | Your back-to-back POs to your own suppliers | [features/02-orders.md#purchase-orders](../features/02-orders.md#purchase-orders) |
| **Consignment** | Closets stocked at hospital locations on consignment | [features/02-orders.md#consignment](../features/02-orders.md#consignment) |
| **My Hospitals** | Hospitals you have an active facility-vendor link with | [features/19-permissions-groups.md#facility-vendors](../features/19-permissions-groups.md#facility-vendors) |
| **Locations** | Your warehouses, fitting centers, branches | [features/19-permissions-groups.md#vendor-locations](../features/19-permissions-groups.md#vendor-locations) |
| **SKU Catalog** | The master catalog of items you sell (with pricing tiers) | [features/04-formulary.md#vendor-catalog](../features/04-formulary.md#vendor-catalog) |
| **Stock Feeds** | Inbound feeds (CSV, EDI, API) updating real-time inventory | [features/16-ehr-connections.md#stock-feeds](../features/16-ehr-connections.md#stock-feeds) |
| **ERP Connectors** | Outbound connectors to your ERP (NetSuite, SAP, Brightree, etc.) | [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors) |
| **Chat** | Direct messaging with hospital buyers and providers | [features/20-notifications.md#chat](../features/20-notifications.md#chat) |
| **Reporting** | Vendor-side KPI and scorecard reports | [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md) |
| **Notification Settings** | In-app, email, SMS preferences | [features/20-notifications.md](../features/20-notifications.md) |
| **Help & Support** | Open a ticket or chat with the Curavend team | — |
| **FAQ** | Frequently asked questions | — |

> 🛈 If you're a **Super-Vendor** that aggregates multiple downstream vendor accounts, see the [`super-vendor.md`](./super-vendor.md) guide — your menu is similar but adds aggregation views.

---

## Day-to-day workflows

The 7 things you'll do most often.

| # | What you're doing | Recipe |
|---|---|---|
| 1 | Get a new hospital customer onboarded against you | [workflows/01-onboard-a-vendor.md](../workflows/01-onboard-a-vendor.md) |
| 2 | Process an inbound order: confirm, pick, ship, invoice | [features/02-orders.md#order-lifecycle](../features/02-orders.md#order-lifecycle) |
| 3 | Bulk-update tracking numbers for the day's outgoing shipments | [features/02-orders.md#bulk-tracking](../features/02-orders.md#bulk-tracking) |
| 4 | Update your SKU catalog (add items, change prices) | [features/04-formulary.md#vendor-catalog](../features/04-formulary.md#vendor-catalog) |
| 5 | Set up or refresh a stock feed from your warehouse | [features/16-ehr-connections.md#stock-feeds](../features/16-ehr-connections.md#stock-feeds) |
| 6 | Issue an invoice and watch for 3-way match exceptions | [features/09-invoices.md](../features/09-invoices.md) |
| 7 | Review your vendor scorecard and KPI report | [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md) |

### Less-frequent but important tasks

- **Configure an ERP connector** — push orders and pull invoices to/from NetSuite, SAP, Brightree, etc. See [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors).
- **Set up a consignment closet** at a hospital location — manage par levels, usage scans, replenishment orders. See [features/02-orders.md#consignment](../features/02-orders.md#consignment).
- **Sign a new bilateral contract** with a hospital — define fee schedule, payment terms, minimums. See [features/10-contracts-pricing.md](../features/10-contracts-pricing.md).
- **Respond to a contract leakage dispute** — when a hospital flags an invoice line as priced above contract, respond from the Match Exceptions view. See [workflows/05-resolve-match-exception.md](../workflows/05-resolve-match-exception.md).

---

## Your dashboard

![Vendor dashboard tiles](../images/vendor-dashboard-tiles.png)

The dashboard at `/dashboard` is tuned for vendor users.

### Row 1 — Fulfillment KPIs

- **New Orders Today** — orders received in the last 24h, with $ total
- **Awaiting Confirmation** — orders the hospital placed that you haven't yet acknowledged
- **In Picking / In Shipping** — your active fulfillment queue
- **Open Invoices** — sent and unpaid invoices, with aging buckets

### Row 2 — Scorecard at a glance

- **On-Time Delivery %** vs your benchmark (last 30 days)
- **Fill Rate %** (lines fully shipped / lines ordered)
- **Avg Response Time** (order received → confirmed)
- **QC Pass Rate** — receipts accepted without exception

### Row 3 — Money

- **MTD Revenue** vs same period last month
- **Top 5 Hospitals** by spend this month
- **Top 5 SKUs** shipped this month
- **AR Aging** — invoice $ buckets at 0-30, 31-60, 61-90, 90+ days

### Row 4 — Activity

- **Recent Orders** (last 10)
- **Recent Invoices** (last 10)
- **Recent Chat Threads**

### Reporting tiles

The bottom of the dashboard surfaces shortcut tiles for your most-used reports:

| Report | Use it to… |
|---|---|
| Spend by Vendor (self) | Confirm your own revenue numbers |
| Top 10 HCPC | Find your highest-volume codes |
| Spend by Month | Trend revenue over time |
| Vendor KPIs | The headline 4 metrics — on-time, fill rate, response, QC |
| Vendor Scorecard | Full balanced scorecard your customers see |
| Demand Forecast | Where your buyers are trending — what to stock |

---

## Permissions you have

### You CAN

- Publish and edit your **SKU catalog** (HCPCS mapping, prices, descriptions, images)
- Push **stock feeds** from your warehouse on whatever cadence you set (real-time, hourly, daily)
- Confirm, partial-ship, full-ship, and cancel **orders** placed against you
- Issue, void, and reissue **invoices**
- Bulk-update **tracking numbers** for many orders at once
- Manage your **locations** (warehouses, fitting centers, branches)
- Configure **ERP connectors** (NetSuite, SAP, Brightree, Bonafide, custom REST/webhook)
- Manage your **consignment closets** at hospital locations
- Sign **contracts** with hospitals and set fee schedules
- See KPIs and scorecards for **your own performance**
- Add and remove **users** within your vendor (subject to Administer Users permission)
- Chat with hospital buyers, providers, and Curavend support

### You CANNOT

- See orders, invoices, or contracts belonging to **other vendors** on the platform
- See a hospital's **internal data** beyond what they've shared with you (their formulary, their other vendors' prices, etc.)
- Edit a hospital's **formulary** or **approval rules**
- Create **GPO contracts** — that's a platform-admin function (you can be a beneficiary of one)
- Edit the **Item Master** (HCPCS / canonical SKU dictionary) — that's admin-only
- Access **Platform Management** items (Manage Vendors, Manage Hospitals, EHR Connections at the platform level) — admin-only
- See another vendor's **scorecard or KPIs** — only your own and (anonymized) benchmark percentiles

### Permission groups

Within your vendor, your Account Manager can assign these groups:

- **CSR** — receive and confirm orders, run bulk tracking
- **Catalog Manager** — edit SKU catalog, prices, images
- **Billing** — issue invoices, manage AR
- **Operations** — stock feeds, ERP connectors, locations
- **Account Executive** — contract negotiation, customer-facing analytics
- **Administrator** — full vendor-side admin

See [features/19-permissions-groups.md](../features/19-permissions-groups.md) for the full matrix.

---

## Where to get help

| If you need to… | Look at |
|---|---|
| Understand a specific feature | [features/](../features/) |
| Step through a recipe | [workflows/](../workflows/) |
| Understand the order lifecycle | [features/02-orders.md](../features/02-orders.md) |
| Set up an ERP integration | [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors) |
| Understand how your scorecard is calculated | [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md) |
| Configure notifications | [features/20-notifications.md](../features/20-notifications.md) |
| Open a support ticket | **Help & Support** in the sidebar |

### Common gotchas

- **"Why am I not getting orders from Hospital X?"** — Check (1) facility-vendor link active in **My Hospitals**, (2) signed contract in **Contract & Pricing**, (3) at least one SKU in your **Catalog** maps to a HCPCS the hospital orders.
- **"My stock feed isn't updating."** — Check **Stock Feeds** for the most recent run; failures and parse errors show inline. Also check **Admin → Integration Log** if you have admin access.
- **"The hospital says my invoice is over-contract."** — Open the **Match Exceptions** view, look at the side-by-side, and either issue a credit memo or respond with the contract clause justifying the price.
- **"My scorecard tanked this month."** — Drill into Vendor KPIs to see which dimension dropped. Most often it's response time (slow order confirmations) or fill rate (back-orders).

### In-app help

Click your avatar → **Help Center** to read the same docs in the app.

---

*Related:* If you operate as an aggregator with multiple downstream vendor accounts, also read [`super-vendor.md`](./super-vendor.md).

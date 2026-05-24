# Super-Vendor Quick-Start

> **For:** Aggregator vendors that manage multiple downstream/sub-vendor accounts under a single relationship
> **DB roles:** `SUPER_VENDOR_ACCOUNT_MANAGER`, `SUPER_VENDOR_ACCOUNT_MANAGER_USER`
> **Login:** https://curavend-web.pages.dev

## Introduction

As a **Super-Vendor** in Curavend you operate as an **aggregator**: you hold contracts with multiple hospitals and you fulfill those orders through one or more downstream sub-vendor accounts that you manage. Your menu looks almost identical to a regular vendor's, but with three differences: (1) order, invoice, and contract data is aggregated across all of your sub-vendor accounts, (2) you can pivot any list by sub-vendor, and (3) you do **not** see hospital-side procurement views (Requisitions, Goods Receipts, Match Exceptions) — those belong to the buyer.

![Super-Vendor landing page](../images/super-vendor-dashboard.png)

---

## Your menu

When you sign in with a super-vendor account, the sidebar shows the items below. The aggregation is implicit — most pages add a **Sub-Vendor** filter to the standard vendor views.

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Dashboard** | Aggregated KPI tiles across all sub-vendors | [features/01-dashboard.md](../features/01-dashboard.md) |
| **Orders** | All orders across every sub-vendor | [features/02-orders.md](../features/02-orders.md) |
| **Approvals** | Approval queue (price-change escalations, returns) | [features/05-approvals.md](../features/05-approvals.md) |
| **Invoices** | Invoices issued across all sub-vendors | [features/09-invoices.md](../features/09-invoices.md) |
| **Inventory** | Inventory rollup across sub-vendor locations | [features/02-orders.md#inventory](../features/02-orders.md#inventory) |
| **Contract & Pricing** | All bilateral contracts where any of your sub-vendors is the seller | [features/10-contracts-pricing.md](../features/10-contracts-pricing.md) |
| **Purchase Orders** | Back-to-back POs to upstream suppliers | [features/02-orders.md#purchase-orders](../features/02-orders.md#purchase-orders) |
| **Consignment** | Consignment closets at hospital locations | [features/02-orders.md#consignment](../features/02-orders.md#consignment) |
| **Locations** | All warehouses / fitting centers across sub-vendors | [features/19-permissions-groups.md#vendor-locations](../features/19-permissions-groups.md#vendor-locations) |
| **SKU Catalog** | Catalog rollup across sub-vendors (with sub-vendor pivot) | [features/04-formulary.md#vendor-catalog](../features/04-formulary.md#vendor-catalog) |
| **Stock Feeds** | All inbound stock feeds — one row per sub-vendor warehouse | [features/16-ehr-connections.md#stock-feeds](../features/16-ehr-connections.md#stock-feeds) |
| **ERP Connectors** | Connectors across sub-vendors (NetSuite, SAP, Brightree, etc.) | [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors) |
| **Chat** | Direct messaging with hospital buyers and your sub-vendors | [features/20-notifications.md#chat](../features/20-notifications.md#chat) |
| **Reporting** | Aggregated KPI/scorecard reports with sub-vendor pivot | [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md) |
| **Notification Settings** | Aggregated notification preferences | [features/20-notifications.md](../features/20-notifications.md) |
| **Help & Support** | Open a ticket or chat the Curavend team | — |
| **FAQ** | Frequently asked questions | — |

> 🛈 The super-vendor view is a **read-and-orchestrate layer** on top of your sub-vendor accounts. Most edits (catalog changes, stock feeds, ERP connectors) can be made at either the super-vendor level (broadcast to a chosen sub-vendor) or by signing in directly as the sub-vendor.

---

## Day-to-day workflows

The 7 things you'll do most often.

| # | What you're doing | Recipe |
|---|---|---|
| 1 | Triage the global order queue across all sub-vendors | [features/02-orders.md](../features/02-orders.md) — filter by Sub-Vendor |
| 2 | Onboard a new hospital across the relevant sub-vendor | [workflows/01-onboard-a-vendor.md](../workflows/01-onboard-a-vendor.md) |
| 3 | Push a catalog or price update to one or many sub-vendors | [features/04-formulary.md#vendor-catalog](../features/04-formulary.md#vendor-catalog) |
| 4 | Reconcile aggregated AR across sub-vendors | [features/09-invoices.md](../features/09-invoices.md) |
| 5 | Configure / monitor stock feeds for every sub-vendor warehouse | [features/16-ehr-connections.md#stock-feeds](../features/16-ehr-connections.md#stock-feeds) |
| 6 | Configure / monitor ERP connectors per sub-vendor | [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors) |
| 7 | Review aggregated scorecard, identify under-performing sub-vendors | [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md) |

### Less-frequent but important tasks

- **Sign a master contract** that covers multiple sub-vendors — see [features/10-contracts-pricing.md](../features/10-contracts-pricing.md).
- **Set up a consignment closet** at a hospital location, fulfilled by a chosen sub-vendor — see [features/02-orders.md#consignment](../features/02-orders.md#consignment).
- **Investigate sub-vendor performance** — drill from aggregated scorecard down to a single sub-vendor → location → SKU. See [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md).

---

## Your dashboard

![Super-Vendor dashboard tiles](../images/super-vendor-dashboard-tiles.png)

The dashboard at `/dashboard` aggregates across all sub-vendors. Every tile has a **Sub-Vendor breakdown** drill-down.

### Row 1 — Aggregate fulfillment KPIs

- **New Orders Today** — across all sub-vendors, with $ total and sub-vendor pie
- **Awaiting Confirmation** — backlog by sub-vendor (red highlights laggers)
- **In Picking / In Shipping** — aggregated queue
- **Open Invoices** — total AR with aging buckets

### Row 2 — Aggregate scorecard

- **On-Time Delivery %** — system-wide vs benchmark
- **Fill Rate %** — system-wide
- **Avg Response Time** — system-wide
- **QC Pass Rate** — system-wide

### Row 3 — Sub-vendor leaderboard

A ranked table of your sub-vendors by:

- MTD Revenue
- On-time delivery %
- Fill rate %
- Avg response time
- Match-exception rate

Color-coded: green = above benchmark, yellow = within 10% of benchmark, red = below benchmark.

### Row 4 — Money & activity

- **MTD Revenue** rollup with sub-vendor breakdown
- **Top 5 Hospitals** by spend across all sub-vendors
- **Top 5 SKUs** shipped across all sub-vendors
- **AR Aging** across all sub-vendors
- **Recent Orders** (last 10)
- **Recent Invoices** (last 10)

### Reporting tiles

| Report | Use it to… |
|---|---|
| Spend by Vendor | Compare sub-vendors against each other |
| Top 10 HCPC | Identify aggregate top codes |
| Spend by Month | Trend aggregate revenue |
| Vendor KPIs | Headline KPIs with sub-vendor pivot |
| Vendor Scorecard | Full balanced scorecard with sub-vendor pivot |
| Demand Forecast | Aggregate demand to inform stock allocation |

---

## Permissions you have

### You CAN

- See, edit, and act on **everything any of your sub-vendors can see**
- Publish **catalog and price updates** to one or many sub-vendors at once
- Confirm, ship, and invoice **orders** on behalf of any sub-vendor
- Configure **stock feeds and ERP connectors** for any sub-vendor location
- Sign **bilateral contracts** with hospitals (either at the super-vendor or sub-vendor level)
- Manage **consignment closets** at hospital locations
- Run **aggregated reporting** across all sub-vendors with full drill-down
- Add and remove **users** at the super-vendor level
- Chat with hospital buyers across the entire portfolio

### You CANNOT

- See orders, invoices, or contracts of **vendors outside your aggregation**
- See hospital-side **internal data** (formulary, approval rules, other vendors' prices)
- Create **GPO contracts** — that's a platform-admin function (your sub-vendors can be GPO beneficiaries)
- Edit the **Item Master** (HCPCS / canonical SKU dictionary) — admin-only
- Access **Platform Management** items — admin-only
- Modify a sub-vendor's tenant settings that the sub-vendor's own AM has locked

### Permission groups

Within your super-vendor tenant your admin can assign these groups, similar to vendor:

- **CSR** — multi-sub-vendor order handling
- **Catalog Manager** — catalog/price publishing across sub-vendors
- **Billing** — aggregated AR
- **Operations** — feeds, connectors, locations
- **Portfolio Manager** — analytics, contracts, sub-vendor performance
- **Administrator** — full super-vendor admin

See [features/19-permissions-groups.md](../features/19-permissions-groups.md) for the full matrix.

---

## Where to get help

| If you need to… | Look at |
|---|---|
| Understand a feature in detail | [features/](../features/) — start with [02-orders.md](../features/02-orders.md) |
| Follow a workflow recipe | [workflows/](../workflows/) |
| Understand the order lifecycle | [features/02-orders.md](../features/02-orders.md) |
| Set up an ERP integration | [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors) |
| Understand scorecard math | [features/17-vendor-scorecard.md](../features/17-vendor-scorecard.md) |
| Configure notifications | [features/20-notifications.md](../features/20-notifications.md) |
| Open a support ticket | **Help & Support** in the sidebar |

### Common gotchas

- **"A sub-vendor doesn't appear in my aggregation."** — Curavend support needs to link the sub-vendor's tenant under your super-vendor relationship. Open a ticket.
- **"My catalog push didn't reach Sub-Vendor X."** — Check the publish log on the Catalog page. Common cause: a SKU conflict at the destination tenant. Resolve and republish.
- **"AR is double-counted."** — Make sure you have not accidentally invoiced the same order at both the super-vendor and sub-vendor level. The platform deduplicates on the order key but only if the order is linked.
- **"Scorecard percentile dropped."** — Drill from aggregate → sub-vendor → location → SKU. Usually a single warehouse or a single SKU family is dragging the aggregate down.

### In-app help

Click your avatar → **Help Center** to read the same docs in the app.

---

*Related:* The base vendor flows live in [`vendor.md`](./vendor.md). Read that first if you're new to the platform — the super-vendor view is layered on top.

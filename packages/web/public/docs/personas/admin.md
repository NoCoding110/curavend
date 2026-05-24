# Admin Quick-Start

> **For:** Curavend platform administrators — the Curavend team that runs the multi-tenant cloud
> **DB roles:** `ACCOUNT_MANAGER`, `ACCOUNT_MANAGER_USER`
> **Login:** https://curavend-web.pages.dev

## Introduction

As a **Platform Admin** in Curavend you see **everything every other persona sees, plus a dedicated Platform Management section** with the tools that only Curavend staff use: tenant management (hospitals, vendors, labs), facility-vendor link administration, EHR connections, GPO contracts, payors, the item master, workflow audit logs, approval rules, and subscription plans. You are the only role with platform-wide visibility, and the only role that can act on cross-tenant data. This guide is your operating manual.

![Admin landing page](../images/admin-dashboard.png)

---

## Your menu

When you sign in with an admin account, the sidebar shows every menu item every other persona sees **plus** the Platform Management group. The list is long — use Ctrl+F to find what you need.

### Standard menu (shared with other personas)

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Dashboard** | Cross-tenant KPI tiles, recent activity, alerts | [features/01-dashboard.md](../features/01-dashboard.md) |
| **Orders** | Every order across every tenant | [features/02-orders.md](../features/02-orders.md) |
| **Approvals** | Cross-tenant approval queue (typically platform escalations only) | [features/05-approvals.md](../features/05-approvals.md) |
| **Prior Auths** | All PAs across all hospitals/providers | [features/06-prior-auths.md](../features/06-prior-auths.md) |
| **Procurement → Requisitions** | All requisitions across all hospitals | [features/03-requisitions.md](../features/03-requisitions.md) |
| **Procurement → Templates** | All requisition templates | [features/03-requisitions.md#templates](../features/03-requisitions.md#templates) |
| **Procurement → Goods Receipts** | All goods receipts | [features/07-goods-receipts.md](../features/07-goods-receipts.md) |
| **Procurement → Match Exceptions** | All 3-way match exceptions | [features/08-three-way-match.md](../features/08-three-way-match.md) |
| **Invoices** | All vendor invoices | [features/09-invoices.md](../features/09-invoices.md) |
| **Inventory** | Inventory across all vendor locations | [features/02-orders.md#inventory](../features/02-orders.md#inventory) |
| **Contract & Pricing** | Every bilateral contract on the platform | [features/10-contracts-pricing.md](../features/10-contracts-pricing.md) |
| **Customer POs** | All hospital-side POs | [features/02-orders.md#customer-pos](../features/02-orders.md#customer-pos) |
| **Recurring Orders** | All standing-order schedules | [features/02-orders.md#recurring](../features/02-orders.md#recurring) |
| **Catalog** | Browse any vendor's catalog | [features/04-formulary.md](../features/04-formulary.md) |
| **Price Lookup** | Look up any rate for any HCPCS/SKU at any tenant | [features/10-contracts-pricing.md#price-lookup](../features/10-contracts-pricing.md#price-lookup) |
| **Bulk Tracking** | All bulk tracking activity | [features/02-orders.md#bulk-tracking](../features/02-orders.md#bulk-tracking) |
| **SKU Groups** | All vendor SKU groups | [features/04-formulary.md#sku-groups](../features/04-formulary.md#sku-groups) |
| **Purchase Orders** | All back-to-back POs | [features/02-orders.md#purchase-orders](../features/02-orders.md#purchase-orders) |
| **Consignment** | All consignment closets | [features/02-orders.md#consignment](../features/02-orders.md#consignment) |
| **Recurring Orders** | All recurrence schedules | [features/02-orders.md#recurring](../features/02-orders.md#recurring) |
| **Locations** | All vendor locations across all tenants | [features/19-permissions-groups.md#vendor-locations](../features/19-permissions-groups.md#vendor-locations) |
| **SKU Catalog** | Master SKU catalog across all vendors | [features/04-formulary.md#vendor-catalog](../features/04-formulary.md#vendor-catalog) |
| **Stock Feeds** | All inbound stock feeds | [features/16-ehr-connections.md#stock-feeds](../features/16-ehr-connections.md#stock-feeds) |
| **ERP Connectors** | All ERP connectors across all vendors | [features/16-ehr-connections.md#erp-connectors](../features/16-ehr-connections.md#erp-connectors) |
| **Chat** | Direct messaging — you may be added to any thread | [features/20-notifications.md#chat](../features/20-notifications.md#chat) |
| **Reporting** | All standard reports plus admin-only compliance reports (see below) | [features/14-multi-site-spend.md](../features/14-multi-site-spend.md) |

### Platform Management group (admin-only)

This block appears below the Reporting menu, set off by dividers as a **Platform Management** menu group.

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Manage Vendors** | List, create, edit, suspend every vendor tenant | [features/18-user-management.md#vendors](../features/18-user-management.md#vendors) |
| **Manage Hospitals** | List, create, edit, suspend every hospital tenant | [features/18-user-management.md#hospitals](../features/18-user-management.md#hospitals) |
| **Facility–Vendor Links** | The cross-tenant grant matrix: who can buy from whom | [features/19-permissions-groups.md#facility-vendors](../features/19-permissions-groups.md#facility-vendors) |
| **Admin Panel** | Top-level admin landing page with system health, alerts, tenant counts | [features/18-user-management.md#admin-panel](../features/18-user-management.md#admin-panel) |
| **User Approvals** | New user registrations awaiting Curavend approval | [features/18-user-management.md#user-approvals](../features/18-user-management.md#user-approvals) |
| **File Access Log** | Audit log: who downloaded what, when (HIPAA evidence) | [features/18-user-management.md#file-access-log](../features/18-user-management.md#file-access-log) |
| **Integration Log** | Every inbound/outbound integration event (EHR, ERP, stock feeds, payor) | [features/16-ehr-connections.md#integration-log](../features/16-ehr-connections.md#integration-log) |
| **Workflows** | Workflow audit trail: every order/requisition state transition with actor + reason | [features/02-orders.md#workflow-log](../features/02-orders.md#workflow-log) |
| **GPO Contracts** | Group Purchasing Organization rate tables and memberships | [features/11-gpo-contracts.md](../features/11-gpo-contracts.md) |
| **Payors** | Payor master + 270/271 eligibility configuration | [features/12-payors-eligibility.md](../features/12-payors-eligibility.md) |
| **EHR Connections** | Multi-EHR FHIR adapter setup (Epic, Cerner, Athena, Meditech, eCW, Allscripts) | [features/16-ehr-connections.md](../features/16-ehr-connections.md) |
| **Item Master** | Canonical SKU / HCPCS dictionary used across the platform | [features/04-formulary.md#item-master](../features/04-formulary.md#item-master) |
| **Approval Rules** | The $-threshold, department, HCPCS approval-routing engine | [workflows/06-set-up-approval-rules.md](../workflows/06-set-up-approval-rules.md) |
| **Subscription Plans** | Plan catalog, tenant subscription state, billing | [features/18-user-management.md#subscriptions](../features/18-user-management.md#subscriptions) |

### Settings

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Notification Settings** | Your own notification preferences | [features/20-notifications.md](../features/20-notifications.md) |
| **Settings** | Platform-level settings (feature flags, environment, defaults) | [features/18-user-management.md#settings](../features/18-user-management.md#settings) |
| **Help & Support** | Open a ticket (yours route directly to engineering) | — |
| **FAQ** | FAQ | — |

### Admin-only reports (under Reporting)

In addition to the 11 standard reports, admins see 3 more:

| Report | Use it to… |
|---|---|
| **Compliance: Users** | Audit-ready user inventory across all tenants |
| **Compliance: Credentials** | Audit-ready credential/expiry tracking across all tenants |
| **Unbilled Transactions** | Surface orders that should have been invoiced but were not |

---

## Day-to-day workflows

The 7 things you'll do most often.

| # | What you're doing | Recipe |
|---|---|---|
| 1 | Onboard a new hospital tenant | [workflows/12-onboard-a-hospital.md](../workflows/12-onboard-a-hospital.md) |
| 2 | Onboard a new vendor tenant | [workflows/01-onboard-a-vendor.md](../workflows/01-onboard-a-vendor.md) |
| 3 | Onboard a new lab tenant | [workflows/11-onboard-a-lab.md](../workflows/11-onboard-a-lab.md) |
| 4 | Configure an EHR connection (FHIR feed) for a hospital | [workflows/13-configure-ehr-feed.md](../workflows/13-configure-ehr-feed.md) |
| 5 | Grant fine-grained permissions to a user | [workflows/14-grant-user-permissions.md](../workflows/14-grant-user-permissions.md) |
| 6 | Set up GPO membership for a hospital | [workflows/15-set-up-gpo-membership.md](../workflows/15-set-up-gpo-membership.md) |
| 7 | Approve a new user registration | [features/18-user-management.md#user-approvals](../features/18-user-management.md#user-approvals) |

### Less-frequent but important tasks

- **Investigate an integration failure** — start at **Integration Log**, filter to the failing connector. See [features/16-ehr-connections.md#integration-log](../features/16-ehr-connections.md#integration-log).
- **Run a compliance export** for an auditor — **Reporting → Compliance: Users / Credentials**, export to CSV.
- **Suspend a tenant** for non-payment — **Manage Hospitals** or **Manage Vendors** → tenant detail → **Suspend**. See [features/18-user-management.md](../features/18-user-management.md).
- **Define a new approval rule** that applies across hospitals — **Approval Rules** → New Rule. See [workflows/06-set-up-approval-rules.md](../workflows/06-set-up-approval-rules.md).
- **Add a new HCPCS to the Item Master** — **Item Master** → New Item. Vendors can then map their SKUs to the new HCPCS.
- **Investigate contract leakage at platform scale** — **Reporting → Contract Leakage**, unfiltered. See [workflows/10-detect-contract-leakage.md](../workflows/10-detect-contract-leakage.md).

---

## Your dashboard

![Admin dashboard tiles](../images/admin-dashboard-tiles.png)

The admin dashboard at `/dashboard` is the platform health view.

### Row 1 — Platform health

- **Active Tenants** — count by tenant type (hospitals, vendors, labs, providers)
- **Active Users (24h)** — DAU across all tenants
- **System Alerts** — open integration failures, suspended tenants, failed jobs
- **Storage / API usage** — current month against plan

### Row 2 — Activity at scale

- **Orders today** — cross-tenant order count + $ total
- **Invoices today** — cross-tenant invoice count + $ total
- **Match exceptions open** — count + $ at risk
- **PAs in flight** — count by status

### Row 3 — Integration health

- **EHR Connections** — green / yellow / red per connection
- **ERP Connectors** — green / yellow / red per connector
- **Stock Feeds** — green / yellow / red per feed
- **Payor 270/271** — last-success age per payor

### Row 4 — Recent activity

- **Recent User Approvals** waiting on you
- **Recent Workflow Events** (last 20 cross-tenant state transitions)
- **Recent File Accesses** (audit feed)

### Reporting tiles

All 11 standard reports plus the 3 admin-only reports (Compliance: Users, Compliance: Credentials, Unbilled Transactions).

---

## Permissions you have

### You CAN

- **See every tenant's data** — orders, invoices, contracts, formularies, prior auths, lab orders, everything
- **Create, edit, suspend, and delete tenants** — hospitals, vendors, labs, providers, super-vendors
- **Create, edit, suspend, and delete users** in any tenant
- **Approve or reject new user registrations**
- **Grant cross-tenant access** by editing **Facility–Vendor Links**
- **Edit the Item Master** (canonical HCPCS / SKU dictionary)
- **Create and manage GPO contracts** that any hospital can join
- **Configure Payors** and 270/271 eligibility endpoints
- **Configure EHR connections** (Epic, Cerner, Athena, Meditech, eCW, Allscripts)
- **View the Workflow audit log** — every state transition, every actor, every reason
- **View the File Access log** — every HIPAA-relevant download
- **View the Integration Log** — every inbound/outbound integration event
- **Edit Approval Rules** at the platform level
- **Manage Subscription Plans** and tenant billing state
- **Override or bypass** any approval, match exception, or PA decision (with audit log entry)
- **Impersonate** a user for troubleshooting (with audit log entry)

### You CANNOT

- **Bypass the audit log** — every privileged action is recorded
- **Permanently delete PHI** — deletion is soft-delete + retention-aware (HIPAA + state law)
- **Edit historical financial transactions** — corrections must be made via offsetting entries (credit memos, adjustment lines)
- **Issue payments from a tenant's bank account** — Curavend is not a payments processor
- **See data outside the Curavend platform** — there is no cross-system query layer

> ⚠ **With great power comes great audit.** Every admin action is logged with your user ID, timestamp, IP, before/after values, and (when applicable) the affected tenant. Compliance reviews these logs quarterly.

### Permission groups

Within the admin tenant your super-admin can assign:

- **Support** — read-only across tenants, plus user approvals
- **Operations** — integration log, EHR connections, ERP connectors, stock feeds
- **Onboarding** — create tenants, approve users, configure initial settings
- **Compliance** — file access log, workflow log, compliance reports
- **Billing** — subscription plans, tenant billing state
- **Super-Admin** — full platform admin including settings and feature flags

See [features/19-permissions-groups.md](../features/19-permissions-groups.md) for the full matrix.

---

## Where to get help

| If you need to… | Look at |
|---|---|
| Onboard a new tenant | [workflows/01-onboard-a-vendor.md](../workflows/01-onboard-a-vendor.md), [workflows/11-onboard-a-lab.md](../workflows/11-onboard-a-lab.md), [workflows/12-onboard-a-hospital.md](../workflows/12-onboard-a-hospital.md) |
| Configure an EHR feed | [workflows/13-configure-ehr-feed.md](../workflows/13-configure-ehr-feed.md) |
| Configure GPO membership | [workflows/15-set-up-gpo-membership.md](../workflows/15-set-up-gpo-membership.md) |
| Grant fine-grained permissions | [workflows/14-grant-user-permissions.md](../workflows/14-grant-user-permissions.md) |
| Define approval routing rules | [workflows/06-set-up-approval-rules.md](../workflows/06-set-up-approval-rules.md) |
| Understand the order/PA/lab state machines | [features/02-orders.md](../features/02-orders.md), [features/06-prior-auths.md](../features/06-prior-auths.md) |
| Investigate integrations | [features/16-ehr-connections.md](../features/16-ehr-connections.md) |
| Understand the Item Master schema | [features/04-formulary.md#item-master](../features/04-formulary.md#item-master) |
| Read the compliance docs | [features/18-user-management.md](../features/18-user-management.md), [features/19-permissions-groups.md](../features/19-permissions-groups.md) |

### Common gotchas

- **"Why can't a vendor see a hospital?"** — Missing facility-vendor link. **Facility–Vendor Links** → New Link.
- **"Why is an EHR feed throwing errors?"** — **Admin → Integration Log**, filter to the feed. Usually credentials expired or schema mismatch.
- **"A user can't log in."** — Check (1) **User Approvals** for pending state, (2) tenant subscription state in **Manage Hospitals/Vendors**, (3) the user's IP allow-list under **Admin Panel**.
- **"An invoice is double-posted."** — Likely an ERP connector idempotency issue. Check the **Integration Log** for duplicate webhook deliveries. Issue an offsetting credit; do not delete the original.
- **"Compliance asked for a 12-month audit export."** — **Reporting → Compliance: Users**, **Reporting → Compliance: Credentials**, **File Access Log**, **Workflow Log** — export each to CSV.

### In-app help and escalation

Click your avatar → **Help Center** for these docs. Admin support tickets route to engineering directly — please include a tenant ID and a UTC timestamp range with every ticket.

---

*Cross-references:* For deep dives into any single persona's day-to-day, read [`hospital.md`](./hospital.md), [`vendor.md`](./vendor.md), [`lab.md`](./lab.md), [`provider.md`](./provider.md), or [`super-vendor.md`](./super-vendor.md).

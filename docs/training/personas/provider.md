# Provider Quick-Start

> **For:** Physicians, clinicians, nurse practitioners, prescribers, and provider-side coordinators
> **DB roles:** `PROVIDER_ACCOUNT_MANAGER`, `PROVIDER_ACCOUNT_MANAGER_USER`
> **Login:** https://curavend-web.pages.dev

## Introduction

As a **Provider** user in Curavend you are typically prescribing DME, orthotics, biologics, or wound-care items for a patient and you need a fast, focused workflow to (1) find the right vendor and SKU, (2) submit the order, (3) initiate the prior authorization with the payor, and (4) keep the patient's chart updated as the order moves through approval, fulfillment, and delivery. Your menu is a lean subset of the hospital menu — buyer-side but without the procurement complexity.

![Provider landing page](../images/provider-dashboard.png)

---

## Your menu

When you sign in with a provider account, the left sidebar shows:

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Dashboard** | Your patient/order queue, open PAs, recent activity | [features/01-dashboard.md](../features/01-dashboard.md) |
| **Orders** | The list of orders you (or your group) have placed | [features/02-orders.md](../features/02-orders.md) |
| **Approvals** | Items waiting on your decision (rare for providers — usually order edits) | [features/05-approvals.md](../features/05-approvals.md) |
| **Prior Auths** | Payor authorizations attached to your orders | [features/06-prior-auths.md](../features/06-prior-auths.md) |
| **Procurement → Requisitions** | Pre-order requests routed through approval | [features/03-requisitions.md](../features/03-requisitions.md) |
| **Procurement → Templates** | Reusable requisition templates for repeat orders | [features/03-requisitions.md#templates](../features/03-requisitions.md#templates) |
| **Invoices** | Invoices attached to your orders (typically AP handles these) | [features/09-invoices.md](../features/09-invoices.md) |
| **Contract & Pricing** | View contracts/fees for the vendors available to you | [features/10-contracts-pricing.md](../features/10-contracts-pricing.md) |
| **My Vendors** | The vendors that have been approved for your facility | [features/19-permissions-groups.md#facility-vendors](../features/19-permissions-groups.md#facility-vendors) |
| **Vendor Coverage** | Coverage map: which vendor covers which HCPCS in your region | [features/10-contracts-pricing.md#coverage](../features/10-contracts-pricing.md#coverage) |
| **Chat** | Direct messaging with vendor reps, your hospital admin, support | [features/20-notifications.md#chat](../features/20-notifications.md#chat) |
| **Reporting** | Spend and ordering reports filtered to your activity | [features/14-multi-site-spend.md](../features/14-multi-site-spend.md) |
| **Help & Support** | Open a ticket or chat the Curavend team | — |
| **FAQ** | Frequently asked questions | — |

> 🛈 You do **not** see Facilities, Departments, Physicians, Goods Receipts, Match Exceptions, Inventory, or Customer POs — those belong to the hospital admin role.

---

## Day-to-day workflows

The 6 things you'll do most often.

| # | What you're doing | Recipe |
|---|---|---|
| 1 | Place an order for a patient against a contracted vendor | [features/02-orders.md#placing-an-order](../features/02-orders.md#placing-an-order) |
| 2 | Submit a requisition that needs approval before becoming an order | [workflows/02-create-and-submit-requisition.md](../workflows/02-create-and-submit-requisition.md) |
| 3 | Initiate a prior authorization with the patient's payor | [workflows/08-process-prior-authorization.md](../workflows/08-process-prior-authorization.md) |
| 4 | Check coverage: which vendor supplies HCPCS X in patient's region | [features/10-contracts-pricing.md#coverage](../features/10-contracts-pricing.md#coverage) |
| 5 | Reuse a requisition template for a common order type | [features/03-requisitions.md#templates](../features/03-requisitions.md#templates) |
| 6 | Chat with the vendor rep to clarify a back-ordered item | [features/20-notifications.md#chat](../features/20-notifications.md#chat) |

### Less-frequent but important tasks

- **Review approvals** — if you're an approver for your provider group, see [features/05-approvals.md](../features/05-approvals.md).
- **Investigate a PA denial** — the Prior Auths page shows the full 7-state lifecycle including denial reasons. See [features/06-prior-auths.md](../features/06-prior-auths.md).
- **Run a spend-by-physician report** for your group — under **Reporting → Spend by Physician**. See [features/14-multi-site-spend.md](../features/14-multi-site-spend.md).

---

## Your dashboard

![Provider dashboard tiles](../images/provider-dashboard-tiles.png)

The dashboard at `/dashboard` is tuned for provider users.

### Row 1 — Active patient work

- **Open Orders** — orders you've placed that are not yet delivered
- **Awaiting PA** — orders blocked on prior authorization
- **Awaiting Approval** — requisitions in approval queue
- **Recently Delivered** — orders delivered in the last 7 days

### Row 2 — Prior Authorizations

- **PA Pending Submission** — drafted but not yet submitted to payor
- **PA In Review** — submitted, payor reviewing
- **PA Approved** (last 30 days)
- **PA Denied** (last 30 days, with denial reasons)

### Row 3 — Quick actions

- **New Order** button — opens the catalog-driven order form
- **New Requisition** button — for orders that need approval first
- **From Template** dropdown — your recent requisition templates

### Row 4 — Activity

- **Recent Orders** (last 10, with patient name and HCPCS)
- **Recent PA Status Changes** (last 10)

### Reporting tiles

- **Spend by Physician** — usually filtered to "Me" by default
- **Spend by Vendor** — your top vendors
- **Top 10 HCPC** — your top codes
- **Vendor Coverage** — quick reference: who covers what

---

## Permissions you have

### You CAN

- Browse the **Catalog** of vendors approved for your facility
- Place **orders** (or **requisitions** if your facility requires approval first)
- View and manage **prior authorizations** for your orders
- Reuse and create **requisition templates**
- View **contracts and pricing** for vendors available to you
- View **Vendor Coverage** to find who supplies what HCPCS where
- See spend and KPI **reports** scoped to your physician/group activity
- **Chat** with vendor reps, your hospital admin, and support
- Update your **profile**

### You CANNOT

- See or place orders for **patients/facilities you don't have access to**
- Manage the hospital's **facilities, departments, physician master, or formulary** — those are hospital-admin functions
- Record **goods receipts** or work **match exceptions** — those are AP/dock functions
- See or edit **invoices** beyond viewing the ones tied to your orders
- See **other providers' patient orders** outside your group
- Edit a vendor's **catalog** or **prices**
- Access **Platform Management** functions

### Permission groups

Within your provider organization you may be assigned:

- **Prescriber** — place orders, submit PAs
- **Approver** — approve requisitions for your group
- **Coordinator** — handle PAs and chase orders, but don't prescribe
- **Administrator** — full provider-side admin

See [features/19-permissions-groups.md](../features/19-permissions-groups.md) for the full matrix.

---

## Where to get help

| If you need to… | Look at |
|---|---|
| Understand a feature in detail | [features/](../features/) — start with [02-orders.md](../features/02-orders.md) and [06-prior-auths.md](../features/06-prior-auths.md) |
| Follow a workflow recipe | [workflows/](../workflows/) |
| Understand the order lifecycle | [features/02-orders.md](../features/02-orders.md) |
| Understand the PA lifecycle | [features/06-prior-auths.md](../features/06-prior-auths.md) |
| Configure notifications | [features/20-notifications.md](../features/20-notifications.md) |
| Open a support ticket | **Help & Support** in the sidebar |

### Common gotchas

- **"Why isn't this vendor in my catalog?"** — Vendors only appear if (1) your hospital admin has approved them as a facility vendor and (2) a contract is active. Ask your hospital admin.
- **"My order is stuck — what now?"** — Look at the order detail page. It will show the current sub-status (PENDING_APPROVAL, AWAITING_PA, AWAITING_FULFILLMENT, etc.) and who needs to act.
- **"The PA was denied. Can I appeal?"** — Yes. Open the PA detail page, click **Appeal**, attach supporting clinical documentation, and resubmit. The state machine tracks appeals separately from the original submission.
- **"I can't find the order I just placed."** — Refresh; orders sometimes take 2-3 seconds to index. If still missing, check **Approvals** — it may be sitting in the approval queue and not yet a live order.

### In-app help

Click your avatar → **Help Center** to read the same docs inside the app.

---

*Related:* If you also administer your hospital's Curavend tenant, also read [`hospital.md`](./hospital.md) — most of those tools will be unlocked for you in your hospital-side login.

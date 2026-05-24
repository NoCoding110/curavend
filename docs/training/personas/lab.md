# Lab Quick-Start

> **For:** Lab account managers, CSRs, kit coordinators
> **DB roles:** `LAB_ACCOUNT_MANAGER`, `LAB_ACCOUNT_MANAGER_USER`
> **Login:** https://curavend-web.pages.dev

## Introduction

As a **Lab** user in Curavend you have a focused, stripped-down workspace built around the test-kit fulfillment lifecycle. Your job is to receive inbound lab orders from hospitals and providers, group them under the correct lab order codes, dispatch kits from the right kit sites, and keep your kit-site inventory current. Unlike the buyer/seller flows the other personas live in, lab work centers on kits, draw sites, and result turnaround — so your menu is intentionally minimal.

![Lab landing page](../images/lab-dashboard.png)

---

## Your menu

When you sign in with a lab account, the sidebar is intentionally lean — only 5 items. This is enforced in code (`Sidebar.tsx` lines 49-57) and you will not see the buyer/seller menus that hospital and vendor users see.

| Sidebar item | What it's for | Doc link |
|---|---|---|
| **Lab Dashboard** | Overview of active lab orders, today's kit dispatches, turnaround KPIs | [features/01-dashboard.md#lab](../features/01-dashboard.md#lab) |
| **Lab Orders** | The master list of every lab order — search, filter, drill in | [features/02-orders.md#lab-orders](../features/02-orders.md#lab-orders) |
| **Lab Groups** | Group lab orders by test panel, draw type, accessioning batch | [features/02-orders.md#lab-groups](../features/02-orders.md#lab-groups) |
| **Kit Sites** | Manage draw sites and the kit inventory at each | [features/19-permissions-groups.md#kit-sites](../features/19-permissions-groups.md#kit-sites) |
| **Profile** | Your user profile and account settings | [features/18-user-management.md](../features/18-user-management.md) |

> 🛈 **No Chat, no Reporting, no Contracts.** Lab accounts are scoped tightly. If you need to reach a hospital partner, use phone/email — chat is not surfaced for lab users. If you need a custom report, contact your Curavend account manager.

> ⚠ **No requisitions, no formulary, no goods receipts.** Lab orders flow through their own state machine that does not use the procurement workflow. Do not look for these items — they are deliberately hidden.

---

## Day-to-day workflows

The 5 things you'll do most often.

| # | What you're doing | Where |
|---|---|---|
| 1 | Review incoming lab orders and accept them into your lab | **Lab Orders** → filter to `Status = NEW` |
| 2 | Group orders for the daily accessioning run | **Lab Groups** → create or pick a group, drag in orders |
| 3 | Dispatch test kits from the correct kit site | **Kit Sites** → pick site → **Dispatch** |
| 4 | Receive returned kits and post results back to the order | **Lab Orders** → open order → **Post Result** |
| 5 | Maintain kit-site inventory (replenishment, expiry monitoring) | **Kit Sites** → site detail → **Inventory** |

For the end-to-end onboarding of a new lab on the platform, see [workflows/11-onboard-a-lab.md](../workflows/11-onboard-a-lab.md).

### Common lab order statuses

- **NEW** — created by hospital/provider, waiting for your lab to acknowledge
- **ACCEPTED** — your lab has taken the order
- **GROUPED** — assigned to a Lab Group for batch processing
- **KIT_DISPATCHED** — collection kit has shipped to the draw site
- **SPECIMEN_RECEIVED** — sample has come back to the lab
- **IN_PROCESS** — running the assay
- **RESULTED** — final result posted; downstream provider is notified
- **CANCELLED** — order voided (with reason)

See [features/02-orders.md#lab-orders](../features/02-orders.md#lab-orders) for the full state diagram.

---

## Your dashboard

![Lab dashboard tiles](../images/lab-dashboard-tiles.png)

The dashboard at `/labs` shows the four things you need first thing in the morning:

### Row 1 — Today's work

- **New Orders** awaiting acceptance (with age in hours)
- **Kits to Dispatch Today** — orders accepted but not yet shipped
- **Samples In Lab** — orders with specimens received but not yet resulted
- **Results Overdue** — orders past their target turnaround

### Row 2 — Pipeline

- **Lab Groups in Progress** — count by status
- **Kit Sites by Stock Level** — sites with low inventory flagged red

### Row 3 — Activity

- **Recent Lab Orders** (last 10, click to drill in)
- **Recent Result Postings** (last 10)

### Row 4 — KPIs

- **Avg Turnaround Time** (specimen received → resulted), last 7 / 30 days
- **Accept Rate** — % of inbound orders accepted within SLA
- **Kit Dispatch Compliance** — % of kits shipped same day as accepted

---

## Permissions you have

### You CAN

- Accept or reject inbound **lab orders** routed to your lab
- Create and manage **Lab Groups** (batching, accessioning runs)
- Manage **Kit Sites** — add new draw sites, set par levels, log replenishment receipts
- Post **results** to lab orders (free-text result, structured panel result, file upload)
- Cancel lab orders **with reason** (audit logged)
- Update your **profile** and password
- Add and remove **users** within your lab tenant (if you have Administer Users)

### You CANNOT

- See or place **purchase orders, requisitions, invoices, or contracts** — these flow through the hospital/vendor side of the platform
- See orders, groups, or kit sites belonging to **other labs**
- Access **Approvals, Prior Auths, Reporting, Chat** — these are hidden for lab roles
- Edit a hospital's **formulary** or a vendor's **catalog**
- Access **Platform Management** functions — admin-only

### Permission groups

Within your lab tenant your administrator can assign:

- **CSR** — accept orders, dispatch kits
- **Accessioner** — manage Lab Groups, batch routing
- **Result Poster** — post results to orders
- **Kit Site Manager** — manage Kit Sites, inventory, par levels
- **Administrator** — full lab-side admin including user management

See [features/19-permissions-groups.md](../features/19-permissions-groups.md) for the full matrix.

---

## Where to get help

| If you need to… | Look at |
|---|---|
| Onboard your lab from scratch | [workflows/11-onboard-a-lab.md](../workflows/11-onboard-a-lab.md) |
| Understand a feature in detail | [features/02-orders.md#lab-orders](../features/02-orders.md#lab-orders), [features/19-permissions-groups.md#kit-sites](../features/19-permissions-groups.md#kit-sites) |
| Configure user accounts at your lab | [features/18-user-management.md](../features/18-user-management.md) |
| Open a support ticket | Contact your Curavend account manager directly (no in-app Help & Support for lab roles) |

### Common gotchas

- **"I don't see a Help & Support menu."** — Lab accounts route support requests via your assigned Curavend AM. Reach out to them by phone or email.
- **"Why can't I chat with the hospital?"** — Chat is not enabled for lab roles. Use the contact details on the lab order itself.
- **"Why is my Kit Site inventory negative?"** — A dispatch was logged against a SKU with no on-hand stock. Add a replenishment receipt to correct it.
- **"I can't find an order I know was sent."** — Confirm with the hospital that the order was routed to your lab tenant. Multi-lab hospitals can mis-route — the order may be sitting in another lab's queue.

### Need a feature you don't see?

If you need access to chat, reporting, or contract management as a lab user, contact your Curavend account manager. Lab role-scoping is intentional but can be opened up via platform admin if your business requires it.

---

*Notes:* This guide deliberately stays short because the lab persona's menu is short. There is much more depth in the [features/](../features/) and [workflows/](../workflows/) directories — but most of it is not relevant to day-to-day lab operations.

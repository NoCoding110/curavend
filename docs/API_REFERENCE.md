# Curavend Platform — Complete API Reference

**Base URL (production):** `https://curavend-api.metabilityllc1.workers.dev`  
**Runtime:** Cloudflare Workers (Hono v4)  
**Auth scheme:** `Authorization: Bearer <JWT>` on all `/api/*` routes unless noted  
**Error format:** `{ "error": "...", "code": "ERROR_CODE" }` with HTTP 4xx/5xx  
**Generated:** 2026-05-27 · Pass 3 verified against all 87 route files + `index.ts`

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Authentication](#2-authentication)
3. [User Management](#3-user-management)
4. [Hospital Management](#4-hospital-management)
5. [Vendor Management](#5-vendor-management)
6. [Provider & Super-Vendor Management](#6-provider--super-vendor-management)
7. [Orders & Lifecycle](#7-orders--lifecycle)
8. [Shipments](#8-shipments)
9. [Order Recurrence](#9-order-recurrence)
10. [Invoices & Billing](#10-invoices--billing)
11. [Approvals & Approval Rules](#11-approvals--approval-rules)
12. [Inventory & Catalog](#12-inventory--catalog)
13. [Lab Portal](#13-lab-portal)
14. [DME / DMEPOS](#14-dme--dmepos)
15. [Procurement](#15-procurement)
16. [Financial — Budgets & GL](#16-financial--budgets--gl)
17. [Contracts & Pricing](#17-contracts--pricing)
18. [Reporting & Analytics](#18-reporting--analytics)
19. [Administration](#19-administration)
20. [AI](#20-ai)
21. [FHIR / EHR Integration](#21-fhir--ehr-integration)
22. [CDS Hooks (Public)](#22-cds-hooks-public)
23. [Notifications](#23-notifications)
24. [Support Tickets](#24-support-tickets)
25. [Rooms / Chat](#25-rooms--chat)
26. [Clinical Templates](#26-clinical-templates)
27. [Workflows](#27-workflows)
28. [Subscriptions](#28-subscriptions)
29. [Uploads](#29-uploads)
30. [Utility](#30-utility)
31. [Search](#31-search)
32. [Infrastructure & Public Endpoints](#32-infrastructure--public-endpoints)
33. [Background Jobs (Cron)](#33-background-jobs-cron)
34. [Queue Events](#34-queue-events)

---

## 1. Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Returns `{ status, service, timestamp }` |

---

## 2. Authentication

Mount: `/api/auth` — **No auth required on any of these routes**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login with email + password. Returns `{ token, user }` |
| `POST` | `/api/auth/logout` | Invalidate session |
| `POST` | `/api/auth/refresh` | Exchange refresh token for new JWT |
| `GET` | `/api/auth/me` | Return the current user's profile |
| `POST` | `/api/auth/mfa/enable` | Begin TOTP MFA enrollment; returns `{ secret, qrDataUrl }` |
| `POST` | `/api/auth/mfa/verify` | Confirm TOTP code to complete enrollment |
| `POST` | `/api/auth/mfa/disable` | Disable MFA (requires current TOTP code) |
| `POST` | `/api/auth/email-otp/send` | Send one-time-password to user's email |
| `POST` | `/api/auth/email-otp/verify` | Verify the emailed OTP code |
| `POST` | `/api/auth/password/reset-request` | Send password-reset email |
| `POST` | `/api/auth/password/reset` | Complete password reset with token |

---

## 3. User Management

Mount: `/api/users`  
Mount: `/api/user-groups`  
Mount: `/api/user-permissions`  
Mount: `/api/user-filter-presets`

### Users — `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List users (scoped by caller's tenant). Query: `role`, `hospitalId`, `vendorId`, `status`, `limit`, `offset` |
| `POST` | `/api/users` | Create/invite a user. Body may include `groupIds[]` to assign groups on creation |
| `GET` | `/api/users/me` | Get current user profile |
| `PUT` | `/api/users/me` | Update current user profile |
| `GET` | `/api/users/:id` | Get user by ID |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |
| `POST` | `/api/users/:id/invite` | Re-send invite email |
| `PUT` | `/api/users/:id/attach-hospital` | Attach user to a hospital (Admin) |
| `PUT` | `/api/users/:id/attach-vendor` | Attach user to a vendor (Admin) |

### User Groups — `/api/user-groups`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user-groups` | List groups for the caller's tenant |
| `POST` | `/api/user-groups` | Create group. Body: `{ name, hospitalId?, vendorId? }` |
| `GET` | `/api/user-groups/:id` | Get group detail + permissions |
| `PUT` | `/api/user-groups/:id` | Update group name |
| `DELETE` | `/api/user-groups/:id` | Delete group |
| `GET` | `/api/user-groups/:id/members` | List group members |
| `POST` | `/api/user-groups/:id/members` | Add members. Body: `{ userIds: [] }` |
| `DELETE` | `/api/user-groups/:id/members/:userId` | Remove member |
| `GET` | `/api/user-groups/:id/permissions` | List permissions granted to this group |

### User Permissions — `/api/user-permissions`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user-permissions` | List permission grants (query by `userId`, `groupId`) |
| `POST` | `/api/user-permissions` | Grant a permission. Body: `{ subjectType, subjectId, resource, action }` |
| `PUT` | `/api/user-permissions/:id` | Update permission grant |
| `DELETE` | `/api/user-permissions/:id` | Revoke permission |
| `GET` | `/api/user-permissions/matrix` | Full RBAC matrix for current user's tenant |

### User Filter Presets — `/api/user-filter-presets`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user-filter-presets` | List saved filter presets for current user |
| `POST` | `/api/user-filter-presets` | Save a new filter preset. Body: `{ name, context, filters }` |
| `PUT` | `/api/user-filter-presets/:id` | Update preset |
| `DELETE` | `/api/user-filter-presets/:id` | Delete preset |

---

## 4. Hospital Management

Mount: `/api/hospitals`  
Mount: `/api/hospital-facilities`  
Mount: `/api/hospital-departments`  
Mount: `/api/hospital-vendors`

### Hospitals — `/api/hospitals`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hospitals` | List hospitals (admin sees all; hospital user sees own) |
| `POST` | `/api/hospitals` | Create hospital |
| `GET` | `/api/hospitals/:id` | Get hospital by ID |
| `PUT` | `/api/hospitals/:id` | Update hospital |
| `DELETE` | `/api/hospitals/:id` | Delete hospital |

### Facilities — `/api/hospital-facilities`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hospital-facilities` | List facilities. Query: `hospitalId` |
| `POST` | `/api/hospital-facilities` | Create facility. Body: `{ hospitalId, name, address, city, state, zip, facilityType }` |
| `GET` | `/api/hospital-facilities/:id` | Get facility |
| `PUT` | `/api/hospital-facilities/:id` | Update facility |
| `DELETE` | `/api/hospital-facilities/:id` | Delete facility |

### Departments — `/api/hospital-departments`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hospital-departments` | List departments. Query: `hospitalId`, `facilityId` |
| `POST` | `/api/hospital-departments` | Create department. Body: `{ hospitalId, facilityId?, name, costCenter?, glCode?, serviceLine? }` |
| `GET` | `/api/hospital-departments/:id` | Get department |
| `PUT` | `/api/hospital-departments/:id` | Update department (includes costCenter, glCode, serviceLine) |
| `DELETE` | `/api/hospital-departments/:id` | Delete department |

### Hospital-Vendor Links — `/api/hospital-vendors`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hospital-vendors` | List hospital↔vendor relationships. Query: `hospitalId`, `vendorId` |
| `POST` | `/api/hospital-vendors` | Create hospital-vendor link |
| `DELETE` | `/api/hospital-vendors/:id` | Remove hospital-vendor link |

### Providers (Physicians) — `/api/providers`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/providers` | List providers |
| `POST` | `/api/providers` | Create provider |
| `GET` | `/api/providers/:id` | Get provider |
| `PUT` | `/api/providers/:id` | Update provider |
| `DELETE` | `/api/providers/:id` | Delete provider |

---

## 5. Vendor Management

Mount: `/api/vendors`  
Mount: `/api/vendor-locations`  
Mount: `/api/vendor-coverage`  
Mount: `/api/vendor-item-skus`  
Mount: `/api/vendor-stock-connectors`  
Mount: `/api/vendor-erp-connectors`  
Mount: `/api/vendor-onboarding`

### Vendors — `/api/vendors`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendors` | List vendors. Query: `limit`, `offset`, `search`, `vendorType` |
| `POST` | `/api/vendors` | Create vendor |
| `GET` | `/api/vendors/:id` | Get vendor detail |
| `PUT` | `/api/vendors/:id` | Update vendor |
| `DELETE` | `/api/vendors/:id` | Delete vendor |
| `GET` | `/api/vendors/:id/scorecard` | Get auto-computed vendor performance scorecard |

### Vendor Locations — `/api/vendor-locations`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendor-locations` | List locations. Query: `vendorId` |
| `POST` | `/api/vendor-locations` | Create location |
| `GET` | `/api/vendor-locations/:id` | Get location |
| `PUT` | `/api/vendor-locations/:id` | Update location |
| `DELETE` | `/api/vendor-locations/:id` | Delete location |

### Vendor Geographic Coverage — `/api/vendor-coverage`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendor-coverage` | List coverage rules. Query: `vendorId`, `state` |
| `POST` | `/api/vendor-coverage` | Create coverage rule |
| `DELETE` | `/api/vendor-coverage/:id` | Remove coverage rule |

### Vendor Item SKUs — `/api/vendor-item-skus`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendor-item-skus` | List SKU mappings. Query: `vendorId`, `hcpcCode` |
| `POST` | `/api/vendor-item-skus` | Create SKU mapping |
| `GET` | `/api/vendor-item-skus/:id` | Get mapping |
| `PUT` | `/api/vendor-item-skus/:id` | Update mapping |
| `DELETE` | `/api/vendor-item-skus/:id` | Delete mapping |

### Vendor Stock Connectors — `/api/vendor-stock-connectors`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendor-stock-connectors` | List connectors |
| `POST` | `/api/vendor-stock-connectors` | Create connector |
| `GET` | `/api/vendor-stock-connectors/:id` | Get connector |
| `PUT` | `/api/vendor-stock-connectors/:id` | Update connector |
| `DELETE` | `/api/vendor-stock-connectors/:id` | Delete connector |
| `POST` | `/api/vendor-stock-connectors/:id/poll-now` | Trigger an immediate stock poll |

**Public inbound webhook** (HMAC-verified):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/stock-feeds/:connectorId/webhook` | HMAC sig | Inbound stock-level push from vendor |

### Vendor ERP Connectors — `/api/vendor-erp-connectors`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendor-erp-connectors` | List ERP connectors |
| `POST` | `/api/vendor-erp-connectors` | Create connector |
| `GET` | `/api/vendor-erp-connectors/:id` | Get connector |
| `PUT` | `/api/vendor-erp-connectors/:id` | Update connector |
| `DELETE` | `/api/vendor-erp-connectors/:id` | Delete connector |
| `POST` | `/api/vendor-erp-connectors/:id/test` | Test ERP connection |

### Vendor Onboarding — `/api/vendor-onboarding`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vendor-onboarding` | List onboarding applications |
| `POST` | `/api/vendor-onboarding` | Start a new onboarding application |
| `GET` | `/api/vendor-onboarding/:id` | Get application |
| `PUT` | `/api/vendor-onboarding/:id` | Update application |
| `PUT` | `/api/vendor-onboarding/:id/advance` | Advance application to next stage |
| `PUT` | `/api/vendor-onboarding/:id/reject` | Reject application |

---

## 6. Provider & Super-Vendor Management

### Super-Vendors — `/api/super-vendors`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/super-vendors` | List super-vendors |
| `POST` | `/api/super-vendors` | Create super-vendor |
| `GET` | `/api/super-vendors/:id` | Get super-vendor |
| `PUT` | `/api/super-vendors/:id` | Update super-vendor |
| `DELETE` | `/api/super-vendors/:id` | Delete super-vendor |
| `GET` | `/api/super-vendors/:id/vendors` | List child vendors |
| `POST` | `/api/super-vendors/:id/vendors` | Add child vendor |
| `DELETE` | `/api/super-vendors/:id/vendors/:vendorId` | Remove child vendor |

---

## 7. Orders & Lifecycle

Mount: `/api/orders` (orders, encounter, order PDF all mount here)  
Mount: `/api/routing`

### Vendor Routing — `/api/routing`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/routing/score` | Score candidate vendors for an order. Body: `{ orderId?, hcpcCode, patientState, hospitalId }` |
| `GET` | `/api/routing/matrix` | View the scoring weight matrix |

### Orders — `/api/orders`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/orders` | List orders. Query: `status`, `orderSubStatus`, `hospitalId`, `vendorId`, `providerId`, `patientName`, `startDate`, `endDate`, `limit`, `offset` |
| `POST` | `/api/orders` | Create order |
| `GET` | `/api/orders/:id` | Get order detail (items, notes, attachments) |
| `PUT` | `/api/orders/:id` | Update order fields |
| `DELETE` | `/api/orders/:id` | Delete order |
| `PUT` | `/api/orders/:id/status` | Transition order status / sub-status (8-step state machine) |
| `GET` | `/api/orders/:id/history` | Order audit/status-change history |
| `POST` | `/api/orders/:id/notes` | Add a note to an order |
| `GET` | `/api/orders/:id/notes` | List notes |
| `POST` | `/api/orders/:id/attachments` | Upload attachment (multipart) |
| `GET` | `/api/orders/:id/attachments` | List attachments |
| `POST` | `/api/orders/:id/clone` | Clone order as a new draft |
| `GET` | `/api/orders/export.csv` | Export orders to CSV |
| `GET` | `/api/orders/:id/packet.pdf` | Generate and download order packet PDF |

### Order Encounter (EHR context) — also at `/api/orders`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/orders/:id/encounter` | Get the Epic encounter context attached to an order |
| `PUT` | `/api/orders/:id/encounter` | Set / update the Epic encounter on an order |

### Order Sub-status Machine

The `orderSubStatus` field transitions through these states:

```
NEW_ORDER → VENDOR_ASSIGNED → VENDOR_CONFIRMED_RECEIPT →
ASSESSED → OUT_FOR_DELIVERY → DELIVERED → PROOF_OF_DELIVERY → ORDER_COMPLETED
                ↘ ORDER_REQUESTED_FOR_MODIFY (any stage)
                ↘ CANCELLED
```

---

## 8. Shipments

Mount: `/api` (handlers emit `/orders/:id/shipments` and `/shipments/:id`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/orders/:id/shipments` | List shipments for an order |
| `POST` | `/api/orders/:id/shipments` | Create shipment record for an order |
| `GET` | `/api/shipments/:id` | Get shipment detail |
| `PUT` | `/api/shipments/:id` | Update shipment (tracking number, carrier, dates) |
| `DELETE` | `/api/shipments/:id` | Delete shipment |
| `POST` | `/api/shipments/:id/events` | Add a tracking event (scan, exception, etc.) |
| `GET` | `/api/shipments/:id/events` | List tracking events for a shipment |

---

## 9. Order Recurrence

Mount: `/api/recurrence`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/recurrence` | List recurrence plans |
| `POST` | `/api/recurrence` | Create recurrence plan (template order + schedule) |
| `GET` | `/api/recurrence/:id` | Get plan detail |
| `PUT` | `/api/recurrence/:id` | Update plan |
| `DELETE` | `/api/recurrence/:id` | Delete plan |
| `POST` | `/api/recurrence/:id/spawn-now` | Manually spawn a child order from the plan immediately |

---

## 10. Invoices & Billing

Mount: `/api/invoices`  
Mount: `/api/invoice-match-rules`  
Mount: `/api/webhooks` (Stripe)  
Mount: `/api/subscriptions`

### Invoices — `/api/invoices`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/invoices` | List invoices. Query: `hospitalId`, `vendorId`, `status`, `startDate`, `endDate`, `limit`, `offset` |
| `GET` | `/api/invoices/export.csv` | Export invoices to CSV |
| `POST` | `/api/invoices/import-payments` | Bulk import payment records (CSV/JSON) |
| `GET` | `/api/invoices/:id` | Get invoice + line items |
| `PUT` | `/api/invoices/:id` | Update invoice |
| `PUT` | `/api/invoices/:id/confirm-spend` | Hospital confirms spend for an invoice |
| `PUT` | `/api/invoices/:id/generate` | Generate/regenerate invoice PDF |
| `PUT` | `/api/invoices/:id/send` | Send invoice to hospital via email |
| `POST` | `/api/invoices/:id/checkout-session` | Create Stripe checkout session for online payment |
| `PUT` | `/api/invoices/:id/mark-paid` | Mark invoice as paid (manual) |

### Invoice Match Rules — `/api/invoice-match-rules`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/invoice-match-rules` | List auto-resolution rules |
| `POST` | `/api/invoice-match-rules` | Create rule. Body: `{ name, condition, action, tolerance }` |
| `GET` | `/api/invoice-match-rules/:id` | Get rule |
| `PUT` | `/api/invoice-match-rules/:id` | Update rule |
| `DELETE` | `/api/invoice-match-rules/:id` | Delete rule |
| `POST` | `/api/invoice-match-rules/run` | Run all auto-resolution rules against open exceptions now |

### Stripe Webhooks (public) — `/api/webhooks`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/webhooks/stripe` | Stripe sig | Handle Stripe payment events |

### Subscriptions — `/api/subscriptions`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/subscriptions/status` | Get current subscription status for caller's org |
| `POST` | `/api/subscriptions/create-checkout-session` | Create Stripe checkout session for a plan |
| `POST` | `/api/subscriptions/portal-session` | Open Stripe billing portal |
| `GET` | `/api/subscriptions/plans` | List available subscription plans |

---

## 11. Approvals & Approval Rules

Mount: `/api/approvals`  
Mount: `/api/approval-rules`

### Approvals — `/api/approvals`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/approvals` | List pending approvals for the caller |
| `POST` | `/api/approvals/:id/approve` | Approve an item |
| `POST` | `/api/approvals/:id/reject` | Reject an item. Body: `{ reason? }` |

### Approval Rules — `/api/approval-rules`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/approval-rules` | List approval routing rules |
| `POST` | `/api/approval-rules` | Create rule. Body: `{ name, triggerType, thresholdAmount?, requiredApproverRole, hospitalId? }` |
| `GET` | `/api/approval-rules/:id` | Get rule |
| `PUT` | `/api/approval-rules/:id` | Update rule |
| `DELETE` | `/api/approval-rules/:id` | Delete rule |

---

## 12. Inventory & Catalog

Mount: `/api/inventory`  
Mount: `/api/transfers`  
Mount: `/api/catalog`  
Mount: `/api/sku-groups`  
Mount: `/api/pricing`  
Mount: `/api/formulary`  
Mount: `/api/point-of-use`  
Mount: `/api/reporting/cross-site-inventory`  
Mount: `/api/substitutions`  
Mount: `/api/item-master-hygiene`  
Mount: `/api/spend-calculator`

### Inventory — `/api/inventory`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/inventory` | List inventory items. Query: `hospitalId`, `facilityId`, `belowReorderPoint`, `limit`, `offset` |
| `POST` | `/api/inventory` | Create inventory item |
| `GET` | `/api/inventory/:id` | Get inventory item |
| `PUT` | `/api/inventory/:id` | Update item (quantity, reorder point, etc.) |
| `DELETE` | `/api/inventory/:id` | Delete item |
| `POST` | `/api/inventory/:id/adjustment` | Record manual stock adjustment. Body: `{ delta, reason }` |

### Inventory Transfers — `/api/transfers`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/transfers` | List transfer requests |
| `POST` | `/api/transfers` | Request stock transfer between sites |
| `GET` | `/api/transfers/:id` | Get transfer |
| `PUT` | `/api/transfers/:id` | Update transfer |
| `POST` | `/api/transfers/:id/approve` | Approve transfer (source site) |
| `POST` | `/api/transfers/:id/receive` | Confirm receipt at destination |

### SKU Catalog — `/api/catalog`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/catalog` | List catalog items. Query: `hospitalId`, `vendorId`, `hcpcCode`, `search` |
| `POST` | `/api/catalog` | Create catalog item |
| `GET` | `/api/catalog/:id` | Get item |
| `PUT` | `/api/catalog/:id` | Update item |
| `DELETE` | `/api/catalog/:id` | Delete item |

### SKU Groups — `/api/sku-groups`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sku-groups` | List SKU groups |
| `POST` | `/api/sku-groups` | Create group |
| `GET` | `/api/sku-groups/:id` | Get group |
| `PUT` | `/api/sku-groups/:id` | Update group |
| `DELETE` | `/api/sku-groups/:id` | Delete group |
| `POST` | `/api/sku-groups/:id/items` | Add SKU(s) to group |
| `DELETE` | `/api/sku-groups/:id/items/:skuId` | Remove SKU from group |

### Pricing — `/api/pricing`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/pricing` | List fee schedules |
| `POST` | `/api/pricing/lookup` | Look up effective price for a HCPC / hospital / vendor. Returns contract → GPO → Medicare → manual waterfall result |
| `POST` | `/api/pricing/fee-schedules` | Create fee schedule |
| `PUT` | `/api/pricing/fee-schedules/:id` | Update fee schedule |
| `DELETE` | `/api/pricing/fee-schedules/:id` | Delete fee schedule |
| `GET` | `/api/pricing/medicare-rates` | List Medicare fee schedule rates |
| `POST` | `/api/pricing/medicare-rates` | Bulk upsert Medicare rates |

### Formulary (per-facility approved items) — `/api/formulary`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/formulary` | List formulary items. Query: `hospitalId`, `facilityId` |
| `POST` | `/api/formulary` | Add item to formulary |
| `GET` | `/api/formulary/:id` | Get item |
| `PUT` | `/api/formulary/:id` | Update item |
| `DELETE` | `/api/formulary/:id` | Remove from formulary |
| `GET` | `/api/formulary/check` | Check if a HCPC is on formulary for a given facility |

### Point-of-Use Capture — `/api/point-of-use`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/point-of-use` | List POU capture records |
| `POST` | `/api/point-of-use` | Record a POU consumption event |
| `GET` | `/api/point-of-use/:id` | Get POU record |

### Cross-Site Inventory Reporting — `/api/reporting/cross-site-inventory`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reporting/cross-site-inventory` | Unified inventory view across all sites for a hospital system |

### Substitutions — `/api/substitutions`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/substitutions` | List substitution proposals |
| `POST` | `/api/substitutions` | Propose a substitution |
| `GET` | `/api/substitutions/:id` | Get proposal |
| `PUT` | `/api/substitutions/:id/approve` | Approve substitution |
| `PUT` | `/api/substitutions/:id/reject` | Reject substitution |
| `GET` | `/api/substitutions/audit-log` | View substitution governance audit log |

### Item Master Hygiene — `/api/item-master-hygiene`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/item-master-hygiene/issues` | List duplicate / inconsistent items |
| `POST` | `/api/item-master-hygiene/resolve/:id` | Mark issue resolved |
| `POST` | `/api/item-master-hygiene/merge` | Merge two duplicate item records |

### Spend Calculator — `/api/spend-calculator`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/spend-calculator/calculate` | Calculate projected spend for an item basket |

---

## 13. Lab Portal

Mount: `/api/labs`  
Mount: `/api/lab-inventory`  
Mount: `/api/lab-movements`  
Mount: `/api/backorders`

### Labs (Groups, Kit Sites, Orders) — `/api/labs`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/labs` | List lab configurations |
| `POST` | `/api/labs` | Create lab |
| `GET` | `/api/labs/:id` | Get lab |
| `PUT` | `/api/labs/:id` | Update lab |
| `DELETE` | `/api/labs/:id` | Delete lab |
| `GET` | `/api/labs/:id/groups` | List lab order groups |
| `POST` | `/api/labs/:id/groups` | Create lab order group |
| `GET` | `/api/labs/:id/kit-sites` | List kit sites |
| `POST` | `/api/labs/:id/kit-sites` | Add kit site |
| `GET` | `/api/labs/:id/orders` | List lab orders for this lab |
| `GET` | `/api/labs/:id/inventory` | Lab-scoped inventory snapshot |

### Lab Inventory (Items, Lots, Movements) — `/api/lab-inventory`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/lab-inventory` | List lab inventory items |
| `POST` | `/api/lab-inventory` | Create inventory item |
| `GET` | `/api/lab-inventory/:id` | Get item |
| `PUT` | `/api/lab-inventory/:id` | Update item |
| `DELETE` | `/api/lab-inventory/:id` | Delete item |
| `POST` | `/api/lab-inventory/:id/lots` | Create lot for item |
| `GET` | `/api/lab-inventory/:id/lots` | List lots |
| `POST` | `/api/lab-inventory/:id/lots/:lotId/movements` | Record stock movement (RECEIVE, CONSUME, EXPIRE, ADJUST, TRANSFER) |
| `GET` | `/api/lab-inventory/:id/lots/:lotId/movements` | List movements for a lot |

### Lab Movement Search — `/api/lab-movements`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/lab-movements` | Search movements across labs. Query: `labId`, `itemId`, `movementType`, `startDate`, `endDate`, `limit` |

### Backorders — `/api/backorders`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/backorders` | List backorder records |
| `POST` | `/api/backorders` | Create backorder flag |
| `GET` | `/api/backorders/:id` | Get backorder |
| `PUT` | `/api/backorders/:id` | Update backorder |
| `POST` | `/api/backorders/:id/resolve` | Resolve backorder (stock received / order filled) |

---

## 14. DME / DMEPOS

Mount: `/api/dme-documents`  
Mount: `/api/dme-bundle`  
Mount: `/api/lcd`  
Mount: `/api/dmepos-compliance`  
Mount: `/api/dme-rental-periods`  
Mount: `/api/prior-auths`  
Mount: `/api/hcpc-codes`  
Mount: `/api/icd10-codes`

### DME Documents — `/api/dme-documents`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dme-documents` | List DME documents for an order. Query: `orderId` |
| `POST` | `/api/dme-documents` | Upload DME document (PAR, LON, CMN, prescription, etc.) |
| `GET` | `/api/dme-documents/:id` | Get document metadata + signed download URL |
| `PUT` | `/api/dme-documents/:id` | Update document metadata |
| `DELETE` | `/api/dme-documents/:id` | Delete document |
| `POST` | `/api/dme-documents/:id/sign` | Submit e-signature on document (creates consent record) |

### DME Claim Bundle — `/api/dme-bundle`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/dme-bundle/generate` | Generate claim-ready bundle PDF for an order. Body: `{ orderId }` |
| `GET` | `/api/dme-bundle/:orderId` | Download the most recent generated bundle for an order |

### LCD (Local Coverage Determinations) — `/api/lcd`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/lcd` | List LCD policies. Query: `hcpcCode`, `mac`, `state` |
| `GET` | `/api/lcd/:id` | Get LCD detail + qualifying criteria |
| `POST` | `/api/lcd/check` | Run an order against all applicable LCDs. Body: `{ orderId }` → returns `{ covered, missing, checkedAt }` |

### DMEPOS Supplier Compliance — `/api/dmepos-compliance`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dmepos-compliance` | List compliance records for vendors. Query: `vendorId` |
| `POST` | `/api/dmepos-compliance` | Create compliance record |
| `GET` | `/api/dmepos-compliance/:id` | Get record |
| `PUT` | `/api/dmepos-compliance/:id` | Update record (accreditation, license, insurance, NSC dates) |
| `DELETE` | `/api/dmepos-compliance/:id` | Delete record |

### DME Rental Periods — `/api/dme-rental-periods`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dme-rental-periods` | List rental periods. Query: `orderId`, `status` |
| `POST` | `/api/dme-rental-periods` | Create rental period (auto-spawned after order create) |
| `GET` | `/api/dme-rental-periods/:id` | Get rental period |
| `PUT` | `/api/dme-rental-periods/:id` | Update period (billedAt, cappedAt, status) |

### Prior Authorizations — `/api/prior-auths`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/prior-auths` | List prior auths. Query: `orderId`, `status` |
| `POST` | `/api/prior-auths` | Submit PA request |
| `GET` | `/api/prior-auths/:id` | Get PA detail |
| `PUT` | `/api/prior-auths/:id` | Update PA |
| `PUT` | `/api/prior-auths/:id/approve` | Mark PA approved |
| `PUT` | `/api/prior-auths/:id/deny` | Mark PA denied. Body: `{ reason }` |

### HCPC Codes — `/api/hcpc-codes`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hcpc-codes` | Search HCPC codes. Query: `q`, `limit` |
| `GET` | `/api/hcpc-codes/:code` | Get HCPC code detail |

### ICD-10 Codes — `/api/icd10-codes`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/icd10-codes` | Search ICD-10 codes. Query: `q`, `limit` |
| `GET` | `/api/icd10-codes/:code` | Get ICD-10 code detail |

---

## 15. Procurement

Mount: `/api/requisitions`  
Mount: `/api/requisition-templates`  
Mount: `/api/purchase-orders`  
Mount: `/api/customer-purchase-orders`  
Mount: `/api/goods-receipts`  
Mount: `/api/three-way-match`  
Mount: `/api/rmas`  
Mount: `/api/consignment`  
Mount: `/api/recalls`  
Mount: `/api/compliance-alerts`  
Mount: `/api/logistics`  
Mount: `/api/controlled-substance`

### Requisitions — `/api/requisitions`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/requisitions` | List requisitions |
| `POST` | `/api/requisitions` | Create requisition |
| `GET` | `/api/requisitions/:id` | Get requisition + line items |
| `PUT` | `/api/requisitions/:id` | Update requisition |
| `DELETE` | `/api/requisitions/:id` | Delete requisition |
| `POST` | `/api/requisitions/:id/submit` | Submit for approval |
| `POST` | `/api/requisitions/:id/convert-to-po` | Convert approved requisition to a Purchase Order |

### Requisition Templates — `/api/requisition-templates`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/requisition-templates` | List templates |
| `POST` | `/api/requisition-templates` | Create template |
| `GET` | `/api/requisition-templates/:id` | Get template |
| `PUT` | `/api/requisition-templates/:id` | Update template |
| `DELETE` | `/api/requisition-templates/:id` | Delete template |
| `POST` | `/api/requisition-templates/:id/create-requisition` | Instantiate a requisition from template |

### Purchase Orders — `/api/purchase-orders`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/purchase-orders` | List POs. Tenant-scoped: hospital sees own, vendor sees incoming, admin sees all |
| `GET` | `/api/purchase-orders/:id` | Get PO + line items |
| `POST` | `/api/purchase-orders` | Create PO. Body: `{ vendorId, hospitalId?, items[], date?, status? }` |
| `PUT` | `/api/purchase-orders/:id` | Update PO (non-transmission fields) |
| `DELETE` | `/api/purchase-orders/:id` | Delete PO + its line items |
| `POST` | `/api/purchase-orders/:id/transmit` | Transmit PO to vendor. Body: `{ method?: 'EDI'\|'API'\|'PUNCHOUT'\|'EMAIL'\|'PORTAL' }` |
| `POST` | `/api/purchase-orders/:id/ack` | Vendor acknowledges PO receipt (SENT → ACKED) |
| `GET` | `/api/purchase-orders/:id/transmission-log` | View transmission attempt history |
| `GET` | `/api/purchase-orders/:id/export.csv` | Download PO line items as CSV |

### Customer Purchase Orders — `/api/customer-purchase-orders`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/customer-purchase-orders` | List customer POs |
| `POST` | `/api/customer-purchase-orders` | Create customer PO |
| `GET` | `/api/customer-purchase-orders/:id` | Get customer PO |
| `PUT` | `/api/customer-purchase-orders/:id` | Update |
| `DELETE` | `/api/customer-purchase-orders/:id` | Delete |

### Goods Receipts — `/api/goods-receipts`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/goods-receipts` | List GRNs |
| `POST` | `/api/goods-receipts` | Create GRN against a PO |
| `GET` | `/api/goods-receipts/:id` | Get GRN |
| `PUT` | `/api/goods-receipts/:id` | Update GRN |
| `DELETE` | `/api/goods-receipts/:id` | Delete GRN |
| `POST` | `/api/goods-receipts/:id/lines` | Add/update line items |
| `GET` | `/api/goods-receipts/:id/lines` | List line items |

### 3-Way Matching — `/api/three-way-match`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/three-way-match` | List match results. Query: `invoiceId`, `matchStatus` |
| `POST` | `/api/three-way-match/run` | Run 3-way matching for an invoice. Body: `{ invoiceId }` |
| `GET` | `/api/three-way-match/:id` | Get match result detail |
| `PUT` | `/api/three-way-match/:id/resolve` | Manually resolve exception. Body: `{ resolution, reason }` |

### RMAs — `/api/rmas`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rmas` | List RMAs |
| `POST` | `/api/rmas` | Create RMA (auto-spawned from damaged GR lines) |
| `GET` | `/api/rmas/:id` | Get RMA |
| `PUT` | `/api/rmas/:id` | Update RMA |
| `POST` | `/api/rmas/:id/approve` | Approve RMA |
| `POST` | `/api/rmas/:id/receive` | Record returned goods receipt |

### Consignment — `/api/consignment`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/consignment` | List consignment agreements |
| `POST` | `/api/consignment` | Create consignment agreement |
| `GET` | `/api/consignment/:id` | Get agreement |
| `PUT` | `/api/consignment/:id` | Update agreement |
| `DELETE` | `/api/consignment/:id` | Delete agreement |

### Recalls — `/api/recalls`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/recalls` | List recall notices |
| `POST` | `/api/recalls` | Create recall notice |
| `GET` | `/api/recalls/:id` | Get recall |
| `PUT` | `/api/recalls/:id` | Update recall |
| `POST` | `/api/recalls/:id/notify` | Fan out notifications to affected parties |

### Compliance Alerts — `/api/compliance-alerts`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/compliance-alerts` | List compliance alerts (vendor accreditation, license, insurance, lab lot expiry) |
| `GET` | `/api/compliance-alerts/:id` | Get alert detail |
| `PUT` | `/api/compliance-alerts/:id/resolve` | Mark alert resolved |

### Logistics / Cold-Chain — `/api/logistics`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/logistics` | List logistics records |
| `POST` | `/api/logistics` | Create record (temperature monitoring, special handling) |
| `GET` | `/api/logistics/:id` | Get record |
| `PUT` | `/api/logistics/:id` | Update (temperature readings, threshold breach) |

### Controlled Substance — `/api/controlled-substance`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/controlled-substance` | List controlled substance accountability records |
| `POST` | `/api/controlled-substance` | Create record |
| `GET` | `/api/controlled-substance/:id` | Get record |
| `PUT` | `/api/controlled-substance/:id` | Update record (dispensed, waste, balance) |

---

## 16. Financial — Budgets & GL

Mount: `/api/budgets`  
Mount: `/api/reporting/department-spend`  
Mount: `/api/reporting/gl`

### Budgets — `/api/budgets`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/budgets` | List budgets. Query: `hospitalId`, `departmentId`, `fiscalYear` |
| `POST` | `/api/budgets` | Create budget. Body: `{ hospitalId, departmentId, fiscalYear, period, amountUsd }` |
| `PUT` | `/api/budgets/:id` | Update budget |
| `DELETE` | `/api/budgets/:id` | Delete budget |
| `GET` | `/api/budgets/:id/history` | View budget revision history |
| `POST` | `/api/budgets/check` | Check if a pending spend would exceed budget. Body: `{ departmentId, fiscalYear, amountUsd }` |

### Department Spend — `/api/reporting/department-spend`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reporting/department-spend` | Department spend rollup with budget burn-down. Query: `hospitalId`, `fiscalYear`, `fiscalPeriod` |

### GL Reporting — `/api/reporting/gl`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reporting/gl/entries` | List GL entries. Query: `hospitalId`, `fiscalYear`, `fiscalPeriod`, `sourceType`, `unexported=1` (max 2000) |
| `GET` | `/api/reporting/gl/export.csv` | Export GL entries to CSV (max 5000, same filters, ERP-importable) |
| `POST` | `/api/reporting/gl/mark-exported` | Stamp exportedAt on a set of GL entries. Body: `{ ids: [] }` (Admin only) |

---

## 17. Contracts & Pricing

Mount: `/api/contracts`  
Mount: `/api/gpo`  
Mount: `/api/payors`

### Contracts — `/api/contracts`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/contracts` | List contracts. Query: `hospitalId`, `vendorId`, `status` |
| `POST` | `/api/contracts` | Create contract |
| `GET` | `/api/contracts/:id` | Get contract |
| `PUT` | `/api/contracts/:id` | Update contract |
| `DELETE` | `/api/contracts/:id` | Delete contract |
| `POST` | `/api/contracts/:id/items` | Add line item |
| `GET` | `/api/contracts/:id/items` | List line items |
| `PUT` | `/api/contracts/:id/items/:itemId` | Update line item |
| `DELETE` | `/api/contracts/:id/items/:itemId` | Remove line item |
| `POST` | `/api/contracts/:id/activate` | Activate contract (APPROVED → ACTIVE) |
| `POST` | `/api/contracts/:id/expire` | Force-expire contract |

**Contract lifecycle states:** `DRAFT → SUBMITTED → APPROVED → ACTIVE → EXPIRING_SOON → EXPIRED`

### GPO — `/api/gpo`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/gpo` | List GPO organizations |
| `POST` | `/api/gpo` | Create GPO |
| `GET` | `/api/gpo/:id` | Get GPO |
| `PUT` | `/api/gpo/:id` | Update GPO |
| `DELETE` | `/api/gpo/:id` | Delete GPO |
| `GET` | `/api/gpo/:id/members` | List member hospitals |
| `POST` | `/api/gpo/:id/members` | Add hospital member |
| `DELETE` | `/api/gpo/:id/members/:hospitalId` | Remove member |
| `GET` | `/api/gpo/:id/contracts` | List GPO contracts |

### Payors — `/api/payors`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/payors` | List payors (insurance companies) |
| `POST` | `/api/payors` | Create payor |
| `GET` | `/api/payors/:id` | Get payor |
| `PUT` | `/api/payors/:id` | Update payor |
| `DELETE` | `/api/payors/:id` | Delete payor |

---

## 18. Reporting & Analytics

Mount: `/api/reports` (reporting.ts)  
Mount: `/api/reporting` (procurementAnalytics.ts)  
Mount: `/api/forecasting`

### Core Reports — `/api/reports`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reports/spend-by-vendor` | Invoice spend grouped by vendor |
| `GET` | `/api/reports/spend-by-hcpc` | Invoice spend grouped by HCPC code (top 10) |
| `GET` | `/api/reports/spend-by-month` | Monthly spend trend (last 12 months) |
| `GET` | `/api/reports/spend-by-physician` | Spend grouped by ordering physician |
| `GET` | `/api/reports/spend-by-facility` | Spend grouped by hospital facility |
| `GET` | `/api/reports/spend-by-department` | Spend grouped by department |
| `GET` | `/api/reports/orders-by-status` | Order counts grouped by status/sub-status |
| `GET` | `/api/reports/orders-by-vendor` | Order counts grouped by vendor |
| `GET` | `/api/reports/vendor-kpis` | Per-vendor KPIs: fill rate, avg response time, cancellations |
| `GET` | `/api/reports/vendor-scorecard` | Full vendor scorecard: on-time %, QC pass %, compliance %, SLA breaches |
| `GET` | `/api/reports/executive-summary` | High-level totals: orders, spend, active vendors/hospitals, this-month stats |
| `GET` | `/api/reports/unbilled-transactions` | Completed orders without an invoice (revenue leakage) |
| `GET` | `/api/reports/orders-modified` | Orders in `ORDER_REQUESTED_FOR_MODIFY` by vendor |
| `GET` | `/api/reports/orders-cancelled` | Cancelled orders by vendor |
| `GET` | `/api/reports/multi-site-rollup` | Cross-facility spend + exception count scorecard |
| `GET` | `/api/reports/contract-leakage` | Invoice lines priced above best available contract/GPO rate |
| `GET` | `/api/reports/compliance/users` | User compliance audit: MFA status, PHI consent, last login |
| `GET` | `/api/reports/compliance/credentials` | Vendor credential expiry: accreditation, license, insurance |
| `GET` | `/api/reports/compliance/network-access` | Recent login activity (last 100) |
| `GET` | `/api/reports/:reportType/csv` | Generic CSV export. `reportType`: `spend-by-vendor`, `unbilled`, `compliance-users` |
| `GET` | `/api/reports/orders.xlsx` | Orders XLSX export (max 10,000 rows) |
| `GET` | `/api/reports/invoices.xlsx` | Invoices XLSX export (max 10,000 rows) |
| `GET` | `/api/reports/spend.xlsx` | Spend analysis XLSX. Query: `groupBy=vendor\|month\|hcpc` |

### Procurement Analytics — `/api/reporting`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reporting/price-variance` | Price variance analysis vs. contract rates |
| `GET` | `/api/reporting/charge-capture-leakage` | Charge capture gap analysis |

### Demand Forecasting — `/api/forecasting`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/forecasting` | List forecast runs |
| `POST` | `/api/forecasting/run` | Trigger a new forecast computation. Body: `{ hospitalId, horizonDays }` |
| `GET` | `/api/forecasting/:id` | Get forecast results |

---

## 19. Administration

Mount: `/api/admin`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/pending-users` | List users with `approvalStatus = PENDING` |
| `PUT` | `/api/admin/users/:id/approve` | Approve user + send welcome email |
| `PUT` | `/api/admin/users/:id/reject` | Reject user. Body: `{ reason? }` |
| `GET` | `/api/admin/stats` | Platform-wide stats: users by type, orders by status, vendor/hospital counts |
| `GET` | `/api/admin/phi-access-log` | HIPAA §164.312(b) PHI access audit log. Query: `userId`, `resourceType`, `startDate`, `endDate`, `limit`, `offset` |
| `GET` | `/api/admin/file-access-log` | File-layer audit log. Query: `userId`, `fileKind`, `orderId`, `hospitalId`, `vendorId`, `fromDate`, `toDate` |
| `GET` | `/api/admin/phi-consent-log` | PHI access-consent acknowledgement log |
| `GET` | `/api/admin/oig/count` | Count of OIG LEIE records in local database |
| `GET` | `/api/admin/oig/search` | Search local LEIE. Query: `q` (name/NPI/EIN), `limit` |
| `POST` | `/api/admin/oig/screen` | Screen a single entity. Body: `{ npi?, ein?, lastName?, businessName? }` |
| `GET` | `/api/admin/oig/last-refresh` | Timestamp of last OIG LEIE sync |
| `POST` | `/api/admin/oig/refresh` | Manually trigger OIG LEIE refresh (async) |
| `GET` | `/api/admin/state-rates` | List state Medicaid rate schedule items. Query: `state`, `hcpc`, `limit`, `offset` |
| `POST` | `/api/admin/state-rates` | Bulk upsert state rate items. Body: `{ items: [{ stateCode, hcpcCode, rate, ... }] }` |
| `DELETE` | `/api/admin/state-rates` | Clear state rates. Query: `state` (omit to clear all) |
| `POST` | `/api/admin/upload-medicare` | Upload Medicare fee schedule CSV (multipart `file` field) |
| `POST` | `/api/admin/cron/run-sla-monitor` | Manually trigger the order SLA breach monitor |
| `POST` | `/api/admin/cron/run-event-wait-sweep` | Manually trigger workflow event-wait timeout sweep |
| `POST` | `/api/admin/cron/run-kit-letter-sync` | Manually trigger kit-letter catalog sync. Body: `{ dryRun?: boolean }` |
| `POST` | `/api/admin/utils/fernet-roundtrip` | Test Fernet encryption round-trip. Body: `{ plaintext, key? }` |
| `POST` | `/api/admin/utils/hl7-parse` | Parse an HL7 barcode segment. Body: `{ barcode }` |
| `POST` | `/api/admin/utils/hmac-sign` | Compute HMAC webhook headers for testing. Body: `{ body, secretEnv? }` |

---

## 20. AI

Mount: `/api/ai`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ai/extract-order` | AI-powered medical order extraction (Workers AI Llama 3.2 Vision). Body: multipart PDF/image → structured order fields |
| `POST` | `/api/ai/extract-lab-order` | AI extraction specialized for lab order forms |

---

## 21. FHIR / EHR Integration

Mount: `/api/fhir`  
Mount: `/api/ehr`

### FHIR Endpoints — `/api/fhir`

> Most endpoints require a valid SMART token for the target connection. The `cds-hooks-prefill` endpoint uses system-mode Backend Services (no per-user token needed).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/fhir/authorize-url` | Bearer JWT | Get the SMART on FHIR authorization URL for a connection. Query: `connectionId` |
| `GET` | `/api/fhir/token-status` | Bearer JWT | Check SMART token validity. Query: `connectionId` |
| `GET` | `/api/fhir/smart-config` | Bearer JWT | Return cached SMART configuration for a connection. Query: `connectionId` |
| `GET` | `/api/fhir/:connectionId/callback` | None (OAuth) | OAuth 2.0 redirect callback; exchanges code for token |
| `GET` | `/api/fhir/:connectionId/patient/:patientId` | SMART token | Read a single FHIR Patient |
| `GET` | `/api/fhir/:connectionId/launch-context-prefill` | SMART token | Aggregate prefill: Patient + Encounter + Coverages + Conditions. Query: `patientId`, `encounterId?`, `fhirUser?` |
| `GET` | `/api/fhir/:connectionId/encounter/:encounterId` | SMART token | Read a single FHIR Encounter |
| `GET` | `/api/fhir/:connectionId/encounter` | SMART token | List active encounters for a patient. Query: `patient` |
| `GET` | `/api/fhir/:connectionId/coverage` | SMART token | List coverages for a patient. Query: `patient` |
| `GET` | `/api/fhir/:connectionId/condition` | SMART token | List active conditions for a patient. Query: `patient` |
| `GET` | `/api/fhir/:connectionId/practitioner/:practitionerId` | SMART token | Read a single Practitioner (falls back to KV cache) |
| `GET` | `/api/fhir/cds-hooks-prefill` | Bearer JWT | CDS Hooks last-mile prefill via Backend Services. No per-user OAuth required. Query: `patientId`, `encounterId?` |
| `POST` | `/api/fhir/:connectionId/push-document` | Bearer JWT | Write a DocumentReference (DWO/claim PDF) back to Epic chart |
| `POST` | `/api/fhir/:connectionId/push-procedure` | Bearer JWT | Write a Procedure resource (HCPC charge capture) to Epic |
| `POST` | `/api/fhir/:connectionId/mint-keypair` | Bearer JWT | Generate RS384 keypair + JWKS entry for a connection (Admin only) |

### EHR Connections — `/api/ehr`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/ehr/connections` | List EHR connections for the caller's hospital |
| `POST` | `/api/ehr/connections` | Create EHR connection |
| `GET` | `/api/ehr/connections/:id` | Get connection |
| `PUT` | `/api/ehr/connections/:id` | Update connection (fhirBaseUrl, authClientId, authMode, etc.) |
| `DELETE` | `/api/ehr/connections/:id` | Delete connection |
| `GET` | `/api/ehr/connections/:id/sync-status` | Get last sync status from KV |

---

## 22. CDS Hooks (Public)

All CDS Hooks endpoints are **unauthenticated** per the CDS Hooks spec. Mount: `/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/cds-services` | None | Hook discovery endpoint — lists `curavend-dme` (order-select) and `curavend-order-sign` |
| `POST` | `/cds-services/curavend-dme` | None | `order-select` hook: surfaces DME vendor availability cards when DME HCPC codes appear in draft orders |
| `POST` | `/cds-services/curavend-order-sign` | None | `order-sign` hook: intercepts signed DME orders; returns deep-link suggestion card to `/create-dme-order?source=cds-hooks&patientId=...&hcpcs=...` |

**Standard CDS Hooks request body fields:** `hook`, `hookInstance`, `context.draftOrders`, `context.patientId`, `context.encounterId`, `fhirServer`, `fhirAuthorization`

---

## 23. Notifications

Mount: `/api/notifications`  
Mount: `/api/notification-preferences`

### Notifications — `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | List notifications for current user |
| `PUT` | `/api/notifications/:id/read` | Mark notification as read |
| `PUT` | `/api/notifications/read-all` | Mark all notifications as read |
| `DELETE` | `/api/notifications/:id` | Delete notification |

### Notification Preferences — `/api/notification-preferences`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notification-preferences` | Get current user's notification preferences |
| `PUT` | `/api/notification-preferences` | Update preferences. Body: `{ preferences: { eventType: { email, inApp } } }` |

---

## 24. Support Tickets

Mount: `/api/support-tickets`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/support-tickets` | List tickets |
| `POST` | `/api/support-tickets` | Create ticket |
| `GET` | `/api/support-tickets/:id` | Get ticket + messages |
| `PUT` | `/api/support-tickets/:id` | Update ticket (status, priority, assignee) |
| `POST` | `/api/support-tickets/:id/messages` | Add message to ticket thread |

---

## 25. Rooms / Chat

Mount: `/api/rooms`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rooms` | List chat rooms accessible to caller |
| `POST` | `/api/rooms` | Create room |
| `GET` | `/api/rooms/:id` | Get room metadata |
| `GET` | `/api/rooms/:id/messages` | List messages (paginated) |
| `POST` | `/api/rooms/:id/messages` | Send message |

> Real-time delivery uses Cloudflare Durable Objects (`ChatRoom`). The `POST` endpoint enqueues the message; the DO fan-outs the WebSocket push.

---

## 26. Clinical Templates

Mount: `/api/clinical-templates`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/clinical-templates` | List templates |
| `POST` | `/api/clinical-templates` | Create template |
| `GET` | `/api/clinical-templates/:id` | Get template |
| `PUT` | `/api/clinical-templates/:id` | Update template |
| `DELETE` | `/api/clinical-templates/:id` | Delete template |

---

## 27. Workflows

Mount: `/api/workflows`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows` | List workflow instances. Query: `entityType`, `entityId`, `status` |
| `POST` | `/api/workflows` | Start a workflow instance. Body: `{ definitionKey, entityType, entityId, context? }` |
| `GET` | `/api/workflows/:id` | Get instance detail + current step |
| `DELETE` | `/api/workflows/:id` | Delete instance |
| `POST` | `/api/workflows/:id/terminate` | Terminate a running instance |
| `POST` | `/api/workflows/:id/raise-event` | Inject an external event to resume a waiting step. Body: `{ eventName, payload? }` |
| `POST` | `/api/workflows/:id/purge` | Purge a completed/terminated instance |

---

## 28. Subscriptions

*(Also listed under [Invoices & Billing](#10-invoices--billing))*

Mount: `/api/subscriptions`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/subscriptions/status` | Current plan, period end, trial status |
| `POST` | `/api/subscriptions/create-checkout-session` | Create Stripe Checkout session |
| `POST` | `/api/subscriptions/portal-session` | Open Stripe Customer Portal |
| `GET` | `/api/subscriptions/plans` | List available plans + pricing |

---

## 29. Integration Log

Mount: `/api/integrations` — **Admin only**

Operational tooling for monitoring and recovering integration deliveries (ERP connectors, stock feeds, external fulfillment webhooks).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integrations/log` | List integration log entries. Query: `status`, `entityType`, `entityId`, `connector`, `limit`, `offset` |
| `GET` | `/api/integrations/log/:id` | Get a single log entry with full request/response body |
| `POST` | `/api/integrations/log/:id/retry` | Mark a failed entry as `RETRYING` so the 15-min cron picks it up on next sweep |
| `POST` | `/api/integrations/log/:id/abort` | Mark entry as `TERMINAL_FAILURE` (give up). Body: `{ reason? }` |

---

## 30. Uploads

Mount: `/api/uploads`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/uploads` | Upload file to R2. `Content-Type: multipart/form-data`. Returns `{ key, url }` |
| `GET` | `/api/uploads/:key` | Generate signed download URL for R2 object |
| `DELETE` | `/api/uploads/:key` | Delete R2 object |

---

## 30. Utility

Mount: `/api/utility`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/utility/address-lookup` | Look up address details. Query: `q` (autocomplete) |
| `GET` | `/api/utility/npi-lookup` | NPI Registry lookup. Query: `npi`, `name` |
| `GET` | `/api/utility/drug-lookup` | Drug/NDC lookup. Query: `q` |

---

## 31. Search

Mount: `/api/search`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search` | Universal full-text search across entities. Query: `q`, `types` |
| `GET` | `/api/search/vendors` | Vendor search |
| `GET` | `/api/search/items` | Catalog/inventory item search |
| `GET` | `/api/search/orders` | Order search |
| `GET` | `/api/search/patients` | Patient name search |

---

## 32. Infrastructure & Public Endpoints

### JWKS (SMART Backend Services) — public

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/.well-known/jwks.json` | None | JSON Web Key Set for SMART on FHIR Backend Services JWT validation |

### External Fulfillment Webhooks — public

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/external/fulfillment/webhook` | HMAC sig | Inbound webhook from external fulfillment vendors |

### OpenAPI / Swagger UI

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/doc` | None | Swagger UI for browsing the OpenAPI spec |
| `GET` | `/api/openapi.json` | None | Raw OpenAPI 3.1 schema |

---

## 33. Background Jobs (Cron)

All cron jobs run inside the Worker's `scheduled()` handler. Cron schedules from `wrangler.toml`:

### Every 15 minutes (`*/15 * * * *`)

| Job | Function | Description |
|-----|----------|-------------|
| Workflow event-wait sweep | `sweepExpiredEventWaits` | Expire workflow steps that timed out waiting for an external event |
| Delayed order notifier | `handleDelayedOrderNotifications` | Send notifications for orders overdue on status transitions |
| Integration retry sweep | `handleIntegrationRetry` | Retry failed integration deliveries from the dead-letter queue |
| Vendor stock poller | `runAllStockPolls` | Poll all active vendor stock-feed connectors for inventory updates |

### Daily at 08:00 UTC (`0 8 * * *`)

| Job | Function | Description |
|-----|----------|-------------|
| Contract/license expiry | `handleExpiryNotifications` | Notify about upcoming or expired contracts and licenses |
| Contract lifecycle | `handleContractLifecycle` | APPROVED→ACTIVE transitions, ACTIVE→EXPIRED, expiring-soon reminders |
| Recurring order spawner | `handleRecurringOrderSpawner` | Clone template orders into child orders when lead time threshold is reached |
| Order SLA monitor | `handleOrderSlaMonitor` | Detect and notify about SLA breaches (3 supply + 2 lab checks) |
| Kit letter sync | `handleKitLetterSync` | Sync athome kit-letter catalog |
| DME rental billing | `handleRentalBilling` | Bill the next rental period for active DME rental orders |
| DMEPOS expiry sweep | `handleDmeposExpiry` | Notify about expiring vendor DMEPOS accreditation/compliance docs |
| Lab auto-replenishment | `handleLabAutoReplenishment` | Create purchase requisitions for lab items below reorder threshold |
| Lab expiration sweep | `handleLabExpiration` | Flag and notify on expiring lab lot inventory |
| Compliance alert sweep | `sweepComplianceAlerts` | Generate/resolve compliance alerts for vendor credentials and lab lots |
| Practitioner sync | `handlePractitionerSync` | Sync Epic Practitioner directory into KV for NPI lookups (Backend Services) |
| Vendor scorecard compute | `computeVendorScorecards` | Recompute all vendor performance scorecards |

### Monthly on the 1st at 06:00 UTC (`0 6 1 * *`)

| Job | Function | Description |
|-----|----------|-------------|
| OIG LEIE refresh | `handleOigRefresh` | Download and ingest the CMS OIG exclusion list into D1 |

---

## 34. Queue Events

The Worker consumes messages from a Cloudflare Queue. Queue message format: `{ type: string, payload: any }`

| Event Type | Handler | Trigger |
|------------|---------|---------|
| `order.created` | `handleOrderCreated` | New order saved → email/notification fan-out |
| `order.status_changed` | `handleOrderStatusChanged` | Order status/sub-status transition |
| `order.shipped` | `handleOrderShipped` | Shipment record created |
| `order.delivered` | `handleOrderDelivered` | Delivery confirmed |
| `chat.new_message` | `handleChatMessage` | Chat room message via Durable Object |
| `invoice.created` | `handleInvoiceCreated` | Invoice generated → notification to hospital |
| `invoice.sent` | `handleInvoiceSent` | Invoice emailed → notification |
| `invoice.paid` | `handleInvoicePaid` | Payment confirmed → notification |
| `workflow.step` | `runWorkflowStep` | Async workflow step execution (WF control plane) |

---

## Appendix A — Permission Resources

The RBAC system protects the following resource identifiers (checked by `requirePermission(resource, action)`):

| Resource | Actions |
|----------|---------|
| `orders` | `READ`, `WRITE`, `FULL` |
| `invoices` | `READ`, `WRITE`, `FULL` |
| `vendors` | `READ`, `WRITE`, `FULL` |
| `inventory` | `READ`, `WRITE`, `FULL` |
| `reports` | `READ`, `FULL` |
| `admin` | `READ`, `FULL` |
| `purchase-orders` | `READ`, `WRITE`, `FULL` |
| `budgets` | `READ`, `WRITE`, `FULL` |
| `gl-ledger` | `READ`, `FULL` |
| `compliance-alerts` | `READ`, `WRITE`, `FULL` |
| `substitutions` | `READ`, `WRITE`, `FULL` |
| `recalls` | `READ`, `WRITE`, `FULL` |

---

## Appendix B — Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Missing or invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid Bearer token |
| 403 | `FORBIDDEN` | Authenticated but not permitted for this tenant/resource |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate or conflicting state |
| 500 | `INTERNAL_ERROR` | Unhandled server error |

---

## Appendix C — User Roles

| Role | Persona |
|------|---------|
| `ACCOUNT_MANAGER` | Platform admin (Curavend team) |
| `ACCOUNT_MANAGER_USER` | Platform admin sub-user |
| `HOSPITAL_ADMIN` | Hospital administrator |
| `HOSPITAL_USER` | Hospital staff |
| `VENDOR_ADMIN` | Vendor administrator |
| `VENDOR_USER` | Vendor staff |
| `PROVIDER_ADMIN` | Provider/physician admin |
| `PROVIDER_USER` | Provider staff |
| `SUPER_VENDOR_ADMIN` | Super-vendor administrator |
| `SUPER_VENDOR_USER` | Super-vendor staff |
| `LAB_ADMIN` | Lab administrator |

---

*End of API Reference — 87 route files, 1 inline health check, 3 cron schedules, 9 queue event types.*

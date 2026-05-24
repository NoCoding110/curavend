# src/routes/

One Hono app per resource. Mounted in `src/index.ts` under a stable URL
prefix. Each file owns its own docblock listing endpoints + state semantics.

## Authentication

Every route is wrapped by `middleware/auth.ts` at the index level except
the explicit `PUBLIC_PATHS` / `PUBLIC_PREFIXES` allowlist (login, signup,
health, webhook receivers). Authed routes get `c.get('user')` populated
with `{ id, role, hospitalId?, vendorId?, labGroupId?, userType, ... }`.

## Permissions

Routes that mutate or read tenant data wrap handlers with:

```typescript
app.get('/', requirePermission('resource-name', 'READ'), async (c) => { … })
```

23 resource names, 4 permission levels. Admin + facility-manager roles
auto-FULL inside the middleware. Group grants merged on top of user grants.

## Tenant scoping

List endpoints filter by `user.hospitalId` / `user.vendorId` / `user.labGroupId`
based on persona. Per-id endpoints call an `assertOwns<Resource>()` helper
that joins through to the parent tenant column before returning.

## Routes

### Authentication & users
- `auth.ts` — login, signup, MFA enroll/verify, password reset
- `users.ts` — user CRUD, role management, tenant attach
- `userGroups.ts` — group membership + per-group permission grants
- `authAuditLog.ts` — read-only access log
- `phiAccessLog.ts` — HIPAA PHI access log

### Hospital & org
- `hospitals.ts` — hospital CRUD
- `hospitalFacilities.ts` — facility CRUD per hospital
- `hospitalDepartments.ts` — dept CRUD with cost_center/glCode/serviceLine
- `physicians.ts` — physician CRUD per hospital
- `providers.ts` — provider org CRUD
- `vendors.ts` — vendor CRUD
- `vendorLocations.ts` — vendor warehouse locations
- `vendorCoverage.ts` — per-vendor coverage zones
- `superVendors.ts` — parent vendor org
- `hospitalVendors.ts` — facility ↔ vendor link table (auth + routing)

### Orders
- `orders.ts` — order CRUD + state machine + routing
- `orderShipments.ts` — per-shipment tracking, POD, cold-chain
- `customerPurchaseOrders.ts` — customer-side PO upload
- `purchaseOrders.ts` — internal PO with transmission state machine
- `requisitions.ts` — requisition workflow (incl. emergency fast-lane)
- `requisitionTemplates.ts` — reusable requisition templates
- `approvalRules.ts` — approval routing rules engine
- `approvals.ts` — pending-approval queue + actions
- `backorders.ts` — partial-fill tracking + triage + substitute suggestions
- `recurrence.ts` — recurring-order schedules
- `bulkTracking.ts` — bulk view of all shipments

### Inventory
- `inventory.ts` — hospital inventory (non-lab)
- `labInventory.ts` — lab consumables + lots + FEFO issuance + reorder
- `labMovementSearch.ts` — audit log search across all lab stock movements
- `crossSiteInventory.ts` — pivoted SKU × site stock view
- `inventoryTransfers.ts` — hospital-side facility-to-facility transfers
- `pointOfUse.ts` — bedside consumption capture + encounter attribution
- `consignment.ts` — consigned-stock tracking

### Receiving & billing
- `goodsReceipts.ts` — GRN flow w/ auto-spawn of backorders + RMAs
- `threeWayMatching.ts` — PO + GRN + invoice match
- `invoiceMatchRules.ts` — auto-resolution tolerance bands
- `invoices.ts` — invoice CRUD + send + mark-paid + GL auto-post
- `billing.ts` — billing summary aggregations
- `rmas.ts` — return material authorization workflow

### Finance & compliance
- `budgets.ts` — budget CRUD + encumbrance accounting
- `glReporting.ts` — GL ledger viewer + CSV export + mark-exported
- `complianceAlerts.ts` — pre-expiry alert dashboard
- `controlledSubstance.ts` — DEA Schedule II–V chain of custody
- `recalls.ts` — manufacturer recall intake + affected-item disposition
- `substitutions.ts` — substitution audit log with governance gate
- `oig.ts` — OIG LEIE screening
- `dmeposCompliance.ts` — DMEPOS supplier compliance tracker
- `dmeDocuments.ts` — DME document packet (DWO, PA, etc.)
- `dmeRentalPeriods.ts` — capped-rental period tracking
- `dmeBundle.ts` — claim-ready bundle generator
- `lcd.ts` — CMS LCD ingestion + auto-evaluation
- `priorAuths.ts` — prior authorization workflow

### Reporting
- `reporting.ts` — XLSX exports (orders, invoices, spend)
- `departmentSpend.ts` — per-dept burn-down vs budget
- `procurementAnalytics.ts` — charge capture, price variance, clinical
  consumption, hospital forecast, vendor scorecards
- `forecasting.ts` — legacy forecasting endpoint
- `multiSiteSpend.ts` — cross-site spend dashboard
- `contractLeakage.ts` — off-contract purchasing detection

### Catalog & contracts
- `contracts.ts` — contract CRUD + lifecycle
- `contractItems.ts` — line-item editor
- `contractRevisions.ts` — revision history
- `gpo.ts` — GPO organization + contract item CRUD
- `payors.ts` — payor + contract item CRUD
- `formulary.ts` — item master + substitute resolver + decision endpoint
- `itemMasterHygiene.ts` — duplicates / missing fields / unmapped report
- `hcpcCodes.ts` — HCPC code lookup
- `icd10Codes.ts` — ICD-10 code lookup
- `skuCatalog.ts` — vendor SKU catalog
- `skuGroups.ts` — SKU grouping for ordering
- `vendorSkus.ts` — per-vendor SKU CRUD
- `vendorErpConnectors.ts` — ERP sync configuration
- `vendorStockConnectors.ts` — vendor stock feed config
- `vendorStockSnapshots.ts` — periodic stock snapshots

### Lab portal
- `labs.ts` — lab order CRUD + workflow + auto-consume hook
- `labOrders.ts` — alias of labs (legacy)
- `labGroups.ts` — lab group CRUD
- `labKitSites.ts` — kit-site CRUD
- `kitLetters.ts` — pre-uploaded kit-letter assets

### Vendor portal & lifecycle
- `vendorOnboarding.ts` — 7-state onboarding kanban
- `logistics.ts` — shipment list + temp ingestion + ETA
- `chat.ts` — Durable Object backed WebSocket chat
- `notifications.ts` — notification CRUD
- `notificationPreferences.ts` — per-user opt-ins

### Admin & infra
- `workflows.ts` — CCID workflow control plane
- `integrationLog.ts` — third-party API call log
- `fileAccessLog.ts` — R2 download log (HIPAA)
- `subscription.ts` — subscription plan management
- `ehr.ts` — EHR FHIR adapter
- `uploads.ts` — R2 upload endpoint (signed URLs)
- `health.ts` — readiness probe
- `webhooks.ts` — incoming webhook receivers (Stripe, etc.)

## Adding a new route

1. Create `src/routes/myFeature.ts` with a Hono app
2. Add `requirePermission(<resource>, <level>)` to each handler
3. Add tenant-scope filters in queries
4. Import + mount in `src/index.ts`:
   ```typescript
   import myFeatureRoutes from './routes/myFeature';
   app.route('/api/my-feature', myFeatureRoutes);
   ```
5. If you introduced a new resource, add it to:
   - `packages/db/src/schema/userPermissions.ts` → `PERMISSION_RESOURCES`
   - `packages/web/src/api/userPermissions.ts` → same array
   - `packages/web/src/hooks/usePermissions.ts` → `EMPTY_MAP`
   - `packages/web/src/features/hospitalManagement/components/PermissionsMatrix.tsx` → `RESOURCE_LABEL`

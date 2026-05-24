# src/schema/

Drizzle TS schema files — one per logical group. Re-exported in bulk via
`index.ts` so consumers can do:

```typescript
import { orders, orderItems, requisitions } from '@curavend/db';
```

## Schemas by domain

### Identity
- `users.ts` `userMemberships.ts` `userPermissions.ts`
- `userGroups.ts` `userGroupMembers.ts` `userGroupPermissions.ts`
- `authAuditLog.ts` `emailOtpCodes.ts` `unsubscribes.ts`

### Hospital org
- `hospitals.ts` `hospitalFacilities.ts` `hospitalDepartments.ts`
- `physicians.ts`

### Vendor org
- `vendors.ts` `vendorLocations.ts` `vendorItemSkus.ts`
- `superVendors.ts` `hospitalVendors.ts`
- `vendorStockConnectors.ts` `vendorStockSnapshots.ts` `vendorErpConnectors.ts`
- `vendorOnboarding.ts` — 7-state machine + audit history
- `vendorRmas.ts` — RMA workflow
- `vendorScorecardSnapshots.ts` — monthly performance rollups

### Provider
- `providers.ts`

### Orders & requisitions
- `orders.ts` `orderItems.ts` `orderHistory.ts` `orderShipments.ts`
- `orderContacts.ts` `orderStickers.ts` `orderRecurrencePlans.ts`
- `orderIngestJournal.ts` `externalFulfillmentCallbacks.ts`
- `customerPurchaseOrders.ts` `purchaseOrders.ts`
- `requisitions.ts` `requisitionTemplates.ts`
- `approvalRules.ts`

### Inventory
- `inventory.ts` `providerInventory.ts` `consignment.ts`
- `labInventory.ts` — consumables, lots, movements, test-consumable map,
  backorders (single file because they're tightly coupled)
- `labGroups.ts` `labKitSites.ts`
- `labOrders.ts` `labOrderItems.ts`
- `kitLetters.ts`
- `inventoryTransfers.ts` — hospital-side facility-to-facility transfers
- `pointOfUseEvents.ts` — bedside consumption capture

### Receiving & billing
- `goodsReceipts.ts` — GRN headers + lines
- `threeWayMatches.ts` — PO + GRN + invoice match results
- `invoices.ts` `invoiceItems.ts`
- `invoiceMatchRules.ts` — auto-resolution tolerance bands

### Finance
- `hospitalBudgets.ts` — budget + history (encumbrance accounting)
- `glEntries.ts` — append-only GL journal
- `subscriptions.ts`

### Catalog
- `contracts.ts` `contractItems.ts` `contractRevisions.ts` `contractHistory.ts`
- `gpoOrganizations.ts` `gpoContractItems.ts`
- `payors.ts` `payorContractItems.ts`
- `formularyItems.ts` `formularySubstitutes.ts`
- `feeSchedules.ts` `stateRateSchedules.ts`
- `salesTaxRates.ts`
- `hcpcCodes.ts` `icd10Codes.ts`
- `skuGroups.ts`

### Clinical
- `clinicalTemplates.ts`
- `priorAuths.ts`
- `ehrConnections.ts`
- `encounterAuditLogs.ts`
- `phiAccessLog.ts` `phiConsentLog.ts`
- `dmeDocuments.ts` — DWO, CMN, PA letter, etc.
- `cmsLcd.ts` — CMS LCD coverage criteria

### Compliance
- `oigExclusionList.ts`
- `complianceAlerts.ts` — pre-expiry alerts (DMEPOS, accreditation, lots)
- `controlledSubstanceLog.ts` — DEA Schedule II–V chain of custody
- `recalls.ts` — recalls + affected items
- `substitutionAuditLog.ts` — substitution governance

### Logistics
- `shipmentTempLogs.ts` — cold-chain temperature readings

### Reporting
- `hospitalForecastRuns.ts` — cached forecast results
- `poTransmissionLog.ts` — per-attempt PO send log

### Workflow runtime (CCID)
- `workflowInstances.ts` `workflowActivityLog.ts` `workflowEvents.ts`

### Notifications & messaging
- `notifications.ts` `notificationPreferences.ts`
- `notificationDeliveryLog.ts` `emailRecipientConfig.ts`
- `supportTickets.ts`
- `rooms.ts` `messages.ts`

### Infra
- `sequences.ts` — monotonic counters (REQ-, PO-, RMA-, etc.)
- `userFilterPresets.ts`
- `integrationLog.ts` — outbound API call log
- `fileAccessLog.ts` — R2 download log

## Adding a new schema

```typescript
// schema/myThing.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const myThings = sqliteTable(
  'my_things',                  // snake_case for the SQL table name
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    name: text('name').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('my_things_hospital_idx').on(t.hospitalId),
  ],
);
```

Then add `export * from './myThing';` to `schema/index.ts`.

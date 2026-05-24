# src/api/

Typed fetch wrappers. One file per resource on the backend.

## Base client

`client.ts` exports `get<T>`, `post<T>`, `put<T>`, `del<T>` — thin axios
wrappers that:

- Read the JWT from Redux state on every request
- Add `Authorization: Bearer <token>` header
- On 401: queue concurrent requests, refresh token once, replay all
- Set base URL from `import.meta.env.VITE_API_URL` (defaults to the
  production Worker)
- Wrap fetch errors so callers get `err.response.data.error` consistently

## Per-resource files

Each file exports an object (or named functions) typed for that resource:

```typescript
// api/labs.ts
import { get, post, put } from './client';

export const labsApi = {
  listOrders: (params?: ListParams) =>
    get<{ items: LabOrder[]; total: number }>('/labs/orders', params),
  createOrder: (body: CreateOrderBody) =>
    post<CreateOrderResp>('/labs/orders', body),
  // ...
};
```

Callers:

```typescript
import { labsApi } from '../../../api/labs';

const r = await labsApi.listOrders({ status: 'NEW' });
```

## Files

### Identity
- `auth.ts` `users.ts` `userPermissions.ts` `userGroups.ts`

### Hospital org
- `hospitals.ts` `hospitalFacilities.ts` `hospitalDepartments.ts`
  `physicians.ts`

### Vendor
- `vendors.ts` `vendorLocations.ts` `vendorCoverage.ts` `vendorSkus.ts`
- `hospitalVendors.ts` `superVendors.ts`

### Orders & requisitions
- `orders.ts` `purchaseOrders.ts` `customerPurchaseOrders.ts`
- `requisitions.ts`
- `approvalRules.ts` `approvals.ts`
- `backorders.ts` `recurrence.ts` `bulkTracking.ts`

### Receiving & billing
- `receiving.ts` (goods receipts + match exceptions)
- `invoices.ts` `billing.ts` `threeWayMatching.ts`

### Inventory
- `inventory.ts` `labInventory.ts` `consignment.ts`

### Catalog
- `contracts.ts` `gpo.ts` `payors.ts` `formulary.ts`
- `hcpcCodes.ts` `icd10Codes.ts`

### Lab
- `labs.ts`

### DME
- `dmeDocuments.ts` `dmeOrder.ts`

### Clinical
- `priorAuths.ts` `ehrConnections.ts`

### Workflow / admin
- `workflows.ts` `notifications.ts` `notificationPreferences.ts`
- `chat.ts` `messages.ts` `supportTickets.ts`

### Reporting
- `reporting.ts`

### Files
- `uploads.ts`

## Adding a new client

```typescript
// api/myResource.ts
import { get, post, put, del } from './client';

export interface MyResource {
  id: string;
  name: string;
  // ...
}

export const myResourceApi = {
  list: (params?: { limit?: number }) =>
    get<{ items: MyResource[] }>('/my-resource', params),
  get: (id: string) =>
    get<MyResource>(`/my-resource/${id}`),
  create: (body: Partial<MyResource>) =>
    post<{ id: string }>('/my-resource', body),
  update: (id: string, body: Partial<MyResource>) =>
    put<{ updated: true }>(`/my-resource/${id}`, body),
  remove: (id: string) =>
    del<{ deleted: true }>(`/my-resource/${id}`),
};
```

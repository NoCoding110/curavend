# src/features/

Feature-folder layout. Each top-level dir is a self-contained domain —
its own `pages/`, optionally `components/`, optionally a local `hooks.ts`
or `types.ts`. Pages are mounted in `src/routes/AllRoutes.tsx` and gated
by `PrivateRoute` + `usePermissions().can()`.

## Layout

```
features/
├─ <domain>/
│  ├─ pages/        # Routed pages
│  ├─ components/   # (optional) domain-local components
│  ├─ hooks.ts      # (optional) domain hooks
│  └─ types.ts      # (optional) domain types
```

## Domains

### Identity & onboarding
- `auth/` — login, signup, forgot/reset password, MFA enroll/verify
- `profile/` — user profile + settings + MFA management + notification prefs
- `helpCenter/` — `/help-center` route reading from `public/docs/`

### Dashboard & landing
- `dashboard/` — `/dashboard` for authed users
- `landing/` — `/` public marketing page with scroll-driven 3D scene

### Orders
- `supplyOrderDetail/` — create-order wizard, order detail (every tab),
  create-DME-order wizard
- `dispenseProduct/` — point-of-dispense flow
- `bulkTracking/` — bulk shipment view
- `recurrence/` — recurring-order schedules

### Requisitions
- `requisitions/` — requisition list, detail, create, templates

### Approvals
- `approvals/` — admin/manager approval queue

### Billing
- `billing/` — invoice list + detail + 3-way match panel

### Receiving
- `receiving/` — goods receipts, match exceptions, RMAs, backorder triage

### Inventory
- `inventory/` — hospital inventory list, transfers, point-of-use capture
- `labs/` — lab portal: dashboard, orders, kit sites, inventory, audit log,
  test-consumable map, lab order detail

### Reporting
- `reporting/` — Reports.tsx + 9+ sub-report pages
  (department-spend, cross-site-inventory, charge-capture-leakage,
  price-variance, clinical-consumption, hospital-forecast, vendor-scorecards,
  contract-leakage, multi-site-spend, forecast)

### Catalog
- `contractPricing/` — contract list + detail + wizard
- `customerPurchaseOrders/` — customer-side PO list + detail
- `purchaseOrders/` — internal PO list + detail with transmission log
- `skuCatalog/` `skuGroups/` `vendorSkus/` — catalog management
- `priceLookup/` — HCPC → cascading price preview

### Hospital management
- `hospitalManagement/` — hospitals, facilities, departments, physicians
  CRUD + permissions matrix component (shared by users + groups)
- `vendors/` `vendorLocations/` `vendorCoverage/` — vendor org pages

### Provider
- `provider/` — provider list, detail

### Communication
- `message/` `chat/` — WebSocket-backed chat (rooms, messages, presence)
- `notifications/` — in-app notification center

### Lab-specific
- `priorAuth/` — prior authorization workflow

### Logistics
- `logistics/` — shipment list + temp readings + POD gallery

### Vendor portal
- `vendor*/` — vendor-facing duplicates of order list, invoices, etc.

### Admin
- `admin/` — workflows, file access log, integration log, OIG,
  user approvals, formulary, GPO contracts, payors, EHR connections,
  DMEPOS compliance, LCD ingest, approval rules, subscription plans,
  budgets, GL ledger, supplier onboarding, compliance dashboard,
  item master hygiene, invoice match rules, lab backfill,
  emergency review, recalls, controlled-substance, etc.

### Misc
- `subscription/` — subscription plan picker
- `superVendor/` — super-vendor portal
- `stockFeed/` `erpConnectors/` — vendor stock + ERP integrations
- `goodsReceipts/` `matchExceptions/` — older receiving pages

## Page pattern

```typescript
// features/myDomain/pages/MyPage.tsx
import React, { useEffect, useState } from 'react';
import { Button, Card, Table, message } from 'antd';
import styled from 'styled-components';
import { get } from '../../../api/client';

const PageWrap = styled.div`padding: 24px;`;

const MyPage: React.FC = () => {
  const [rows, setRows] = useState<MyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: MyRow[] }>('/my-resource');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <PageWrap>
      <Card size="small">
        <Table dataSource={rows} loading={loading} /* ... */ />
      </Card>
    </PageWrap>
  );
};

export default MyPage;
```

Add it to `AllRoutes.tsx`:

```typescript
const MyPage = lazy(() => import('../features/myDomain/pages/MyPage'));
// ... inside <Route> tree:
<Route path="/my-page" element={<MyPage />} />
```

Add it to `lib/routeBreadcrumbs.ts` for the breadcrumb to render.

Add it to `components/layout/Sidebar.tsx` if it should show in the nav.

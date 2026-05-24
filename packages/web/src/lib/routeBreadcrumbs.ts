/**
 * Route → breadcrumb crumbs registry.
 *
 * The keys can be exact paths (`/admin/workflows`) or patterns with
 * `:param` placeholders (`/provider-orders/:id`). At render time the
 * current `location.pathname` is matched against patterns, longest match
 * first, and the configured crumbs are returned.
 *
 * Pages that need DYNAMIC crumbs (e.g. order number) call
 * `useBreadcrumbOverride([...])` to replace the registry default at runtime.
 */
import type { BreadcrumbCrumb } from '../components/PageBreadcrumb';

/** Exact-match table of pathname → crumbs (after the auto-prepended Home). */
const EXACT: Record<string, BreadcrumbCrumb[]> = {
  '/': [{ title: 'Dashboard' }],
  '/dashboard': [{ title: 'Dashboard' }],

  '/provider-orders': [{ title: 'Orders' }],
  '/create-order': [{ title: 'Orders', to: '/provider-orders' }, { title: 'New Order' }],
  '/create-dme-order': [{ title: 'Orders', to: '/provider-orders' }, { title: 'New DME Order' }],
  '/admin/dmepos-compliance': [{ title: 'Admin', to: '/admin' }, { title: 'DMEPOS Compliance' }],
  '/admin/lcd-ingest': [{ title: 'Admin', to: '/admin' }, { title: 'LCD / NCD Ingest' }],
  '/admin/lab-backfill': [{ title: 'Admin', to: '/admin' }, { title: 'Lab Consumption Backfill' }],
  '/admin/budgets': [{ title: 'Admin', to: '/admin' }, { title: 'Budgets' }],
  '/admin/gl-ledger': [{ title: 'Admin', to: '/admin' }, { title: 'GL Ledger' }],
  '/admin/supplier-onboarding': [{ title: 'Admin', to: '/admin' }, { title: 'Supplier Onboarding' }],
  '/admin/compliance-dashboard': [{ title: 'Admin', to: '/admin' }, { title: 'Compliance' }],
  '/admin/item-master-hygiene': [{ title: 'Admin', to: '/admin' }, { title: 'Item Master Hygiene' }],
  '/admin/invoice-match-rules': [{ title: 'Admin', to: '/admin' }, { title: 'Invoice Match Rules' }],
  '/rmas': [{ title: 'Returns (RMAs)' }],
  '/backorders/triage': [{ title: 'Backorders', to: '/backorders' }, { title: 'Triage' }],
  '/point-of-use': [{ title: 'Point of Use' }],
  '/logistics': [{ title: 'Logistics' }],
  '/reporting/department-spend': [{ title: 'Reporting' }, { title: 'Department Spend' }],
  '/reporting/cross-site-inventory': [{ title: 'Reporting' }, { title: 'Cross-site Inventory' }],
  '/admin/emergency-review': [{ title: 'Admin', to: '/admin' }, { title: 'Emergency Review Queue' }],
  '/admin/recalls': [{ title: 'Admin', to: '/admin' }, { title: 'Recalls' }],
  '/admin/controlled-substance': [{ title: 'Admin', to: '/admin' }, { title: 'Controlled Substances' }],
  '/inventory-transfers': [{ title: 'Inventory Transfers' }],
  '/reporting/vendor-scorecards': [{ title: 'Reporting' }, { title: 'Vendor Scorecards' }],
  '/reporting/hospital-forecast': [{ title: 'Reporting' }, { title: 'Hospital Demand Forecast' }],
  '/reporting/charge-capture-leakage': [{ title: 'Reporting' }, { title: 'Charge Capture Leakage' }],
  '/reporting/price-variance': [{ title: 'Reporting' }, { title: 'Price Variance' }],
  '/reporting/clinical-consumption': [{ title: 'Reporting' }, { title: 'Clinical Consumption' }],
  '/dispense-product': [{ title: 'Orders', to: '/provider-orders' }, { title: 'Dispense Product' }],

  '/approvals': [{ title: 'Approvals' }],

  '/billing-orders': [{ title: 'Invoices' }],

  '/inventory-management': [{ title: 'Inventory' }],

  '/contract-pricing': [{ title: 'Contracts & Pricing' }],
  '/contracts/new': [{ title: 'Contracts & Pricing', to: '/contract-pricing' }, { title: 'New Contract' }],

  '/customer-purchase-orders': [{ title: 'Customer POs' }],

  '/recurrence': [{ title: 'Recurring Orders' }],

  '/sku-groups': [{ title: 'SKU Groups' }],
  '/sku-catalog': [{ title: 'Catalog' }],

  '/price-lookup': [{ title: 'Price Lookup' }],

  '/bulk-tracking': [{ title: 'Bulk Tracking' }],

  '/purchase-orders': [{ title: 'Purchase Orders' }],

  '/consignment': [{ title: 'Consignment' }],

  '/stock-feeds': [{ title: 'Stock Feeds' }],
  '/erp-connectors': [{ title: 'ERP Connectors' }],

  '/chat': [{ title: 'Chat' }],

  '/vendors': [{ title: 'Platform Management', to: '/dashboard' }, { title: 'Manage Vendors' }],
  '/create-vendor': [{ title: 'Platform Management', to: '/dashboard' }, { title: 'Manage Vendors', to: '/vendors' }, { title: 'New Vendor' }],
  '/create-provider': [{ title: 'Platform Management', to: '/dashboard' }, { title: 'Manage Providers' }, { title: 'New Provider' }],
  '/hospitals': [{ title: 'Platform Management', to: '/dashboard' }, { title: 'Manage Hospitals' }],
  // `/facility-vendors` is reached from multiple sidebars (admin "Facility–Vendor Links", hospital "My Vendors", vendor "My Hospitals"). Keep the crumb role-neutral instead of forcing every persona through "Platform Management".
  '/facility-vendors': [{ title: 'Hospital–Vendor Links' }],
  '/vendor-coverage': [{ title: 'Vendor Coverage' }],
  // Vendor users can't access `/vendors` (admin page), so don't link the parent crumb there for vendor-operational pages.
  '/vendor-locations': [{ title: 'Vendor Locations' }],
  '/vendor-skus': [{ title: 'SKU Catalog' }],

  '/hospital-facilities': [{ title: 'Hospital Management' }, { title: 'Facilities' }],
  '/hospital-departments': [{ title: 'Hospital Management' }, { title: 'Departments' }],
  '/hospital-physicians': [{ title: 'Hospital Management' }, { title: 'Physicians' }],

  '/admin': [{ title: 'Platform Management', to: '/dashboard' }, { title: 'Admin Panel' }],
  '/admin/approvals': [{ title: 'Admin', to: '/admin' }, { title: 'User Approvals' }],
  '/admin/file-access-log': [{ title: 'Admin', to: '/admin' }, { title: 'File Access Log' }],
  '/admin/integration-log': [{ title: 'Admin', to: '/admin' }, { title: 'Integration Log' }],
  '/admin/workflows': [{ title: 'Admin', to: '/admin' }, { title: 'Workflows' }],
  '/admin/gpo-contracts': [{ title: 'Admin', to: '/admin' }, { title: 'GPO Contracts' }],
  '/admin/payors': [{ title: 'Admin', to: '/admin' }, { title: 'Payors' }],
  '/reporting/forecast': [{ title: 'Reporting' }, { title: 'Demand Forecast' }],
  '/prior-auths': [{ title: 'Prior Authorizations' }],
  '/admin/ehr-connections': [{ title: 'Admin', to: '/admin' }, { title: 'EHR Connections' }],
  '/admin/formulary': [{ title: 'Admin', to: '/admin' }, { title: 'Item Master' }],
  '/admin/approval-rules': [{ title: 'Admin', to: '/admin' }, { title: 'Approval Rules' }],
  '/requisitions': [{ title: 'Requisitions' }],
  '/requisition-templates': [{ title: 'Requisitions', to: '/requisitions' }, { title: 'Templates' }],
  '/goods-receipts': [{ title: 'Goods Receipts' }],
  '/match-exceptions': [{ title: '3-Way Match Exceptions' }],
  '/reporting/multi-site-spend': [{ title: 'Reporting' }, { title: 'Multi-Site Spend' }],
  '/reporting/contract-leakage': [{ title: 'Reporting' }, { title: 'Contract Leakage' }],
  '/subscription': [{ title: 'Admin', to: '/admin' }, { title: 'Subscription Plans' }],

  '/setting': [{ title: 'Settings' }],
  '/profile': [{ title: 'Profile' }],
  '/notification-preferences': [{ title: 'Notification Preferences' }],

  '/help-and-support': [{ title: 'Help & Support' }],
  '/help-center': [{ title: 'Help Center' }],
  '/faq': [{ title: 'FAQ' }],

  '/labs': [{ title: 'Lab Dashboard' }],
  '/labs/orders': [{ title: 'Labs', to: '/labs' }, { title: 'Lab Orders' }],
  '/labs/orders/new': [{ title: 'Labs', to: '/labs' }, { title: 'Lab Orders', to: '/labs/orders' }, { title: 'New Order' }],
  '/labs/groups': [{ title: 'Labs', to: '/labs' }, { title: 'Lab Groups' }],
  '/labs/kit-sites': [{ title: 'Labs', to: '/labs' }, { title: 'Kit Sites' }],
  '/labs/inventory': [{ title: 'Labs', to: '/labs' }, { title: 'Inventory' }],
  '/labs/test-mappings': [{ title: 'Labs', to: '/labs' }, { title: 'Test Recipes' }],
  '/labs/audit': [{ title: 'Labs', to: '/labs' }, { title: 'Audit Log' }],
};

/** Pattern table for dynamic segments. Tested in order; first match wins. */
const PATTERNS: Array<{ pattern: RegExp; build: () => BreadcrumbCrumb[] }> = [
  {
    pattern: /^\/provider-orders\/[^/]+\/?$/,
    build: () => [{ title: 'Orders', to: '/provider-orders' }, { title: 'Order detail' }],
  },
  {
    pattern: /^\/create-order\/[^/]+\/?$/,
    build: () => [{ title: 'Orders', to: '/provider-orders' }, { title: 'Edit Order' }],
  },
  {
    pattern: /^\/encounter\/[^/]+\/?$/,
    build: () => [{ title: 'Orders', to: '/provider-orders' }, { title: 'Encounter' }],
  },
  {
    pattern: /^\/contracts\/[^/]+\/?$/,
    build: () => [{ title: 'Contracts & Pricing', to: '/contract-pricing' }, { title: 'Contract detail' }],
  },
  {
    pattern: /^\/recurrence\/[^/]+\/?$/,
    build: () => [{ title: 'Recurring Orders', to: '/recurrence' }, { title: 'Schedule detail' }],
  },
  {
    pattern: /^\/labs\/orders\/[^/]+\/?$/,
    build: () => [{ title: 'Labs', to: '/labs' }, { title: 'Lab Orders', to: '/labs/orders' }, { title: 'Order detail' }],
  },
  {
    pattern: /^\/reporting\/[^/]+\/?$/,
    build: () => [{ title: 'Reporting' }, { title: 'Report' }],
  },
];

export function matchBreadcrumbs(pathname: string): BreadcrumbCrumb[] | null {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  if (EXACT[trimmed]) return EXACT[trimmed];
  for (const { pattern, build } of PATTERNS) {
    if (pattern.test(trimmed)) return build();
  }
  return null;
}

import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  MessageOutlined,
  BarChartOutlined,
  InboxOutlined,
  FileProtectOutlined,
  TeamOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
  BankOutlined,
  UserSwitchOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  AppstoreOutlined,
  CreditCardOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  MedicineBoxOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useUserRoles } from '../../hooks/useUserRoles';
import { usePermissions } from '../../hooks/usePermissions';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';

type MenuItem = Required<MenuProps>['items'][number];

interface SidebarProps {
  collapsed: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isHospital, isVendor, isProvider, isSuperVendor, isLab } =
    useUserRoles();
  const { canRead } = usePermissions();
  const unreadChatCount = useSelector(
    (state: RootState) => state.message.unreadChatCount,
  );

  const menuItems: MenuItem[] = useMemo(() => {
    // LAB users get a dedicated lab-only menu
    if (isLab) {
      return [
        { key: '/labs', icon: <DashboardOutlined />, label: 'Lab Dashboard' },
        { key: '/labs/orders', icon: <ShoppingCartOutlined />, label: 'Lab Orders' },
        { key: '/labs/groups', icon: <FileProtectOutlined />, label: 'Lab Groups' },
        { key: '/labs/inventory', icon: <ExperimentOutlined />, label: 'Inventory' },
        { key: '/labs/test-mappings', icon: <AppstoreOutlined />, label: 'Test Recipes' },
        { key: '/labs/audit', icon: <AuditOutlined />, label: 'Audit Log' },
        { key: '/labs/kit-sites', icon: <InboxOutlined />, label: 'Kit Sites' },
        { key: '/profile', icon: <DashboardOutlined />, label: 'Profile' },
      ] as MenuItem[];
    }
    const items: MenuItem[] = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: 'Dashboard',
      },
      {
        key: '/provider-orders',
        icon: <ShoppingCartOutlined />,
        label: 'Orders',
      },
    ];

    // (DME wizard removed from sidebar — it's now reachable from the
    // Orders list page via the Create Order ▾ dropdown.)

    // Approvals queue — every role with decision authority sees this
    if (isAdmin || isHospital || isVendor || isProvider || isSuperVendor) {
      items.push({
        key: '/approvals',
        icon: <CheckCircleOutlined />,
        label: 'Approvals',
      });
    }

    // Prior Authorizations — hospitals + admins primarily
    if (isAdmin || isHospital || isProvider) {
      items.push({
        key: '/prior-auths',
        icon: <CheckCircleOutlined />,
        label: 'Prior Auths',
      });
    }

    // Procurement (Session 11) — collapse into a single expandable group.
    // Role check filters who CAN access the resource;
    // permission check filters whether THIS user has been granted any level on it.
    const procurementChildren: MenuItem[] = [];
    if ((isHospital || isAdmin || isProvider) && canRead('requisitions')) {
      procurementChildren.push(
        { key: '/requisitions', icon: <FileProtectOutlined />, label: 'Requisitions' },
        { key: '/requisition-templates', icon: <AppstoreOutlined />, label: 'Templates' },
      );
    }
    if ((isHospital || isVendor || isAdmin) && canRead('goods-receipts')) {
      procurementChildren.push({
        key: '/goods-receipts',
        icon: <InboxOutlined />,
        label: 'Goods Receipts',
      });
    }
    if ((isHospital || isAdmin) && canRead('goods-receipts')) {
      procurementChildren.push({
        key: '/match-exceptions',
        icon: <CheckCircleOutlined />,
        label: 'Match Exceptions',
      });
    }
    if (procurementChildren.length > 0) {
      items.push({
        key: 'procurement',
        icon: <FileProtectOutlined />,
        label: 'Procurement',
        children: procurementChildren,
      });
    }

    // Billing — vendors generate/send invoices; hospitals review/pay them
    if (isVendor || isHospital || isAdmin || isSuperVendor || isProvider) {
      items.push({
        key: '/billing-orders',
        icon: <DollarOutlined />,
        label: 'Invoices',
      });
    }

    // Inventory — vendors manage their own product catalog; hospitals don't
    if (isVendor || isAdmin || isSuperVendor) {
      items.push({
        key: '/inventory-management',
        icon: <InboxOutlined />,
        label: 'Inventory',
      });
    }

    // Contract & Pricing — both sides view their contracts
    if (isVendor || isHospital || isAdmin || isSuperVendor || isProvider) {
      items.push({
        key: '/contract-pricing',
        icon: <FileProtectOutlined />,
        label: 'Contract & Pricing',
      });
    }

    // Customer POs — hospitals manage buyer-side purchase orders
    if (isHospital || isAdmin) {
      items.push({
        key: '/customer-purchase-orders',
        icon: <FileProtectOutlined />,
        label: 'Customer POs',
      });
    }

    // Recurring orders — schedules for hospital + vendor
    if (isHospital || isVendor || isAdmin) {
      items.push({
        key: '/recurrence',
        icon: <AppstoreOutlined />,
        label: 'Recurring Orders',
      });
    }

    // Catalog — hospitals browse products from contracted vendors; vendors browse own
    if (isHospital || isVendor || isAdmin) {
      items.push({
        key: '/sku-catalog',
        icon: <ShoppingOutlined />,
        label: 'Catalog',
      });
    }

    // Price lookup — hospital + vendor + admin
    if (isHospital || isVendor || isAdmin) {
      items.push({
        key: '/price-lookup',
        icon: <ShopOutlined />,
        label: 'Price Lookup',
      });
    }

    // Bulk tracking — vendor + admin
    if (isVendor || isAdmin) {
      items.push({
        key: '/bulk-tracking',
        icon: <InboxOutlined />,
        label: 'Bulk Tracking',
      });
    }

    // SKU groups — vendor + admin
    if (isVendor || isAdmin) {
      items.push({
        key: '/sku-groups',
        icon: <AppstoreOutlined />,
        label: 'SKU Groups',
      });
    }

    // Purchase Orders — vendors and admins; hospitals use standard orders
    if (isAdmin || isVendor || isSuperVendor) {
      items.push({
        key: '/purchase-orders',
        icon: <ShoppingOutlined />,
        label: 'Purchase Orders',
      });
    }

    // Consignment — vendors manage closets at hospital locations
    if (isAdmin || isVendor || isSuperVendor) {
      items.push({
        key: '/consignment',
        icon: <AppstoreOutlined />,
        label: 'Consignment',
      });
    }

    // Facility Vendors — hospitals manage their approved vendor list
    if (isHospital || isProvider) {
      items.push({
        key: '/facility-vendors',
        icon: <TeamOutlined />,
        label: 'My Vendors',
      });
      items.push({
        key: '/vendor-coverage',
        icon: <ShopOutlined />,
        label: 'Vendor Coverage',
      });
    }

    // My Hospitals — vendors view the hospitals they have relationships with
    if (isVendor) {
      items.push({
        key: '/facility-vendors',
        icon: <BankOutlined />,
        label: 'My Hospitals',
      });
    }

    // Vendor branches — vendors manage their warehouses / fitting centers
    if (isVendor || isAdmin || isSuperVendor) {
      items.push({
        key: '/vendor-locations',
        icon: <ShopOutlined />,
        label: 'Locations',
      });
      items.push({
        key: '/vendor-skus',
        icon: <AppstoreOutlined />,
        label: 'SKU Catalog',
      });
      items.push({
        key: '/stock-feeds',
        icon: <InboxOutlined />,
        label: 'Stock Feeds',
      });
      items.push({
        key: '/erp-connectors',
        icon: <ApiOutlined />,
        label: 'ERP Connectors',
      });
    }

    // Facilities, Departments, Physicians — hospital users only
    if (isHospital) {
      items.push(
        {
          key: '/hospital-facilities',
          icon: <BankOutlined />,
          label: 'Facilities',
        },
        {
          key: '/hospital-departments',
          icon: <AppstoreOutlined />,
          label: 'Departments',
        },
        {
          key: '/hospital-physicians',
          icon: <TeamOutlined />,
          label: 'Physicians',
        },
        {
          // EHR Connections (Epic / Cerner / Meditech / …). Hospital admins
          // wire their own EHR tenant in here. The backend RBAC scopes the
          // returned rows to the caller's hospital_id, so non-platform admins
          // only ever see their own connections.
          key: '/admin/ehr-connections',
          icon: <ApiOutlined />,
          label: 'EHR Connections',
        },
      );
    }

    // Chat
    items.push({
      key: '/chat',
      icon: <MessageOutlined />,
      label: unreadChatCount > 0 ? `Chat (${unreadChatCount})` : 'Chat',
    });

    // Reporting — built per-persona so each role only sees reports they
    // can act on. Order matches the four themed buckets in PV1/2/3:
    //   Spend (procurement) → Vendor performance → Operations → Compliance.
    const reportingChildren: MenuItem[] = [];

    // ─── Spend reports — anyone whose persona transacts in $ ──────────────
    if (isAdmin || isHospital || isProvider || isVendor || isSuperVendor) {
      reportingChildren.push({ key: '/reporting/spend-by-vendor', label: 'Spend by Vendor' });
      reportingChildren.push({ key: '/reporting/spend-by-hcpc', label: 'Top 10 HCPC' });
      reportingChildren.push({ key: '/reporting/spend-by-month', label: 'Spend by Month' });
    }
    // These break out by hospital-internal axes — only hospital-side personas.
    if (isAdmin || isHospital || isProvider) {
      reportingChildren.push({ key: '/reporting/spend-by-physician', label: 'Spend by Physician' });
      reportingChildren.push({ key: '/reporting/spend-by-facility', label: 'Spend by Facility' });
      reportingChildren.push({ key: '/reporting/spend-by-department', label: 'Spend by Department' });
      reportingChildren.push({ key: '/reporting/department-spend', label: 'Department Spend (Budget)' });
      reportingChildren.push({ key: '/reporting/multi-site-spend', label: 'Multi-Site Spend' });
      reportingChildren.push({ key: '/reporting/contract-leakage', label: 'Contract Leakage' });
      reportingChildren.push({ key: '/reporting/price-variance', label: 'Price Variance' });
    }

    // ─── Vendor performance — hospital/admin see all, vendor sees own ─────
    if (isAdmin || isHospital || isVendor || isSuperVendor) {
      reportingChildren.push({ key: '/reporting/vendor-kpis', label: 'Vendor KPIs' });
      reportingChildren.push({ key: '/reporting/vendor-scorecards', label: 'Vendor Scorecards' });
    }

    // ─── Forecasts ────────────────────────────────────────────────────────
    if (isAdmin || isLab) {
      reportingChildren.push({ key: '/reporting/forecast', label: 'Lab Demand Forecast' });
    }
    if (isAdmin || isHospital) {
      reportingChildren.push({ key: '/reporting/hospital-forecast', label: 'Hospital Forecast' });
    }

    // ─── Inventory + clinical (hospital + lab) ────────────────────────────
    if (isAdmin || isLab || isVendor || isSuperVendor) {
      reportingChildren.push({ key: '/reporting/cross-site-inventory', label: 'Cross-site Inventory' });
    }
    if (isAdmin || isHospital) {
      reportingChildren.push({ key: '/reporting/charge-capture-leakage', label: 'Charge Capture Leakage' });
      reportingChildren.push({ key: '/reporting/clinical-consumption', label: 'Clinical Consumption' });
    }

    // ─── Admin-only ───────────────────────────────────────────────────────
    if (isAdmin) {
      // Single-segment keys — match `/reporting/:reportId` route. Two-segment
      // URLs (`compliance/users`) would fall through to the `*` catch-all
      // and redirect to landing.
      reportingChildren.push({ key: '/reporting/compliance-users', label: 'Compliance: Users' });
      reportingChildren.push({ key: '/reporting/compliance-credentials', label: 'Compliance: Credentials' });
      reportingChildren.push({ key: '/reporting/unbilled-transactions', label: 'Unbilled Transactions' });
    }

    // Suppress the Reporting submenu entirely if this persona has no
    // applicable reports (rare — only happens for unscoped roles).
    if (reportingChildren.length > 0) {
      items.push({
        key: '/reporting/spend',
        icon: <BarChartOutlined />,
        label: 'Reporting',
        children: reportingChildren,
      });
    }

    // Admin-only management section
    if (isAdmin) {
      items.push(
        { type: 'divider' },
        {
          key: 'management-group',
          label: 'Platform Management',
          type: 'group',
          children: [
            {
              key: '/vendors',
              icon: <ShopOutlined />,
              label: 'Manage Vendors',
            },
            {
              key: '/hospitals',
              icon: <BankOutlined />,
              label: 'Manage Hospitals',
            },
            {
              key: '/facility-vendors',
              icon: <TeamOutlined />,
              label: 'Facility–Vendor Links',
            },
            {
              key: '/admin',
              icon: <SafetyCertificateOutlined />,
              label: 'Admin Panel',
            },
            {
              key: '/admin/approvals',
              icon: <UserSwitchOutlined />,
              label: 'User Approvals',
            },
            {
              key: '/admin/file-access-log',
              icon: <AuditOutlined />,
              label: 'File Access Log',
            },
            {
              key: '/admin/integration-log',
              icon: <AuditOutlined />,
              label: 'Integration Log',
            },
            {
              key: '/admin/workflows',
              icon: <AuditOutlined />,
              label: 'Workflows',
            },
            {
              key: '/admin/gpo-contracts',
              icon: <AuditOutlined />,
              label: 'GPO Contracts',
            },
            {
              key: '/admin/payors',
              icon: <AuditOutlined />,
              label: 'Payors',
            },
            {
              key: '/admin/ehr-connections',
              icon: <AuditOutlined />,
              label: 'EHR Connections',
            },
            ...(canRead('formulary')
              ? [
                  {
                    key: '/admin/formulary',
                    icon: <AppstoreOutlined />,
                    label: 'Item Master',
                  },
                ]
              : []),
            {
              key: '/admin/dmepos-compliance',
              icon: <SafetyCertificateOutlined />,
              label: 'DMEPOS Compliance',
            },
            {
              key: '/admin/lcd-ingest',
              icon: <AuditOutlined />,
              label: 'LCD / NCD Ingest',
            },
            {
              key: '/admin/lab-backfill',
              icon: <HistoryOutlined />,
              label: 'Lab Backfill',
            },
            {
              key: '/admin/budgets',
              icon: <DollarOutlined />,
              label: 'Budgets',
            },
            {
              key: '/admin/gl-ledger',
              icon: <BankOutlined />,
              label: 'GL Ledger',
            },
            {
              key: '/admin/supplier-onboarding',
              icon: <UserSwitchOutlined />,
              label: 'Supplier Onboarding',
            },
            {
              key: '/admin/compliance-dashboard',
              icon: <SafetyCertificateOutlined />,
              label: 'Compliance',
            },
            {
              key: '/admin/item-master-hygiene',
              icon: <AppstoreOutlined />,
              label: 'Item Master Hygiene',
            },
            {
              key: '/admin/invoice-match-rules',
              icon: <CheckCircleOutlined />,
              label: 'Match Rules',
            },
            {
              key: '/admin/emergency-review',
              icon: <ThunderboltOutlined />,
              label: 'Emergency Review',
            },
            {
              key: '/admin/recalls',
              icon: <WarningOutlined />,
              label: 'Recalls',
            },
            {
              key: '/admin/controlled-substance',
              icon: <LockOutlined />,
              label: 'Controlled Subst.',
            },
            {
              key: '/admin/approval-rules',
              icon: <CheckCircleOutlined />,
              label: 'Approval Rules',
            },
            {
              key: '/subscription',
              icon: <CreditCardOutlined />,
              label: 'Subscription Plans',
            },
          ],
        },
        { type: 'divider' },
      );
    }

    // Notification preferences — hospital/vendor admins
    if (isHospital || isVendor || isAdmin) {
      items.push({
        key: '/notification-preferences',
        icon: <SettingOutlined />,
        label: 'Notification Settings',
      });
    }

    // Settings - admin only
    if (isAdmin) {
      items.push({
        key: '/setting',
        icon: <SettingOutlined />,
        label: 'Settings',
      });
    }

    // Help Center (training docs) — everyone sees this
    items.push({
      key: '/help-center',
      icon: <QuestionCircleOutlined />,
      label: 'Help Center',
    });

    // Help & Support (contact)
    items.push({
      key: '/help-and-support',
      icon: <CustomerServiceOutlined />,
      label: 'Contact Support',
    });

    // FAQ
    items.push({
      key: '/faq',
      icon: <QuestionCircleOutlined />,
      label: 'FAQ',
    });

    return items;
  }, [isAdmin, isHospital, isVendor, isProvider, isSuperVendor, isLab, unreadChatCount, canRead]);

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'management-group' || key === 'procurement') return;
    navigate(key);
  };

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return '/';

    // Collect all keys (including nested children) with their full key strings
    const allKeys: string[] = [];
    const collect = (items: MenuItem[]) => {
      for (const item of items) {
        if (!item || !('key' in item)) continue;
        const key = item.key as string;
        if (key && key !== '/' && key !== 'management-group' && key !== 'procurement') allKeys.push(key);
        if ('children' in item && Array.isArray((item as any).children)) {
          collect((item as any).children);
        }
      }
    };
    collect(menuItems);

    // Find longest matching key (most specific match wins)
    const match = allKeys
      .filter((key) => path === key || path.startsWith(key + '/'))
      .sort((a, b) => b.length - a.length)[0];

    return match ?? path;
  }, [location.pathname, menuItems]);

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      defaultOpenKeys={collapsed ? [] : ['/reporting/spend']}
      items={menuItems}
      onClick={onClick}
      style={{ borderRight: 0 }}
    />
  );
};

export default Sidebar;

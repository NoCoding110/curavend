import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import PrivateRoute from './PrivateRoute';
import MainLayout from '../layouts/MainLayout';
import FullPageLayout from '../layouts/FullPageLayout';

// Lazy-loaded pages
const Login = lazy(() => import('../features/auth/pages/Login'));
const LabDashboard = lazy(() => import('../features/labs/pages/LabDashboard'));
const LabOrders = lazy(() => import('../features/labs/pages/LabOrders'));
const CreateLabOrder = lazy(() => import('../features/labs/pages/CreateLabOrder'));
const LabOrderDetail = lazy(() => import('../features/labs/pages/LabOrderDetail'));
const LabGroupsPage = lazy(() => import('../features/labs/pages/LabGroups'));
const LabKitSitesPage = lazy(() => import('../features/labs/pages/LabKitSites'));
const WorkflowsAdmin = lazy(() => import('../features/admin/pages/WorkflowsAdmin'));
const ForgotPassword = lazy(
  () => import('../features/auth/pages/ForgotPassword'),
);
const ResetPassword = lazy(
  () => import('../features/auth/pages/ResetPassword'),
);
const Dashboard = lazy(() => import('../features/dashboard/pages/Dashboard'));
const SupplyOrder = lazy(
  () => import('../features/supplyOrder/pages/SupplyOrder'),
);
const SupplyOrderDetail = lazy(
  () => import('../features/supplyOrderDetail/pages/SupplyOrderDetail'),
);
const CreateSupplyOrder = lazy(
  () => import('../features/supplyOrderDetail/pages/CreateSupplyOrder'),
);
const DispenseProduct = lazy(
  () => import('../features/supplyOrderDetail/pages/DispenseProduct'),
);
const BillingOrder = lazy(
  () => import('../features/billing/pages/BillingOrder'),
);
const BillingDetail = lazy(
  () => import('../features/billing/pages/BillingDetail'),
);
const Message = lazy(() => import('../features/message/pages/Message'));
const Reports = lazy(() => import('../features/reporting/pages/Reports'));
const InventoryManagement = lazy(
  () =>
    import('../features/inventoryManagement/pages/InventoryManagement'),
);
const ContractPricing = lazy(
  () => import('../features/contractPricing/pages/ContractPricing'),
);
const AddContractWizard = lazy(
  () => import('../features/contractPricing/pages/AddContractWizard'),
);
const ContractDetailPage = lazy(
  () => import('../features/contractPricing/pages/ContractDetail'),
);
// ─── Phase B-I: Procurement features ──────────────────────────────────
const CustomerPurchaseOrdersPage = lazy(
  () => import('../features/customerPurchaseOrders/pages/CustomerPurchaseOrders'),
);
const OrderRecurrenceList = lazy(
  () => import('../features/orderRecurrence/pages/OrderRecurrenceList'),
);
const OrderRecurrenceDetail = lazy(
  () => import('../features/orderRecurrence/pages/OrderRecurrenceDetail'),
);
const BulkTrackingUploader = lazy(
  () => import('../features/shipments/pages/BulkTrackingUploader'),
);
const Catalog = lazy(() => import('../features/catalog/pages/Catalog'));
const SkuGroups = lazy(() => import('../features/catalog/pages/SkuGroups'));
const PriceLookup = lazy(() => import('../features/pricing/pages/PriceLookup'));
const NotificationPreferencesPage = lazy(
  () => import('../features/notificationPreferences/pages/NotificationPreferencesPage'),
);
const IntegrationLog = lazy(() => import('../features/admin/pages/IntegrationLog'));
const HospitalVendors = lazy(
  () => import('../features/userManagement/pages/HospitalVendors'),
);
const SupportAndHelp = lazy(
  () => import('../features/supportAndHelp/pages/SupportAndHelp'),
);
const SupportAndHelpDetail = lazy(
  () => import('../features/supportAndHelp/pages/SupportAndHelpDetail'),
);
const FAQ = lazy(() => import('../features/faq/pages/FAQ'));
const Profile = lazy(() => import('../features/profile/pages/Profile'));
const Setting = lazy(() => import('../features/profile/pages/Setting'));
const EncounterPage = lazy(() => import('../features/supplyOrderDetail/pages/EncounterPage'));
const AdminDashboard = lazy(() => import('../features/admin/pages/AdminDashboard'));
const UserApprovalQueue = lazy(() => import('../features/admin/pages/UserApprovalQueue'));
const FileAccessLog = lazy(() => import('../features/admin/pages/FileAccessLog'));
const ApprovalsQueue = lazy(() => import('../features/approvals/pages/ApprovalsQueue'));
const SubscriptionPlans = lazy(() => import('../features/billing/pages/SubscriptionPlans'));
const PurchaseOrders = lazy(() => import('../features/purchaseOrders/pages/PurchaseOrders'));
const ConsignmentClosets = lazy(() => import('../features/consignment/pages/ConsignmentClosets'));
const VendorsPage = lazy(() => import('../features/vendors/pages/VendorsPage'));
const VendorLocations = lazy(() => import('../features/vendors/pages/VendorLocations'));
const VendorSkuCatalog = lazy(() => import('../features/vendors/pages/VendorSkuCatalog'));
const VendorStockConnectors = lazy(() => import('../features/vendors/pages/VendorStockConnectors'));
const VendorErpConnectors = lazy(() => import('../features/vendors/pages/VendorErpConnectors'));
const VendorCoverage = lazy(() => import('../features/vendorCoverage/pages/VendorCoverage'));
const HospitalsPage = lazy(() => import('../features/hospitals/pages/HospitalsPage'));
const MfaSetup = lazy(() => import('../features/auth/pages/MfaSetup'));
const FirstLoginPasswordChange = lazy(() => import('../features/auth/pages/FirstLoginPasswordChange'));
const PhiConsent = lazy(() => import('../features/auth/pages/PhiConsent'));
const NotificationPreferences = lazy(() => import('../features/profile/pages/NotificationPreferences'));
const CreateVendor = lazy(() => import('../features/userManagement/pages/CreateVendor'));
const CreateProvider = lazy(() => import('../features/userManagement/pages/CreateProvider'));
const HospitalFacilities = lazy(() => import('../features/hospitalManagement/pages/HospitalFacilities'));
const HospitalDepartments = lazy(() => import('../features/hospitalManagement/pages/HospitalDepartments'));
const HospitalPhysicians = lazy(() => import('../features/hospitalManagement/pages/HospitalPhysicians'));

const Loading = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}
  >
    <Spin size="large" />
  </div>
);

const AllRoutes: React.FC = () => {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Public routes */}
        <Route element={<FullPageLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        {/* Protected routes */}
        <Route
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/setting" element={<Setting />} />
          <Route path="/provider-orders" element={<SupplyOrder />} />
          <Route
            path="/provider-orders/:orderId"
            element={<SupplyOrderDetail />}
          />
          <Route path="/create-order" element={<CreateSupplyOrder />} />
          <Route path="/create-order/:orderId" element={<CreateSupplyOrder />} />
          <Route path="/dispense-product" element={<DispenseProduct />} />
          <Route
            path="/dispense-product/:orderId"
            element={<DispenseProduct />}
          />
          <Route path="/billing-orders" element={<BillingOrder />} />
          <Route
            path="/billing-orders/:orderId"
            element={<BillingDetail />}
          />
          <Route path="/chat" element={<Message />} />
          <Route path="/reporting/:reportId" element={<Reports />} />
          <Route
            path="/inventory-management"
            element={<InventoryManagement />}
          />
          <Route path="/contract-pricing" element={<ContractPricing />} />
          <Route path="/contracts/new" element={<AddContractWizard />} />
          <Route path="/contracts/:id" element={<ContractDetailPage />} />

          {/* Phase B-I: Procurement features */}
          <Route path="/customer-purchase-orders" element={<CustomerPurchaseOrdersPage />} />
          <Route path="/recurrence" element={<OrderRecurrenceList />} />
          <Route path="/recurrence/:id" element={<OrderRecurrenceDetail />} />
          <Route path="/bulk-tracking" element={<BulkTrackingUploader />} />
          <Route path="/sku-catalog" element={<Catalog />} />
          <Route path="/sku-groups" element={<SkuGroups />} />
          <Route path="/price-lookup" element={<PriceLookup />} />
          <Route path="/notification-preferences" element={<NotificationPreferencesPage />} />
          <Route path="/admin/integration-log" element={<IntegrationLog />} />
          <Route path="/facility-vendors" element={<HospitalVendors />} />
          <Route path="/vendor-coverage" element={<VendorCoverage />} />
          <Route path="/help-and-support" element={<SupportAndHelp />} />
          <Route
            path="/help-and-support/:supportTicketId"
            element={<SupportAndHelpDetail />}
          />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/encounter/:orderId" element={<EncounterPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/approvals" element={<UserApprovalQueue />} />
          <Route path="/admin/file-access-log" element={<FileAccessLog />} />
          <Route path="/approvals" element={<ApprovalsQueue />} />
          <Route path="/subscription" element={<SubscriptionPlans />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/consignment" element={<ConsignmentClosets />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/vendor-locations" element={<VendorLocations />} />
          <Route path="/vendor-skus" element={<VendorSkuCatalog />} />
          <Route path="/stock-feeds" element={<VendorStockConnectors />} />
          <Route path="/erp-connectors" element={<VendorErpConnectors />} />
          <Route path="/hospitals" element={<HospitalsPage />} />
          <Route path="/mfa-setup" element={<MfaSetup />} />
          <Route path="/first-login" element={<FirstLoginPasswordChange />} />
          <Route path="/phi-consent" element={<PhiConsent />} />
          <Route path="/notification-preferences" element={<NotificationPreferences />} />
          <Route path="/create-vendor" element={<CreateVendor />} />
          <Route path="/create-provider" element={<CreateProvider />} />
          <Route path="/hospital-facilities" element={<HospitalFacilities />} />
          <Route path="/hospital-departments" element={<HospitalDepartments />} />
          <Route path="/hospital-physicians" element={<HospitalPhysicians />} />
          {/* Lab portal */}
          <Route path="/labs" element={<LabDashboard />} />
          <Route path="/labs/orders" element={<LabOrders />} />
          <Route path="/labs/orders/new" element={<CreateLabOrder />} />
          <Route path="/labs/orders/:id" element={<LabOrderDetail />} />
          <Route path="/labs/groups" element={<LabGroupsPage />} />
          <Route path="/labs/kit-sites" element={<LabKitSitesPage />} />
          <Route path="/admin/workflows" element={<WorkflowsAdmin />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AllRoutes;

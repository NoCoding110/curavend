import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import PrivateRoute from './PrivateRoute';
import RoleGuard from './RoleGuard';
import MainLayout from '../layouts/MainLayout';
import FullPageLayout from '../layouts/FullPageLayout';

// Lazy-loaded pages
const Landing = lazy(() => import('../features/landing/pages/Landing'));
const FhirLaunchBounce = lazy(() => import('../features/landing/pages/FhirLaunchBounce'));
const Login = lazy(() => import('../features/auth/pages/Login'));
const LabDashboard = lazy(() => import('../features/labs/pages/LabDashboard'));
const LabOrders = lazy(() => import('../features/labs/pages/LabOrders'));
const CreateLabOrder = lazy(() => import('../features/labs/pages/CreateLabOrder'));
const LabOrderDetail = lazy(() => import('../features/labs/pages/LabOrderDetail'));
const LabGroupsPage = lazy(() => import('../features/labs/pages/LabGroups'));
const LabKitSitesPage = lazy(() => import('../features/labs/pages/LabKitSites'));
const WorkflowsAdmin = lazy(() => import('../features/admin/pages/WorkflowsAdmin'));
const GpoContracts = lazy(() => import('../features/admin/pages/GpoContracts'));
const PayorsPage = lazy(() => import('../features/admin/pages/Payors'));
const ForecastPage = lazy(() => import('../features/reporting/pages/Forecast'));
const PriorAuthsPage = lazy(() => import('../features/priorAuth/pages/PriorAuths'));
const EhrConnectionsPage = lazy(() => import('../features/admin/pages/EhrConnections'));
const FormularyPage = lazy(() => import('../features/admin/pages/Formulary'));
const RequisitionsPage = lazy(() => import('../features/requisitions/pages/Requisitions'));
const ApprovalRulesPage = lazy(() => import('../features/requisitions/pages/ApprovalRules'));
const RequisitionTemplatesPage = lazy(() => import('../features/requisitions/pages/RequisitionTemplates'));
const GoodsReceiptsPage = lazy(() => import('../features/receiving/pages/GoodsReceipts'));
const MatchExceptionsPage = lazy(() => import('../features/receiving/pages/MatchExceptions'));
const MultiSiteSpendPage = lazy(() => import('../features/reporting/pages/MultiSiteSpend'));
const ContractLeakagePage = lazy(() => import('../features/reporting/pages/ContractLeakage'));
const HelpCenterPage = lazy(() => import('../features/helpCenter/pages/HelpCenter'));
const CreateDmeOrderPage = lazy(() => import('../features/supplyOrderDetail/pages/CreateDmeOrder'));
const LcdIngestPage = lazy(() => import('../features/admin/pages/LcdIngest'));
const DmeposCompliancePage = lazy(() => import('../features/admin/pages/DmeposCompliance'));
const LabInventoryPage = lazy(() => import('../features/labs/pages/LabInventory'));
const TestConsumableMapPage = lazy(() => import('../features/labs/pages/TestConsumableMap'));
const LabAuditLogPage = lazy(() => import('../features/labs/pages/LabAuditLog'));
const LabBackfillPage = lazy(() => import('../features/admin/pages/LabBackfill'));
const BudgetsPage = lazy(() => import('../features/admin/pages/Budgets'));
const DepartmentSpendPage = lazy(() => import('../features/reporting/pages/DepartmentSpend'));
const PurchaseOrderDetailPage = lazy(() => import('../features/purchaseOrders/pages/PurchaseOrderDetail'));
const GlLedgerPage = lazy(() => import('../features/admin/pages/GlLedger'));
const SupplierOnboardingPage = lazy(() => import('../features/admin/pages/SupplierOnboarding'));
const ComplianceDashboardPage = lazy(() => import('../features/admin/pages/ComplianceDashboard'));
const ItemMasterHygienePage = lazy(() => import('../features/admin/pages/ItemMasterHygiene'));
const InvoiceMatchRulesPage = lazy(() => import('../features/admin/pages/InvoiceMatchRules'));
const RmasPage = lazy(() => import('../features/receiving/pages/Rmas'));
const BackorderTriagePage = lazy(() => import('../features/receiving/pages/BackorderTriage'));
const PointOfUsePage = lazy(() => import('../features/inventory/pages/PointOfUse'));
const LogisticsPage = lazy(() => import('../features/logistics/pages/Logistics'));
const CrossSiteInventoryPage = lazy(() => import('../features/reporting/pages/CrossSiteInventory'));
const EmergencyReviewQueuePage = lazy(() => import('../features/admin/pages/EmergencyReviewQueue'));
const InventoryTransfersPage = lazy(() => import('../features/inventory/pages/InventoryTransfers'));
const RecallsPage = lazy(() => import('../features/admin/pages/Recalls'));
const ControlledSubstancePage = lazy(() => import('../features/admin/pages/ControlledSubstance'));
const VendorScorecardsPage = lazy(() => import('../features/reporting/pages/VendorScorecards'));
const HospitalForecastPage = lazy(() => import('../features/reporting/pages/HospitalForecast'));
const ChargeCaptureLeakagePage = lazy(() => import('../features/reporting/pages/ChargeCaptureLeakage'));
const PriceVariancePage = lazy(() => import('../features/reporting/pages/PriceVariance'));
const ClinicalConsumptionPage = lazy(() => import('../features/reporting/pages/ClinicalConsumption'));
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
const CreateVendor = lazy(() => import('../features/userManagement/pages/CreateVendor'));
const CreateProvider = lazy(() => import('../features/userManagement/pages/CreateProvider'));
const CreateLab = lazy(() => import('../features/userManagement/pages/CreateLab'));
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
        {/* Public landing page — replaces the old "/" → Dashboard mapping. */}
        <Route path="/" element={<Landing />} />

        {/* Public FHIR launch bounce — entry after Epic OAuth callback. */}
        <Route path="/fhir-launch-bounce" element={<FhirLaunchBounce />} />

        {/* Public auth routes */}
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
          {/* ── Routes accessible to all authenticated personas ─────────────── */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          {/* /provider-orders is for hospital / vendor / admin / super-vendor / provider.
              LAB users have their own portal at /labs and should not land here. */}
          <Route element={<RoleGuard allowedUserTypes={['HOSPITAL', 'VENDOR', 'ADMIN', 'SUPER_VENDOR', 'PROVIDER']} />}>
            <Route path="/provider-orders" element={<SupplyOrder />} />
            <Route
              path="/provider-orders/:orderId"
              element={<SupplyOrderDetail />}
            />
          </Route>
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
          {/* inventory-management guarded below — VENDOR+ADMIN+SUPER_VENDOR only */}
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
          <Route path="/facility-vendors" element={<HospitalVendors />} />
          <Route path="/vendor-coverage" element={<VendorCoverage />} />
          <Route path="/help-and-support" element={<SupportAndHelp />} />
          <Route
            path="/help-and-support/:supportTicketId"
            element={<SupportAndHelpDetail />}
          />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/encounter/:orderId" element={<EncounterPage />} />
          <Route path="/approvals" element={<ApprovalsQueue />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="/consignment" element={<ConsignmentClosets />} />
          {/* /vendors is intentionally placed inside admin group below */}
          <Route path="/vendor-locations" element={<VendorLocations />} />
          <Route path="/vendor-skus" element={<VendorSkuCatalog />} />
          <Route path="/stock-feeds" element={<VendorStockConnectors />} />
          <Route path="/erp-connectors" element={<VendorErpConnectors />} />
          <Route path="/hospitals" element={<HospitalsPage />} />
          <Route path="/mfa-setup" element={<MfaSetup />} />
          <Route path="/first-login" element={<FirstLoginPasswordChange />} />
          <Route path="/phi-consent" element={<PhiConsent />} />
          <Route path="/setting" element={<Setting />} />
          <Route path="/create-vendor" element={<CreateVendor />} />
          <Route path="/create-provider" element={<CreateProvider />} />
          <Route path="/create-lab" element={<CreateLab />} />
          <Route path="/help-center" element={<HelpCenterPage />} />
          <Route path="/prior-auths" element={<PriorAuthsPage />} />
          <Route path="/requisitions" element={<RequisitionsPage />} />
          <Route path="/requisition-templates" element={<RequisitionTemplatesPage />} />
          <Route path="/goods-receipts" element={<GoodsReceiptsPage />} />
          <Route path="/match-exceptions" element={<MatchExceptionsPage />} />
          <Route path="/rmas" element={<RmasPage />} />
          <Route path="/backorders/triage" element={<BackorderTriagePage />} />
          <Route path="/point-of-use" element={<PointOfUsePage />} />
          <Route path="/logistics" element={<LogisticsPage />} />
          <Route path="/inventory-transfers" element={<InventoryTransfersPage />} />
          <Route path="/create-dme-order" element={<CreateDmeOrderPage />} />
          <Route path="/reporting/multi-site-spend" element={<MultiSiteSpendPage />} />
          <Route path="/reporting/contract-leakage" element={<ContractLeakagePage />} />
          <Route path="/reporting/department-spend" element={<DepartmentSpendPage />} />
          <Route path="/reporting/cross-site-inventory" element={<CrossSiteInventoryPage />} />
          <Route path="/reporting/vendor-scorecards" element={<VendorScorecardsPage />} />
          <Route path="/reporting/hospital-forecast" element={<HospitalForecastPage />} />
          <Route path="/reporting/charge-capture-leakage" element={<ChargeCaptureLeakagePage />} />
          <Route path="/reporting/price-variance" element={<PriceVariancePage />} />
          <Route path="/reporting/clinical-consumption" element={<ClinicalConsumptionPage />} />
          <Route path="/reporting/forecast" element={<ForecastPage />} />

          {/* ── VENDOR + ADMIN + SUPER_VENDOR — Inventory management ──────────── */}
          <Route element={<RoleGuard allowedUserTypes={['VENDOR', 'ADMIN', 'SUPER_VENDOR']} />}>
            <Route path="/inventory-management" element={<InventoryManagement />} />
          </Route>

          {/* ── HOSPITAL + ADMIN — EHR connections, hospital management ─────── */}
          <Route element={<RoleGuard allowedUserTypes={['HOSPITAL', 'ADMIN']} />}>
            <Route path="/admin/ehr-connections" element={<EhrConnectionsPage />} />
            <Route path="/hospital-facilities" element={<HospitalFacilities />} />
            <Route path="/hospital-departments" element={<HospitalDepartments />} />
            <Route path="/hospital-physicians" element={<HospitalPhysicians />} />
          </Route>

          {/* ── LAB + ADMIN — Lab portal ─────────────────────────────────────── */}
          <Route element={<RoleGuard allowedUserTypes={['LAB', 'ADMIN']} />}>
            <Route path="/labs" element={<LabDashboard />} />
            <Route path="/labs/orders" element={<LabOrders />} />
            <Route path="/labs/orders/new" element={<CreateLabOrder />} />
            <Route path="/labs/orders/:id" element={<LabOrderDetail />} />
            <Route path="/labs/groups" element={<LabGroupsPage />} />
            <Route path="/labs/kit-sites" element={<LabKitSitesPage />} />
            <Route path="/labs/inventory" element={<LabInventoryPage />} />
            <Route path="/labs/test-mappings" element={<TestConsumableMapPage />} />
            <Route path="/labs/audit" element={<LabAuditLogPage />} />
          </Route>

          {/* ── ADMIN-ONLY — Platform management + admin config ──────────────── */}
          <Route element={<RoleGuard allowedUserTypes={['ADMIN']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/admin/approvals" element={<UserApprovalQueue />} />
            <Route path="/admin/file-access-log" element={<FileAccessLog />} />
            <Route path="/admin/integration-log" element={<IntegrationLog />} />
            <Route path="/admin/workflows" element={<WorkflowsAdmin />} />
            <Route path="/admin/gpo-contracts" element={<GpoContracts />} />
            <Route path="/admin/payors" element={<PayorsPage />} />
            <Route path="/admin/formulary" element={<FormularyPage />} />
            <Route path="/admin/approval-rules" element={<ApprovalRulesPage />} />
            <Route path="/admin/dmepos-compliance" element={<DmeposCompliancePage />} />
            <Route path="/admin/lcd-ingest" element={<LcdIngestPage />} />
            <Route path="/admin/lab-backfill" element={<LabBackfillPage />} />
            <Route path="/admin/budgets" element={<BudgetsPage />} />
            <Route path="/admin/gl-ledger" element={<GlLedgerPage />} />
            <Route path="/admin/supplier-onboarding" element={<SupplierOnboardingPage />} />
            <Route path="/admin/compliance-dashboard" element={<ComplianceDashboardPage />} />
            <Route path="/admin/item-master-hygiene" element={<ItemMasterHygienePage />} />
            <Route path="/admin/invoice-match-rules" element={<InvoiceMatchRulesPage />} />
            <Route path="/admin/emergency-review" element={<EmergencyReviewQueuePage />} />
            <Route path="/admin/recalls" element={<RecallsPage />} />
            <Route path="/admin/controlled-substance" element={<ControlledSubstancePage />} />
            <Route path="/subscription" element={<SubscriptionPlans />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AllRoutes;

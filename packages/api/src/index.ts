import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './lib/env';
import type { AuthUser } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import { AppError } from './lib/errors';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import uploadRoutes from './routes/uploads';
import providerRoutes from './routes/providers';
import hospitalRoutes from './routes/hospitals';
import vendorRoutes from './routes/vendors';
import vendorLocationRoutes from './routes/vendorLocations';
import vendorCoverageRoutes from './routes/vendorCoverage';
import vendorItemSkuRoutes from './routes/vendorItemSkus';
import vendorStockConnectorRoutes from './routes/vendorStockConnectors';
import stockFeedRoutes from './routes/stockFeeds';
import routingRoutes from './routes/routing';
import orderRoutes from './routes/orders';
import invoiceRoutes from './routes/invoices';
import notificationRoutes from './routes/notifications';
import roomRoutes from './routes/rooms';
import hospitalVendorRoutes from './routes/hospitalVendors';
import reportingRoutes from './routes/reporting';
import supportTicketRoutes from './routes/supportTickets';
import inventoryRoutes from './routes/inventory';
import contractRoutes from './routes/contracts';
import aiRoutes from './routes/ai';
import encounterRoutes from './routes/encounter';
import adminRoutes from './routes/admin';
import approvalsRoutes from './routes/approvals';
import orderPdfRoutes from './routes/orderPdf';
import vendorErpConnectorRoutes from './routes/vendorErpConnectors';
import purchaseOrderRoutes from './routes/purchaseOrders';
import consignmentRoutes from './routes/consignment';
import subscriptionRoutes from './routes/subscriptions';
import clinicalTemplateRoutes from './routes/clinicalTemplates';
import fhirRoutes from './routes/fhir';
import hospitalFacilityRoutes from './routes/hospitalFacilities';
import hospitalDepartmentRoutes from './routes/hospitalDepartments';
import hcpcCodeRoutes from './routes/hcpcCodes';
import icd10CodeRoutes from './routes/icd10Codes';
import cdsHooksRoutes from './routes/cdsHooks';
import userFilterPresetRoutes from './routes/userFilterPresets';
import userPermissionRoutes from './routes/userPermissions';
import userGroupRoutes from './routes/userGroups';
import gpoRoutes from './routes/gpo';
import payorRoutes from './routes/payors';
import forecastingRoutes from './routes/forecasting';
import priorAuthsRoutes from './routes/priorAuths';
import ehrRoutes from './routes/ehr';
import formularyRoutes from './routes/formulary';
import requisitionRoutes from './routes/requisitions';
import approvalRulesRoutes from './routes/approvalRules';
import requisitionTemplateRoutes from './routes/requisitionTemplates';
import goodsReceiptRoutes from './routes/goodsReceipts';
import threeWayMatchRoutes from './routes/threeWayMatching';
import dmeDocumentRoutes from './routes/dmeDocuments';
import lcdRoutes from './routes/lcd';
import dmeBundleRoutes from './routes/dmeBundle';
import dmeposComplianceRoutes from './routes/dmeposCompliance';
import dmeRentalPeriodRoutes from './routes/dmeRentalPeriods';
import labInventoryRoutes from './routes/labInventory';
import backorderRoutes from './routes/backorders';
import labMovementSearchRoutes from './routes/labMovementSearch';
import budgetsRoutes from './routes/budgets';
import departmentSpendRoutes from './routes/departmentSpend';
import glReportingRoutes from './routes/glReporting';
import vendorOnboardingRoutes from './routes/vendorOnboarding';
import rmasRoutes from './routes/rmas';
import invoiceMatchRulesRoutes from './routes/invoiceMatchRules';
import itemMasterHygieneRoutes from './routes/itemMasterHygiene';
import pointOfUseRoutes from './routes/pointOfUse';
import crossSiteInventoryRoutes from './routes/crossSiteInventory';
import complianceAlertsRoutes from './routes/complianceAlerts';
import logisticsRoutes from './routes/logistics';
import inventoryTransfersRoutes from './routes/inventoryTransfers';
import recallsRoutes from './routes/recalls';
import controlledSubstanceRoutes from './routes/controlledSubstance';
import substitutionsRoutes from './routes/substitutions';
import procurementAnalyticsRoutes from './routes/procurementAnalytics';
import webhookRoutes from './routes/webhooks';
import superVendorRoutes from './routes/superVendors';
import spendCalculatorRoutes from './routes/spendCalculator';
import customerPurchaseOrderRoutes from './routes/customerPurchaseOrders';
import orderRecurrenceRoutes from './routes/orderRecurrence';
import shipmentRoutes from './routes/shipments';
import skuGroupRoutes from './routes/skuGroups';
import catalogRoutes from './routes/catalog';
import pricingRoutes from './routes/pricing';
import searchRoutes from './routes/search';
import notificationPreferenceRoutes from './routes/notificationPreferences';
import integrationRoutes from './routes/integrations';
import utilityRoutes from './routes/utility';
import labsRoutes from './routes/labs';
import { openApiApp } from './lib/openapi';
import { runStep as runWorkflowStep } from './services/workflowService';
import { handleDelayedOrderNotifications } from './cron/delayedOrderNotifier';
import { handleExpiryNotifications } from './cron/expiryNotifier';
import { handleOigRefresh } from './cron/oigScreeningRefresh';
import { handleContractLifecycle } from './cron/contractLifecycle';
import { handleRecurringOrderSpawner } from './cron/recurringOrderSpawner';
import { handleIntegrationRetry } from './cron/integrationRetry';
import { handleOrderSlaMonitor } from './cron/orderSlaMonitor';
import { handleKitLetterSync } from './cron/kitLetterSync';
import { handleRentalBilling } from './cron/dmeRentalBilling';
import { handleDmeposExpiry } from './cron/dmeposExpiry';
import { handleLabAutoReplenishment, handleLabExpiration } from './cron/labReplenishment';
import { handlePractitionerSync } from './cron/practitionerSync';
import externalFulfillmentRoutes from './routes/externalFulfillment';
import jwksRoutes from './routes/jwks';
import workflowRoutes from './routes/workflows';
import { sweepExpiredEventWaits } from './services/workflowService';
import { runAllStockPolls } from './routes/vendorStockConnectors';
import { handleOrderCreated, handleOrderStatusChanged, handleOrderShipped, handleOrderDelivered } from './queues/orderEvents';
import { handleInvoiceCreated, handleInvoiceSent, handleInvoicePaid } from './queues/invoiceEvents';
import { handleChatMessage } from './queues/chatEvents';

// ─── App Setup ──────────────────────────────────────────────────────────────

type AppBindings = { Bindings: Env; Variables: { user: AuthUser } };

const app = new Hono<AppBindings>();

// ─── Global Middleware ──────────────────────────────────────────────────────

// Request logger that records method + pathname + status only — never the
// query string, which can carry patient identifiers (PHI) on search/list routes.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const path = c.req.path; // pathname only, no query string
  console.log(`${c.req.method} ${path} ${c.res.status} ${Date.now() - start}ms`);
});
// Security headers on every response. Cross-Origin-* policies are intentionally
// disabled so the (different-origin) SPA can keep reading the API under CORS.
app.use(
  '*',
  secureHeaders({
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    referrerPolicy: 'no-referrer',
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      styleSrc: ["'unsafe-inline'"], // for the few inline-styled HTML responses (unsubscribe page)
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
    },
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  }),
);
app.use('*', async (c, next) => {
  const corsHandler = corsMiddleware(c.env.FRONTEND_URL);
  return corsHandler(c, next);
});

// ─── Global Error Handler ───────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: err.message, code: err.code },
      { status: err.statusCode as 400 | 401 | 403 | 404 | 409 | 500 },
    );
  }

  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

// ─── Health Check ───────────────────────────────────────────────────────────

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    service: 'curavend-api',
    timestamp: new Date().toISOString(),
  }),
);

// ─── Public Routes (no auth required) ───────────────────────────────────────

app.route('/api/auth', authRoutes);

// CDS Hooks are public per the CDS Hooks specification
app.route('/', cdsHooksRoutes);

// Stripe webhooks are public (verified via signature header)
app.route('/api/webhooks', webhookRoutes);

// Vendor stock-feed webhooks are public (HMAC-verified via per-vendor secret)
app.route('/api/stock-feeds', stockFeedRoutes);

// External fulfillment vendor webhooks are public (HMAC-verified via shared secret)
app.route('/api/external/fulfillment', externalFulfillmentRoutes);

// JWKS for SMART Backend Services — public per RFC 7517. Customer's Epic admin
// registers https://curavend-api.metabilityllc1.workers.dev/.well-known/jwks.json
// once on the app config, then validates our client_assertion JWTs against it.
app.route('/', jwksRoutes);

// ─── Protected Routes (auth required) ───────────────────────────────────────

app.use('/api/*', authMiddleware());
app.route('/api/users', userRoutes);
app.route('/api/uploads', uploadRoutes);
app.route('/api/providers', providerRoutes);
app.route('/api/hospitals', hospitalRoutes);
app.route('/api/vendors', vendorRoutes);
app.route('/api/vendor-locations', vendorLocationRoutes);
app.route('/api/vendor-coverage', vendorCoverageRoutes);
app.route('/api/vendor-item-skus', vendorItemSkuRoutes);
app.route('/api/vendor-stock-connectors', vendorStockConnectorRoutes);
app.route('/api/vendor-erp-connectors', vendorErpConnectorRoutes);
app.route('/api/routing', routingRoutes);
app.route('/api/orders', orderRoutes);
app.route('/api/invoices', invoiceRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/rooms', roomRoutes);
app.route('/api/hospital-vendors', hospitalVendorRoutes);
app.route('/api/reports', reportingRoutes);
app.route('/api/support-tickets', supportTicketRoutes);
app.route('/api/inventory', inventoryRoutes);
app.route('/api/contracts', contractRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/orders', encounterRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/approvals', approvalsRoutes);
// Mount under /api/orders so the URL is /api/orders/:id/packet.pdf
app.route('/api/orders', orderPdfRoutes);
app.route('/api/purchase-orders', purchaseOrderRoutes);
app.route('/api/consignment', consignmentRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
app.route('/api/clinical-templates', clinicalTemplateRoutes);
app.route('/api/fhir', fhirRoutes);
app.route('/api/hospital-facilities', hospitalFacilityRoutes);
app.route('/api/hospital-departments', hospitalDepartmentRoutes);
app.route('/api/hcpc-codes', hcpcCodeRoutes);
app.route('/api/icd10-codes', icd10CodeRoutes);
app.route('/api/user-filter-presets', userFilterPresetRoutes);
app.route('/api/user-permissions', userPermissionRoutes);
app.route('/api/user-groups', userGroupRoutes);
app.route('/api/gpo', gpoRoutes);
app.route('/api/payors', payorRoutes);
app.route('/api/forecasting', forecastingRoutes);
app.route('/api/prior-auths', priorAuthsRoutes);
app.route('/api/ehr', ehrRoutes);
app.route('/api/formulary', formularyRoutes);
app.route('/api/requisitions', requisitionRoutes);
app.route('/api/approval-rules', approvalRulesRoutes);
app.route('/api/requisition-templates', requisitionTemplateRoutes);
app.route('/api/goods-receipts', goodsReceiptRoutes);
app.route('/api/three-way-match', threeWayMatchRoutes);
app.route('/api/dme-documents', dmeDocumentRoutes);
app.route('/api/lcd', lcdRoutes);
app.route('/api/dme-bundle', dmeBundleRoutes);
app.route('/api/dmepos-compliance', dmeposComplianceRoutes);
app.route('/api/dme-rental-periods', dmeRentalPeriodRoutes);
app.route('/api/lab-inventory', labInventoryRoutes);
app.route('/api/backorders', backorderRoutes);
app.route('/api/lab-movements', labMovementSearchRoutes);
app.route('/api/budgets', budgetsRoutes);
app.route('/api/reporting/department-spend', departmentSpendRoutes);
app.route('/api/reporting/gl', glReportingRoutes);
app.route('/api/vendor-onboarding', vendorOnboardingRoutes);
app.route('/api/rmas', rmasRoutes);
app.route('/api/invoice-match-rules', invoiceMatchRulesRoutes);
app.route('/api/item-master-hygiene', itemMasterHygieneRoutes);
app.route('/api/point-of-use', pointOfUseRoutes);
app.route('/api/reporting/cross-site-inventory', crossSiteInventoryRoutes);
app.route('/api/compliance-alerts', complianceAlertsRoutes);
app.route('/api/logistics', logisticsRoutes);
app.route('/api/transfers', inventoryTransfersRoutes);
app.route('/api/recalls', recallsRoutes);
app.route('/api/controlled-substance', controlledSubstanceRoutes);
app.route('/api/substitutions', substitutionsRoutes);
app.route('/api/reporting', procurementAnalyticsRoutes);
app.route('/api/super-vendors', superVendorRoutes);
app.route('/api/spend-calculator', spendCalculatorRoutes);
app.route('/api/customer-purchase-orders', customerPurchaseOrderRoutes);
app.route('/api/recurrence', orderRecurrenceRoutes);
// Shipment routes nest under both /api/orders/:id/shipments and /api/shipments/:id
// — mounted at /api root so paths in the handlers resolve correctly.
app.route('/api', shipmentRoutes);
app.route('/api/sku-groups', skuGroupRoutes);
app.route('/api/catalog', catalogRoutes);
app.route('/api/pricing', pricingRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/notification-preferences', notificationPreferenceRoutes);
app.route('/api/integrations', integrationRoutes);
app.route('/api/utility', utilityRoutes);
app.route('/api/labs', labsRoutes);
app.route('/api/workflows', workflowRoutes);

// OpenAPI / Swagger UI (mounted last; auth not applied at this path so docs
// are publicly readable but actual endpoints still require auth).
app.route('/api', openApiApp);

// Future route registrations:
// app.route('/api/purchase-orders', purchaseOrderRoutes);
// app.route('/api/support-tickets', supportTicketRoutes);
// app.route('/api/rooms', roomRoutes);
// app.route('/api/reports', reportRoutes);
// app.route('/api/contracts', contractRoutes);
// app.route('/api/consignment', consignmentRoutes);
// app.route('/api/fee-schedules', feeScheduleRoutes);

// ─── 404 fallback ───────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404),
);

// ─── Worker Exports ─────────────────────────────────────────────────────────

const workerHandler = {
  /**
   * Main fetch handler — delegates to Hono router.
   */
  fetch: app.fetch,

  /**
   * Cron trigger handler.
   * Configured in wrangler.toml under [triggers].
   *
   * Schedules:
   *   - "* /15 * * * *"  → Delayed order notifier (check for unnotified orders)
   *   - "0 8 * * *"      → Contract/license expiry notifier
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case '*/15 * * * *': {
        // Sweep workflows that timed out waiting for an external event
        console.log('[cron] Running workflow event-wait timeout sweep');
        ctx.waitUntil(
          sweepExpiredEventWaits(env).then(
            (r) => console.log(`[cron] event-wait sweep: expired=${r.expired}`),
            (err) => console.error('[cron] event-wait sweep failed:', err),
          ),
        );
        // Delayed order notifier
        console.log('[cron] Running delayed order notifier');
        ctx.waitUntil(handleDelayedOrderNotifications(env));
        // Integration retry sweep (Phase I)
        console.log('[cron] Running integration retry sweep');
        ctx.waitUntil(handleIntegrationRetry(env));
        // Phase D: poll active vendor stock-feed connectors
        console.log('[cron] Running vendor stock poller');
        ctx.waitUntil(
          runAllStockPolls({ env } as any).then(
            (r) =>
              console.log(
                `[cron] Stock poll: attempted=${r.attempted} ok=${r.ok} failed=${r.failed}`,
              ),
            (err) => console.error('[cron] Stock poll error:', err),
          ),
        );
        break;
      }
      case '0 8 * * *': {
        // Daily expiry check for contracts and licenses
        console.log('[cron] Running daily expiry checker');
        ctx.waitUntil(handleExpiryNotifications(env));
        // Daily contract lifecycle: APPROVED→ACTIVE, ACTIVE→EXPIRED, expiring reminders
        console.log('[cron] Running contract lifecycle');
        ctx.waitUntil(handleContractLifecycle(env));
        // Daily recurring-order spawner: clone template orders into child orders
        // for any plans whose next_occurrence_date − leadTime ≤ today.
        console.log('[cron] Running recurring order spawner');
        ctx.waitUntil(handleRecurringOrderSpawner(env));
        // Daily order SLA breach monitor (Medzah parity): 3 supply + 2 lab checks
        console.log('[cron] Running order SLA monitor');
        ctx.waitUntil(handleOrderSlaMonitor(env));
        // Daily kit letter catalog sync (athome parity)
        console.log('[cron] Running kit letter sync');
        ctx.waitUntil(handleKitLetterSync(env));
        // Daily DME rental billing sweep (Session 14 — Feature 7)
        console.log('[cron] Running DME rental billing sweep');
        ctx.waitUntil(
          handleRentalBilling(env).then(
            (r) =>
              console.log(
                `[cron] Rental billing: processed=${r.processed} billed=${r.billed} capped=${r.capped} errors=${r.errors}`,
              ),
            (err) => console.error('[cron] Rental billing failed:', err),
          ),
        );
        // Daily DMEPOS supplier compliance expiry notifier
        console.log('[cron] Running DMEPOS expiry sweep');
        ctx.waitUntil(
          handleDmeposExpiry(env).then(
            (r) =>
              console.log(
                `[cron] DMEPOS expiry: expiring=${r.expiring} alreadyExpired=${r.alreadyExpired} notified=${r.notified}`,
              ),
            (err) => console.error('[cron] DMEPOS expiry failed:', err),
          ),
        );
        // Daily lab auto-replenishment (Session 15 — Lab Batch C)
        console.log('[cron] Running lab auto-replenishment');
        ctx.waitUntil(
          handleLabAutoReplenishment(env).then(
            (r) =>
              console.log(
                `[cron] Lab auto-replen: considered=${r.itemsConsidered} created=${r.requisitionsCreated} skipped=${r.skippedExisting} errors=${r.errors}`,
              ),
            (err) => console.error('[cron] Lab auto-replen failed:', err),
          ),
        );
        // Daily lab expiration sweep
        console.log('[cron] Running lab expiration sweep');
        ctx.waitUntil(
          handleLabExpiration(env).then(
            (r) =>
              console.log(
                `[cron] Lab expiry: expired=${r.expired} in30=${r.expiringIn30} in60=${r.expiringIn60} in90=${r.expiringIn90}`,
              ),
            (err) => console.error('[cron] Lab expiry failed:', err),
          ),
        );
        // Daily compliance sweep (Procurement v2 gap I)
        console.log('[cron] Running compliance alert sweep');
        ctx.waitUntil(
          import('./services/complianceAlertService').then(({ sweepComplianceAlerts }) =>
            sweepComplianceAlerts(env.DB).then(
              (r) => console.log(
                `[cron] Compliance: accred=${r.vendorAccreditation} license=${r.vendorLicense} ins=${r.vendorInsurance} lots=${r.labLots} resolved=${r.resolved}`,
              ),
              (err) => console.error('[cron] Compliance sweep failed:', err),
            ),
          ),
        );
        // Nightly Epic Practitioner directory sync (Phase 2.N — Backend Services)
        console.log('[cron] Running Epic Practitioner directory sync');
        ctx.waitUntil(
          handlePractitionerSync(env).then(
            (r) =>
              console.log(
                `[cron] Practitioner sync: conns attempted=${r.connectionsAttempted} ok=${r.connectionsSucceeded} failed=${r.connectionsFailed} totalSynced=${r.totalPractitionersSynced}`,
              ),
            (err) => console.error('[cron] Practitioner sync failed:', err),
          ),
        );
        // Nightly vendor scorecard recompute (Procurement v3 gap J)
        console.log('[cron] Running vendor scorecard compute');
        ctx.waitUntil(
          import('./services/vendorScorecardService').then(({ computeVendorScorecards }) =>
            computeVendorScorecards(env.DB).then(
              (r) => console.log(
                `[cron] Scorecard: vendors=${r.vendorsProcessed} snapshots=${r.snapshotsWritten} errors=${r.errors}`,
              ),
              (err) => console.error('[cron] Scorecard compute failed:', err),
            ),
          ),
        );
        break;
      }
      case '0 6 1 * *': {
        // Monthly OIG LEIE exclusion list refresh (1st of month at 06:00 UTC)
        console.log('[cron] Running OIG LEIE refresh');
        ctx.waitUntil(
          handleOigRefresh(env).then(async () => {
            await env.KV.put('oig:last_refresh', new Date().toISOString());
          }),
        );
        break;
      }
      default:
        console.log(`[cron] Unknown schedule: ${event.cron}`);
    }
  },

  /**
   * Queue consumer for async events (notifications, emails, analytics).
   */
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const event = message.body as { type: string; payload: any };

        switch (event.type) {
          case 'order.created':
            await handleOrderCreated(env, event.payload);
            break;
          case 'order.status_changed':
            await handleOrderStatusChanged(env, event.payload);
            break;
          case 'order.shipped':
            await handleOrderShipped(env, event.payload);
            break;
          case 'order.delivered':
            await handleOrderDelivered(env, event.payload);
            break;
          case 'chat.new_message':
            await handleChatMessage(env, event.payload);
            break;
          case 'invoice.created':
            await handleInvoiceCreated(env, event.payload);
            break;
          case 'invoice.sent':
            await handleInvoiceSent(env, event.payload);
            break;
          case 'invoice.paid':
            await handleInvoicePaid(env, event.payload);
            break;
          case 'workflow.step':
            await runWorkflowStep(env, event.payload.instanceId);
            break;
          default:
            console.log(`[queue] Unknown event type: ${event.type}`);
        }

        message.ack();
      } catch (error) {
        console.error('[queue] Error processing message:', error);
        message.retry();
      }
    }
  },
};

// Wrap with Sentry when SENTRY_DSN is configured (no-op otherwise).
// @sentry/cloudflare wraps fetch/scheduled/queue and automatically captures errors.
export default Sentry.withSentry(
  // @sentry/cloudflare types `env` as `unknown`; cast to our Env for the
  // SENTRY_DSN/ENVIRONMENT lookups.
  (env: unknown) => {
    const e = env as Env;
    return e.SENTRY_DSN
      ? {
          dsn: e.SENTRY_DSN,
          tracesSampleRate: 0.1,
          environment: e.ENVIRONMENT ?? 'production',
        }
      : {};
  },
  workerHandler as any,
);

// Cron helpers live under ./cron/ and are imported at the top of this file.

// ─── Durable Object Export ──────────────────────────────────────────────────

export { ChatRoom } from './durable-objects/ChatRoom';

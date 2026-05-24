# src/services/

Pure business logic. No Hono. Each service exports a handful of functions
that take a `D1Database` (or `Env`) plus a typed args object and return
typed results. Routes glue them to HTTP.

## Why services?

- **Reuse** — same logic from a HTTP route, a cron job, a queue consumer.
- **Testability** — services don't depend on Hono context.
- **Composability** — `goodsReceipts.post` calls `glService.postGrReceipt`
  + `labInventoryService.receiveLot` without importing route code.

## Naming convention

`<domain><Capability>Service.ts` — singular domain, no `Service` suffix
on the verb (e.g. `labInventoryService.ts`, NOT `labInventoryService.ts`).

## What's here

### Inventory & lab
- `labInventoryService.ts` — `recordMovement`, `issueConsumable` (FEFO),
  `receiveLot`, `transferStock`, `getSiteSummary`, `getReorderCandidates`,
  `getExpiringLots`, `autoConsumeForLabOrder`
- `labReplenishmentService.ts` — `forecastDemand`, cron handlers
  `handleLabAutoReplenishment` + `handleLabExpiration`

### Procurement v1
- `budgetService.ts` — `resolveBudget` (narrowest match), `checkBudget`,
  `commitBudget`, `releaseBudget`, `consumeBudget`
- `poTransmissionService.ts` — `transmitPo` with 5 adapters
  (EDI 850 / vendor API / cXML PunchOut / email / portal), `ackPo`
- `glService.ts` — `postPoCommit`, `postGrReceipt`, `postInvoiceApprove`,
  `postInvoicePay` (balanced debit/credit pairs)

### Procurement v2
- `invoiceMatchService.ts` — `evaluateMatchRules` (auto-resolve / escalate)
- `complianceAlertService.ts` — `sweepComplianceAlerts` (daily cron)

### Procurement v3
- `hospitalForecastService.ts` — `forecastHospitalDemand` (12-month trailing
  + seasonality)
- `vendorScorecardService.ts` — `computeVendorScorecards` (monthly cron)

### Approval & routing
- `approvalRuleEngine.ts` — `pickPrimaryApprover` for requisitions
- `groupResolver.ts` — merges user permissions with group grants
- `routingService.ts` — vendor routing scoring (geo/contract/cap/stock)
- `pricingResolver.ts` — 4-tier pricing cascade

### Documents & PDFs
- `dmeDocumentService.ts` — DWO + claim bundle PDF generation
- `dmeDwoTemplate.ts` — DWO PDF template
- `cmsMcdScraper.ts` — CMS Medicare Coverage Database scraper
- `lcdService.ts` — LCD ingest + clinical-finding auto-evaluation
- `xlsxService.ts` — XLSX report generation
- `invoiceService.ts` — invoice generation from order

### Integrations
- `ehrAdapter.ts` — multi-EHR FHIR adapter (Redox-style)
- `emailService.ts` — Resend wrapper + template helpers
- `notificationService.ts` — in-app + email notification dispatcher
- `notificationRouter.ts` — preference-aware delivery (USER / GROUP)
- `webhookService.ts` — outbound webhook signing

### Infra
- `sequenceService.ts` — sequence-table backed monotonic counters (REQ-, PO-, etc.)
- `authService.ts` — JWT sign/verify, password hashing
- `mfaService.ts` — TOTP + Email OTP generation/verification
- `oigService.ts` — OIG LEIE screening + monthly refresh
- `turnstileService.ts` — Cloudflare Turnstile verification
- `workflowService.ts` — CCID workflow runtime (start/raise event/terminate)
- `threeWayMatchService.ts` — PO + GRN + invoice match computation

## Service pattern

```typescript
// services/myFeatureService.ts
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { myTable } from '@curavend/db';

export interface DoSomethingArgs {
  hospitalId: string;
  // ...
}

export interface DoSomethingResult {
  // ...
}

export async function doSomething(
  d1: D1Database,
  args: DoSomethingArgs,
): Promise<DoSomethingResult> {
  const db = getDb(d1);
  // ... business logic ...
  return { /* ... */ };
}
```

Routes consume:

```typescript
// routes/myFeature.ts
import { doSomething } from '../services/myFeatureService';

app.post('/', requirePermission('my-resource', 'WRITE'), async (c) => {
  const result = await doSomething(c.env.DB, {
    hospitalId: c.get('user').hospitalId!,
  });
  return c.json(result);
});
```

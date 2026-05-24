# packages/api/scripts/

Smoke tests + tooling scripts scoped to the API package.

## What's here

### `smoke-pv2-tenant-scope.sh`
Cross-tenant security smoke test. Hits ~26 PV2 + PV3 routes with a
hospital-A JWT and probes for cross-tenant data leakage. Every probe
should return 403/404 — 200/201 is reported as a WARN (the response
body needs eyeballing, since list endpoints returning the caller's OWN
data is expected).

**Setup:**

1. Log into https://curavend-web.pages.dev as any hospital user (call
   this user's hospital "A").
2. Open DevTools → Application → Local Storage → grab the JWT from
   `persist:root`'s nested `auth.token` value.
3. Pick a foreign hospital UUID (call it "B") that is NOT your hospital.
4. Optionally pick a foreign vendor UUID.

**Run:**

```bash
HOSP_A_TOKEN='eyJhbGciOi...' \
FOREIGN_HOSPITAL_ID='00000000-0000-0000-0000-000000000000' \
FOREIGN_VENDOR_ID='00000000-0000-0000-0000-000000000000' \
bash packages/api/scripts/smoke-pv2-tenant-scope.sh
```

**Expected output:**

```
=== Cross-tenant smoke test (PV2 routes) ===
BASE:               https://curavend-api.metabilityllc1.workers.dev
FOREIGN_HOSPITAL:   00000000-0000-0000-0000-000000000000
FOREIGN_VENDOR:     ...

  PASS  GET /api/budgets?hospitalId=B (...)  (403)
  PASS  GET /api/purchase-orders/<bogus-id>  (404)
  PASS  GET /api/vendor-onboarding?hospitalId=B  (403)
  ... etc ...

=== Result ===
  Total:  26
  Pass:   26
  Warn:   0
```

Coverage:
- PV2 routes: budgets, purchase-orders, vendor-onboarding, rmas,
  compliance-alerts, point-of-use, logistics, invoice-match-rules,
  reporting/department-spend, reporting/gl, item-master-hygiene,
  cross-site-inventory, backorders
- PV3 routes: transfers, recalls, controlled-substance, substitutions,
  charge-capture-leakage, price-variance, clinical-consumption,
  hospital-forecast, vendor-scorecard, emergency-review-queue,
  controlled-substance event POST

## When to run

- After deploying changes to ANY tenant-scoped route.
- Periodically (monthly?) as a regression check.
- Before granting a new persona type access (re-verify with that
  persona's JWT).

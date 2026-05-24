# src/cron/

Scheduled-event handlers. Wrangler triggers `index.ts`'s `scheduled()`
function on the configured crons; that dispatcher delegates to these
handlers based on `event.cron`.

## Cron schedule

| Cron | Window | Handlers (in dispatch order) |
|---|---|---|
| `*/15 * * * *` | every 15 min | `workflowService.processEventTimeouts()` |
| `0 8 * * *` | daily 08:00 UTC | `dmeposExpiry.ts` → `labReplenishment.ts (auto-replen)` → `labReplenishment.ts (expiration)` → `complianceAlertService.sweepComplianceAlerts()` → `vendorScorecardService.computeVendorScorecards()` |
| `0 6 1 * *` | monthly 1st 06:00 UTC | `oigService.handleOigRefresh()` |

## Files

### `dmeposExpiry.ts`
`handleDmeposExpiry(env)` — walks `vendor_dmepos_compliance` for
accreditations expiring within 60 / 30 / 7 days. Emits one notification
per (vendor × threshold) so the same expiry doesn't spam every day.

### `labReplenishment.ts`
Two exports:

- `handleLabAutoReplenishment(env)` — walks `getReorderCandidates()`,
  groups by (hospital × preferredVendor), spawns a SUBMITTED requisition
  via the approval-rules engine. Idempotent via daily title key.
- `handleLabExpiration(env)` — marks lots whose `expiration_date` is in
  the past as `EXPIRED`, returns counts for 30 / 60 / 90 day buckets so
  the dashboard can show pre-expiry warnings.

### `dmeRentalBilling.ts`
Monthly DME rental billing. Currently dispatched at the start of each
month from the `0 8 * * *` cron when `now.getDate() === 1` — could move
to its own monthly cron later.

## Design

All cron handlers:
- Take `env: Env` so they can reach D1, KV, R2 from the Workers runtime.
- Return a small result object (`{ counts, errors }`) for the dispatcher
  to log.
- Wrap top-level work in `ctx.waitUntil()` from the dispatcher side so
  the Worker can return quickly while the work runs in the background.
- Are idempotent — re-running on the same day must not double-act.

## Adding a new cron

1. Add a new handler file under `src/cron/`.
2. Export `handleSomething(env: Env): Promise<{ ... }>`.
3. Wire it into `src/index.ts`'s `scheduled()` dispatcher under the
   appropriate cron case.
4. If the work fits an existing cron window, just add it there. If you
   need a new schedule, edit `wrangler.toml` and re-deploy.

## Local testing

```bash
# Manually fire a cron handler from a route (admin-only):
curl -X POST https://curavend-api.metabilityllc1.workers.dev/api/compliance-alerts/sweep \
  -H "Authorization: Bearer <admin-jwt>"
```

Most cron handlers expose a `/sweep` or `/compute` POST endpoint on the
matching route file for manual testing.

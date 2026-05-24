# Curavend

A multi-tenant healthcare supply-chain platform, built on Cloudflare.
Six personas (Hospital · Vendor · Lab · Provider · Super-Vendor · Admin)
share one ordering, requisition, inventory, billing, and compliance stack.

**Live:**
- Web: https://curavend-web.pages.dev
- API: https://curavend-api.metabilityllc1.workers.dev
- Public landing: https://curavend-web.pages.dev/

## What's in the box

| Layer | Tech |
|---|---|
| API | Cloudflare Workers + Hono v4 + Drizzle ORM |
| DB | Cloudflare D1 (SQLite, 145 tables) |
| Web | React 18 + Vite 6 + Ant Design 5 + Redux Toolkit |
| Files | Cloudflare R2 |
| Queues | Cloudflare Queues (events bus) |
| Cache | Cloudflare KV |
| AI | Cloudflare Workers AI (Llama 3.2 Vision — medical-order extractor) |
| PDF | Cloudflare Browser Rendering + pdf-lib |
| Email | Resend |
| Auth | JWT + Turnstile + TOTP/Email OTP MFA |

## Repo layout

```
curavend/
├─ packages/
│  ├─ api/        # Cloudflare Worker — Hono routes, services, crons, queues
│  ├─ db/         # Drizzle schemas + SQL migrations
│  ├─ shared/     # Cross-package types + utilities
│  └─ web/        # React SPA — Pages-hosted
├─ docs/training/ # 52 feature docs + 23 workflow recipes (powers /help-center)
├─ scripts/       # Out-of-band smoke tests + tooling
└─ .gitignore .  pnpm-lock.yaml  pnpm-workspace.yaml ...
```

Each top-level folder has its own README explaining what lives there. Start
with `packages/api/README.md` for the backend, `packages/web/README.md` for
the frontend, `packages/db/README.md` for the data model.

## Quick start (dev)

```bash
# Install
pnpm install

# Start the API locally (against remote D1)
cd packages/api && npx wrangler dev

# Start the web SPA
cd packages/web && npm run dev   # → http://localhost:5173
```

A `.env.local` is NOT required for the web SPA in dev — it talks to the
deployed API by default. Override via `VITE_API_URL` if you want to point
at a local Worker.

## Deploy

```bash
# API
cd packages/api && npx wrangler deploy

# Web (Cloudflare Pages)
cd packages/web && npm run build
npx wrangler pages deploy dist --project-name=curavend-web
```

D1 migrations live under `packages/db/src/migrations/` and are applied
manually:

```bash
cd packages/api
npx wrangler d1 execute curavend --remote --file=../db/src/migrations/0022_procurement_v3.sql
```

## Personas & key features

- **Hospital** — requisitions, orders, budgets, GL, dept spend, formulary,
  prior auth, goods receipts, 3-way matching, recalls, emergency purchasing
- **Vendor** — incoming orders, PO transmission (EDI/API/PunchOut/email/portal),
  ACK, RMAs, scorecards, customer POs, contracts
- **Lab** — kit-site inventory, FEFO consumption, auto-replenishment cron,
  expiration sweep, lot audit, test→consumable mappings
- **Provider** — orders for hospitals, contract pricing, sub-status flows
- **Super-Vendor** — aggregate view across owned vendors
- **Admin** — workflows, OIG/HIPAA audit, supplier onboarding, compliance
  dashboard, recalls, controlled-substance log, vendor scorecards

## State machines

- **Orders** — 8 sub-statuses (`NEW_ORDER` → `VENDOR_ASSIGNED` → `VENDOR_CONFIRMED`
  → `ASSESSED` → `DELIVERED` → `PROOF` → `COMPLETED`)
- **Requisitions** — 7 states (`DRAFT` → `SUBMITTED` → `IN_REVIEW` →
  `APPROVED` → `CONVERTED` | `REJECTED` | `CANCELLED`) + emergency fast-lane
- **Vendor onboarding** — 7 states (`INVITED` → `DOCS_PENDING` →
  `DOCS_RECEIVED` → `CREDENTIALED` → `APPROVED` → `ACTIVE` | `SUSPENDED`)
- **PO transmission** — `NOT_SENT` → `SENDING` → `SENT` → `ACKED` | `FAILED`
- **RMA** — 8 states (`DRAFT` → `SUBMITTED` → `APPROVED` → `SHIPPED` →
  `RECEIVED` → `CREDITED` | `REJECTED` | `CANCELLED`)
- **Transfers** — 5 states (`REQUESTED` → `APPROVED` → `SHIPPED` → `RECEIVED`
  | `CANCELLED`)
- **Recalls** — 3 states (`OPEN` → `INVESTIGATING` → `CLOSED`)
- **Workflow instances** — generic CCID workflow runtime (`workflow_instances`
  + `workflow_activity_log` + `workflow_events`)

## Pricing cascade

4-tier resolver, first match wins per HCPC line:

1. **Contract** — active contract_items for (hospital, vendor)
2. **GPO** — gpo_contract_items via hospital's GPO membership
3. **Medicare/Fee schedule** — state_rate_schedules / medicare_fee_schedules
4. **Manual** — vendor fills price at invoice time

## Cron schedule

| Cron | Window | Jobs |
|---|---|---|
| `*/15 * * * *` | every 15 min | Workflow event-timeout sweep |
| `0 8 * * *` | daily 08:00 UTC | DMEPOS expiry · lab auto-replenishment · lab expiration sweep · compliance alert sweep · vendor scorecard recompute |
| `0 6 1 * *` | monthly 1st 06:00 UTC | OIG LEIE exclusion-list refresh |

## Migrations

23 total (`0000_overrated_darkhawk.sql` → `0022_procurement_v3.sql`). Each
migration is idempotent on re-run. See `packages/db/src/migrations/README.md`
for the full timeline.

## Compliance posture

- HIPAA — PHI access log + consent log on every read of patient data
- OIG — monthly LEIE refresh + per-user/per-vendor screening
- MFA — TOTP + Email OTP enrollment tracking
- Auth audit — every login + token issue logged
- File access — every R2 download logged with user + reason
- DEA — Schedule II–V chain-of-custody log with witness enforcement
- Cold chain — temp readings + excursion flagging for sensitive shipments
- DMEPOS — accreditation + license + insurance pre-expiry alerts (60/30/7 days)
- Recalls — manufacturer-notice intake with auto-scan of inventory + POU events

## Documentation

- **In-app help center** — `/help-center` route; 52 feature docs + 23
  workflow recipes, role-gated.
- **Source-controlled docs** — `docs/training/`. Single source of truth;
  the help center reads from a built copy at `packages/web/public/docs/`.
- **API surface** — every route file under `packages/api/src/routes/` has
  a header docblock listing its endpoints + state semantics.

## Project history

This repo is the third major iteration of the platform (originally ProxyIQ).
Session 17 closed 26 procurement-workflow gaps spanning operational,
financial, compliance, and decision-support themes. See
`docs/training/README.md` for a session-by-session feature timeline.

## License

Private. All rights reserved.

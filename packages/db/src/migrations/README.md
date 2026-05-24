# src/migrations/

SQL migrations applied to the remote D1 database via wrangler. The source
of truth for the database SHAPE — the TS schemas in `../schema/` must
match what's been applied here.

## Apply a migration

```bash
cd packages/api
npx wrangler d1 execute curavend --remote --file=../db/src/migrations/00NN_what_changed.sql
```

Don't use `wrangler d1 migrations apply` — it tracks state in a metadata
table that we don't use. The explicit `execute` form is what's been used
historically.

## Migration timeline

Each migration is idempotent on re-run (CREATE TABLE IF NOT EXISTS,
ALTER TABLE ADD COLUMN swallowing the "already exists" error, etc.).

| # | File | What landed |
|---|---|---|
| 0000 | `0000_overrated_darkhawk.sql` | Initial schema — orders, users, hospitals, vendors, invoices, contracts, etc. |
| 0001 | `0001_oig_state_rates.sql` | OIG LEIE exclusion list + state-rate schedules |
| 0002 | `0002_chat_rooms.sql` | Rooms + messages for Durable Object chat |
| 0003 | `0003_lab_portal_and_medzah_parity.sql` | Lab portal core + Medzah parity columns |
| 0004 | `0004_phase_d_shipments_etc.sql` | Order shipments + carrier tracking |
| 0005 | `0005_workflow_control_plane.sql` | CCID workflow runtime (instances, activity log, events) |
| 0006 | `0006_user_groups.sql` | User groups + group permissions |
| 0007 | `0007_gpo_pricing.sql` | GPO organizations + contract items |
| 0008 | `0008_payors.sql` | Payors + payor contract items |
| 0009 | `0009_prior_auths.sql` | Prior authorization workflow |
| 0010 | `0010_ehr_connections.sql` | EHR FHIR adapter config |
| 0011 | `0011_formulary.sql` | Formulary items + substitutes |
| 0012 | `0012_requisitions.sql` | Requisition workflow + approval rules |
| 0013 | `0013_orders_requisition_link.sql` | `orders.requisition_id` backref |
| 0014 | `0014_goods_receipts_and_matching.sql` | Goods receipts + 3-way match |
| 0015 | `0015_dme_documents.sql` | DME documents (DWO, CMN, PA), DMEPOS compliance sidecar |
| 0016 | `0016_cms_lcd.sql` | CMS LCD ingestion + coverage criteria |
| 0017 | `0017_dme_seed_expansion.sql` | Expanded DME PA + LCD seed data |
| 0018 | `0018_lab_inventory.sql` | Lab consumables + lots + movements + backorders |
| 0019 | `0019_lab_consumables_seed.sql` | 50+ seeded consumables + 35 test→consumable mappings |
| **0020** | `0020_procurement_close.sql` | **PV1**: budgets, dept metadata, PO enrichment, PO transmission, GL ledger (137 tables) |
| **0021** | `0021_procurement_v2.sql` | **PV2**: vendor onboarding, RMAs, invoice match rules, POU events, shipment temp logs, compliance alerts (137 tables) |
| **0022** | `0022_procurement_v3.sql` | **PV3**: inventory transfers, recalls, controlled substance, substitution audit, vendor scorecards, hospital forecast (145 tables) |

## Conventions

- Filename: `00NN_short_lowercase_description.sql`. NN is monotonic — never
  reuse, never reorder.
- One purpose per migration. Don't bundle unrelated changes.
- Always include a header comment block explaining what + why.
- For new tables: `CREATE TABLE` + every index + (if needed) seed data.
- For column additions: `ALTER TABLE ... ADD COLUMN ...` (SQLite supports
  this; no default-value gotchas for nullable cols).
- For column type changes: D1/SQLite can't do this directly. Create a new
  table, copy, swap, drop. Avoid if possible.

## Idempotency

Each migration must be safe to re-run on a DB where it's partially or
fully applied. Standard tricks:

- `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ADD COLUMN` → wrap in a try/catch at the app layer, or
  just accept the error (wrangler will log it; the table is unchanged).

## Snapshots

`meta/` holds drizzle-kit's snapshot JSONs. We DON'T use drizzle-kit for
generating migrations (the manual SQL approach gives more control), but
the snapshots are kept for reference.

## seed_*.sql

Seed data lives next to migrations but uses `seed_<topic>.sql` naming so
it doesn't get picked up by automatic migration tooling. Currently:

- `seed_medicare.sql` — Medicare fee schedule sample data

## Local dev DB

```bash
# Apply all migrations to a local D1 instance:
cd packages/api
for f in ../db/src/migrations/00*.sql; do
  npx wrangler d1 execute curavend --local --file="$f"
done
```

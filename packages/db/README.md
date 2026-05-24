# @curavend/db

Drizzle ORM schemas + SQL migrations + relations for the Curavend D1 database.
Currently **145 tables**.

## Layout

```
src/
├─ schema/        # Drizzle TS schema files (one per table or close-knit group)
├─ migrations/    # SQL files run by wrangler against D1
└─ index.ts       # Drizzle client factory
```

`schema/` is the source of truth for TypeScript types — `api/` and `web/`
both import `@curavend/db` to get strong types on query results.

`migrations/` is the source of truth for the database SHAPE — what actually
exists at the SQL level. The two must stay in sync.

## Workflow

When you need a new column or table:

1. Edit the relevant TS file in `schema/` (add the column / new sqliteTable).
2. Add it to `schema/index.ts` exports if new.
3. Write a corresponding SQL migration in `migrations/00NN_what_changed.sql`.
4. Apply to remote D1:
   ```bash
   cd packages/api
   npx wrangler d1 execute curavend --remote --file=../db/src/migrations/00NN_what_changed.sql
   ```
5. Re-deploy the API (`npx wrangler deploy`) so the new types are live.

## Migration numbering

`00NN_<short_description>.sql` — increment monotonically. Never rename
or reorder applied migrations.

## drizzle-orm version

Pinned to `^0.38.0`. The 0.36 typings only accepted the object form for
`extraConfig`; 0.38 accepts the array form (which all our schemas use).
Don't downgrade.

## Schema conventions

- IDs are TEXT (`text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`)
- Timestamps are ISO 8601 strings, NOT integers (`text('created_at')...`)
- Booleans are integers (0 / 1) because SQLite has no native bool
- Money is `real` (USD with 2 decimal precision) — for cents-precise math
  see `invoice_items.unit_price_cents` (integer)
- JSON columns are TEXT — `JSON.stringify`/`JSON.parse` at the application
  layer

## Indexes

Every column that's used in a WHERE or JOIN should have an index. Pattern:

```typescript
(table) => [
  index('my_table_hospital_idx').on(table.hospitalId),
  index('my_table_status_idx').on(table.status),
  uniqueIndex('my_table_uq').on(table.hospitalId, table.code),
]
```

Index names start with the table name + the column name + `_idx` (or `_uq`
for unique).

## Sidecar tables

D1 (SQLite) has a soft column ceiling around 100 columns per table.
Several tables in this schema use a sidecar pattern (1:1 child table)
to stay under the limit:

- `orders` ← `dme_order_extensions` (DME-specific fields)
- `vendors` ← `vendor_dmepos_compliance` (DMEPOS supplier compliance)
- `vendors` ← `vendor_compliance_docs` (per-doc files)

When you need to add more columns to a table that's already at the limit,
extend its sidecar instead.

## Tenant columns

The platform is multi-tenant. Most tables have ONE of these tenant
columns (or a join through to one):

- `hospital_id` — hospital persona tables
- `vendor_id` — vendor persona tables
- `lab_group_id` (via `lab_kit_sites`) — lab persona tables
- `provider_id` — provider org tables
- `super_vendor_id` — super-vendor org tables

The API enforces scoping based on the JWT's tenant claims. See
`packages/api/README.md` for the pattern.

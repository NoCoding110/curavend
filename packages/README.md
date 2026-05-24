# packages/

Pnpm workspace with four packages. Each has its own README; this file is
the table of contents.

| Package | What it is | Deploys to |
|---|---|---|
| **api/** | Hono v4 Worker — REST routes, services, crons, queue consumers | Cloudflare Workers (`curavend-api`) |
| **db/** | Drizzle schemas + SQL migrations + relations | Imported by `api/` and `web/` for shared types |
| **shared/** | Cross-package utility types (small) | Bundled into both `api/` and `web/` |
| **web/** | React 18 SPA — Ant Design 5 + Redux Toolkit | Cloudflare Pages (`curavend-web`) |

## Dependency graph

```
web/    ──→ shared/    (types)
        ──→ db/        (drizzle schema types — used to type API responses)

api/    ──→ shared/    (types)
        ──→ db/        (schemas, drizzle queries, migration source)
```

Build order if you bump `db/` schema:
1. Edit schema TS files in `db/src/schema/`
2. Add a corresponding SQL migration in `db/src/migrations/`
3. Apply migration to remote D1 via wrangler (see `db/README.md`)
4. `api/` and `web/` automatically pick up the new TS types

## Conventions

- All packages use **TypeScript strict mode**.
- All packages use **drizzle-orm 0.38+** (array-form `extraConfig`).
- All packages use **pnpm** with `pnpm-workspace.yaml` at the repo root.
- Cross-package imports use the `@curavend/<pkg>` alias defined in each
  `package.json`'s `dependencies`.

## Running locally

From the repo root:

```bash
pnpm install                                          # install everything
pnpm --filter @curavend/api dev                       # start the Worker
pnpm --filter @curavend/web dev                       # start the SPA
pnpm --filter @curavend/api exec tsc --noEmit         # type-check api
pnpm --filter @curavend/web exec tsc --noEmit         # type-check web
```

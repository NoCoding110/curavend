# @curavend/shared

Cross-package types and utilities. Imported by both `@curavend/api` and
`@curavend/web` so they stay in sync on shared shapes.

## What goes here

- Types that BOTH the API and web depend on (e.g. order sub-status enum,
  notification payload shape, RBAC role string union).
- Pure utility functions with no Cloudflare-runtime / DOM-runtime deps
  (e.g. cents↔dollars helpers, date formatters).

## What does NOT go here

- API-only types (Hono context, Drizzle query results) — those live in
  `@curavend/api`.
- Web-only types (Redux state, React props) — those live in `@curavend/web`.
- Drizzle schema types — already exported from `@curavend/db`.

## Why it exists

When the API and web need to agree on a literal (say, the 8 order
sub-statuses), defining it twice and keeping them in sync is error-prone.
This package gives one home for those agreements.

## Adding to it

1. Export the type or function from a new file in `src/`.
2. Re-export from `src/index.ts`.
3. Import in api/web via `@curavend/shared`.

No build step — TypeScript source is imported directly (the `main` /
`types` fields in package.json point at `src/index.ts`).

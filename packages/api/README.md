# @curavend/api

Cloudflare Worker — the entire REST API for Curavend. Built with Hono v4
on top of Drizzle ORM (talking to D1).

## Entry point

`src/index.ts` mounts ~60 route modules and exports the Worker handler.
The handler is wrapped with `Sentry.withSentry()` and also dispatches:

- `fetch` — normal HTTP requests
- `scheduled` — three cron triggers (see below)
- `queue` — consumer for the `curavend-events` queue

## Folder layout

```
src/
├─ index.ts                  # Worker entry, route table, cron dispatcher
├─ routes/                   # Per-resource Hono apps (one file each)
├─ services/                 # Pure business logic (no Hono)
├─ middleware/               # Auth, RBAC, permissions, logging
├─ cron/                     # Scheduled-event handlers
├─ queues/                   # Queue consumers
├─ workflows/                # CCID-style workflow runtime
├─ jobs/                     # Long-running queued work
├─ durable-objects/          # WebSocket chat rooms
├─ emails/                   # React email templates (Resend)
└─ lib/                      # Env binding types, drizzle client, errors
```

Each subfolder has its own README explaining what lives there and its
naming conventions.

## Cron schedule

| Cron | Handlers (in dispatch order) |
|---|---|
| `*/15 * * * *` | Workflow event-timeout sweep |
| `0 8 * * *` | DMEPOS expiry · lab auto-replenishment · lab expiration · compliance alert sweep · vendor scorecard recompute |
| `0 6 1 * *` | OIG LEIE refresh |

## Bindings (`wrangler.toml`)

| Binding | What |
|---|---|
| `DB` | D1 database `curavend` |
| `R2` | R2 bucket `curavend-uploads` (file storage) |
| `KV` | KV namespace (rate limits, OIG cache, etc.) |
| `EVENTS_QUEUE` | Cloudflare Queue (event bus) |
| `BROWSER` | Browser Rendering (HTML → PDF) |
| `AI` | Workers AI (Llama 3.2 Vision) |
| `CHAT_ROOM` | Durable Object for WebSocket chat |
| `ENVIRONMENT` | `"production"` |
| `FRONTEND_URL` | Web app URL (for CORS, email links) |

## Local dev

```bash
npx wrangler dev          # local Worker against REMOTE D1
npx wrangler dev --local  # fully local (mock D1)
```

## Deploy

```bash
npx wrangler deploy
```

The deploy command:
1. Bundles TypeScript with esbuild
2. Uploads to Cloudflare
3. Re-registers the cron triggers
4. Re-binds the queue producer/consumer

## Type-checking

```bash
npx tsc --noEmit
```

Both packages should be TypeScript-clean (0 errors) before deploy.
Drizzle-orm warnings on schema files were eliminated in Session 17 by
bumping to 0.38+.

## Tenant scoping pattern

Every route that returns or mutates per-hospital / per-vendor data follows
this pattern:

```typescript
function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/', requirePermission('budgets', 'READ'), async (c) => {
  const user = c.get('user');
  const conds: any[] = [];
  if (!isAdmin(user)) {
    if (!user.hospitalId) throw new ForbiddenError('hospital scope required');
    conds.push(eq(table.hospitalId, user.hospitalId));
  }
  // ... rest of query
});
```

Per-id endpoints use `assertOwns<Resource>(d1, user, id)` helpers that
verify the row's tenant before returning or mutating.

## Permissions matrix

23 resources (see `packages/db/src/schema/userPermissions.ts`), 4 levels
(`NONE` / `READ` / `WRITE` / `FULL`). Admin + facility-manager roles
fast-path to FULL inside `middleware/requirePermission.ts`.

## Smoke testing

```bash
scripts/smoke-pv2-tenant-scope.sh   # cross-tenant probes (needs JWT)
```

See `scripts/README.md` for the env vars to set.

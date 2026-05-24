# src/middleware/

Hono middleware. Applied at the top of `src/index.ts` BEFORE the route
table so every route inherits the same auth + scope guarantees.

## Stack order

```
fetch → cors → auth → requirePermission(<resource>, <level>) → handler
```

`cors` and `auth` run for every request; `requirePermission` is opt-in
per handler.

## Files

### `auth.ts`
- Verifies the `Authorization: Bearer <jwt>` header (or `cf-turnstile-token`
  for unauthenticated form submissions).
- Loads the `AuthUser` (id, role, hospitalId, vendorId, labGroupId, etc.)
  from the JWT claims + a quick D1 lookup.
- Populates `c.set('user', user)` for downstream handlers.
- Maintains the `PUBLIC_PATHS` / `PUBLIC_PREFIXES` allowlist (login,
  signup, public webhooks, health probe).
- 401's any authed route with no / expired / tampered token.

### `requirePermission.ts`
- Per-handler middleware: `requirePermission(resource, level)`.
- Fast-path: admin (`ACCOUNT_MANAGER`, `ACCOUNT_MANAGER_USER`) and
  facility-manager (`FACILITY_ACCOUNT_MANAGER`) roles always return FULL
  without a DB lookup.
- Otherwise: merges the user's explicit grants from `user_permissions`
  with grants inherited from their `user_groups` via `groupResolver`.
- 403's if the merged level for `resource` is below `level`.
- Levels: `NONE < READ < WRITE < FULL`.

### `rbac.ts`
- Older role-based gate kept around for routes that haven't migrated to
  `requirePermission`. Accepts a list of role strings; 403's if the
  caller's role isn't in the list.

### `errorHandler.ts`
- Catches `AppError` subclasses (`ValidationError`, `NotFoundError`,
  `ConflictError`, `ForbiddenError`, `UnauthorizedError`) and maps them
  to the right HTTP status with a `{ error: string }` body.
- Catches anything else and returns 500 with the error message (and stack
  in dev).

### `requestLogger.ts`
- Console.log every request: method, path, status, ms.
- Cheap; Sentry captures the rest.

### `phiAccessLog.ts`
- For routes that touch patient data: writes a row to `phi_access_log`
  before returning, recording user + reason + record IDs accessed.
- HIPAA evidence trail.

## Adding middleware

1. Write your function as a `MiddlewareHandler` from `hono`.
2. Either mount globally in `src/index.ts` or wrap specific handlers:
   ```typescript
   app.get('/sensitive', myMiddleware, requirePermission('x', 'WRITE'), handler);
   ```
3. If you stash anything on the context, type it in the `Variables`
   generic on your Hono app:
   ```typescript
   const app = new Hono<{ Variables: { user: AuthUser; myThing: MyType } }>();
   ```

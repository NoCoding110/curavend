# @curavend/web

The Curavend SPA — React 18 + Vite 6 + Ant Design 5 + Redux Toolkit.
Hosted on Cloudflare Pages.

## Structure

```
src/
├─ api/           # Typed fetch wrappers — one file per resource
├─ components/    # Shared / app-shell components (layout, breadcrumbs, etc.)
├─ contexts/      # React contexts (auth, theme, etc.)
├─ features/      # Per-feature folder of pages (the bulk of the app)
├─ hooks/         # Reusable hooks (usePermissions, useUserRoles, etc.)
├─ layouts/       # MainLayout (sidebar + header) + AuthLayout
├─ lib/           # Cross-feature pure utils (routeBreadcrumbs, etc.)
├─ routes/        # AllRoutes + PrivateRoute guards
├─ store/         # Redux store + slices
├─ styles/        # Global SCSS + Less variables
└─ utils/         # Misc helpers
```

`features/` is where 90% of new work goes — see `src/features/README.md`.

## State management

- **Redux Toolkit** for app-wide state (auth, user, notifications).
- **Local component state** for everything else (no Zustand, no Jotai).
- **Server state** is fetched per-page via `api/client.ts` (no React Query).
  Most pages do a single `useEffect(() => { load(); }, [])` pattern.

## Routing

`react-router-dom` v6, lazy-loaded routes in `routes/AllRoutes.tsx`.
- Public: `/` (landing), `/login`, `/signup`, `/forgot-password`
- Authed: everything else, wrapped in `PrivateRoute` which redirects to
  `/login` when there's no token.

## Auth flow

1. Login posts to `/api/auth/login` with email + password + Turnstile token.
2. Response is `{ token, refreshToken, user }`. Stored in Redux + persisted
   to localStorage (via `redux-persist`).
3. `api/client.ts` attaches `Authorization: Bearer <token>` to every request.
4. 401 responses trigger a refresh-token flow (concurrent-safe queue).
5. Logout clears the persisted state + redirects to `/login`.

## Permissions

```typescript
import { usePermissions } from '../hooks/usePermissions';

function MyComponent() {
  const { can } = usePermissions();
  return (
    <>
      {can('budgets', 'WRITE') && <Button>Edit budget</Button>}
    </>
  );
}
```

23 resources, 4 levels. See `src/hooks/usePermissions.ts` for the helper
and `src/api/userPermissions.ts` for the full resource list.

Sidebar entries are also gated via `can()` so off-permission users don't
see menu items they can't use.

## Theming

Ant Design tokens overridden in `src/configs/themeConfig.ts`:
- Primary color: `#1BAEE5`
- Text: `#212121` / `#666666`

Less variables in `vite.config.ts` keep the legacy LESS imports aligned.

## Local dev

```bash
npm run dev          # http://localhost:5173, talks to deployed API by default
VITE_API_URL=http://localhost:8787 npm run dev   # talk to local Worker
```

## Build & deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name=curavend-web
```

Build output goes to `dist/`. The vite config sets up `manualChunks` for
heavy libs (three.js for the landing page, jspdf, etc.) so the initial
chunk stays small.

## Lazy-loading rules

- Every route in `AllRoutes.tsx` uses `lazy()` — no exceptions.
- Heavy libs (three.js, jspdf, html2canvas) are dynamically imported from
  the components that use them.
- Landing-page 3D scene is double-lazy — loaded only when its section
  scrolls into view.

## Type-checking

```bash
npx tsc --noEmit
```

Should be 0 errors. Drizzle types come from `@curavend/db` — if that
package adds a column, the web tsc may flag stale destructures.

## Help center docs

The help center reads markdown from `public/docs/`. CI copies the source
docs from `docs/training/` at build time (see `scripts/sync-docs.mjs`).

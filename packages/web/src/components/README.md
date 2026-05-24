# src/components/

Shared components — the app shell + reusable building blocks NOT specific
to any one feature.

## What's here

### Layout
- `layout/MainLayout.tsx` — sidebar + header + content area
- `layout/Sidebar.tsx` — left nav, role-gated menu items via `can()`
- `layout/Header.tsx` — top bar with logo, avatar dropdown, notifications
- `layout/AutoBreadcrumb.tsx` — reads `lib/routeBreadcrumbs.ts` and renders
- `layout/PageBreadcrumb.tsx` — manual override component for dynamic crumbs

### Tables
- `table/useResizableColumns.ts` — column-resize behavior for AntD Table
- `table/filterPresets.tsx` — saved-filter UI shared across list pages

### Forms
- `form/AddressForm.tsx` — reusable address subform
- `form/ContactForm.tsx` — reusable contact subform
- `form/SignaturePad.tsx` — `react-signature-canvas` wrapper

### Other
- `PrivateRoute.tsx` — moved to `routes/` (lives at `src/routes/PrivateRoute.tsx`)
- `Loading.tsx` — full-screen spinner
- `ErrorBoundary.tsx` — top-level React error boundary

## Conventions

- **Generic only.** Feature-specific components go in
  `src/features/<domain>/components/`, NOT here.
- **styled-components** for layout-level CSS. Ant Design for primitives.
- Each component file exports a default React.FC.
- Hooks colocated with components: `Foo.tsx` + `useFoo.ts` if needed.

# scripts/

Repo-root scripts that don't belong inside a package.

## What's here

### `smoke-test.mjs`
End-to-end smoke test runner. Hits the deployed API with a real JWT and
exercises a representative slice of routes per persona (hospital, vendor,
lab, admin). Used as a sanity check after a deploy.

**Usage:**
```bash
CURAVEND_TOKEN='ey...' node scripts/smoke-test.mjs
```

Paste a JWT from your browser DevTools → Local Storage. Cloudflare
Turnstile blocks programmatic login so we can't do the login dance here.

## See also

- `packages/api/scripts/smoke-pv2-tenant-scope.sh` — cross-tenant security
  smoke test (probes ~26 routes across PV2 + PV3). Lives in the api
  package because it's API-specific.

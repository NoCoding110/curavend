# Payors & Eligibility

## What it does

Payors are the insurance plans that ultimately reimburse for the items Curavend orders. The Payors feature is two things in one: a **payor master + contract table** (allowable amounts per HCPC, patient responsibility, PA-required flag), and an **eligibility-check stub** that takes a patient member ID and returns a 270/271-style response (cached for repeat lookups).

In production the eligibility stub returns deterministic synthetic data — the architecture is ready to plug in a real X12 270/271 clearinghouse later by swapping the service implementation.

## Who uses it

- **Admin** — author the payor master and allowable-rate tables.
- **Hospital** billing/intake staff — run eligibility checks on patients.
- **Hospital** PA coordinators — see which HCPCs require PA per payor (drives [Prior Auths](./06-prior-auths.md)).

## The page

**Sidebar →** Admin → Payors. Route is `/admin/payors`.

![Payors admin](../images/feature-payors-admin.png)

- **Left**: payor list, each tile color-coded by kind (`MEDICARE`, `MEDICAID`, `BCBS`, `UHC`, `AETNA`, `CIGNA`, `HUMANA`, `SELF_PAY`).
- **Right**: tabs for the selected payor:
  - **Overview** — name, kind, contact info, status.
  - **Allowable rates** — per-HCPC table: allowable amount, patient responsibility, `requires_prior_auth` flag, effective window.
  - **Eligibility check** — drawer with member-ID input + "Run check" button. Returns stubbed response: `active` / `inactive`, plan name, copay, deductible, remaining-deductible.

Seeded payors out of the box: **Medicare**, **Medicaid**, **BCBS**, **UHC**, **Aetna**, **Cigna**, **Humana**, **Self-Pay** (Session 10).

## Actions you can take

| Action | What it does | Permission |
|---|---|---|
| **Add payor** | New row in `payors` | `ADMIN` |
| **Edit payor** | Update kind, contact info, status | `ADMIN` |
| **Add allowable rate** | Add HCPC × allowable × patient-resp × PA-flag | `ADMIN` |
| **Run eligibility check** | Caches a deterministic stubbed 270/271 response | hospital staff with `orders: WRITE` |
| **Link payor to order** | On `/create-order` — sets `payorId`, `payorMemberId`, `payorGroupId` | hospital staff |

## Workflow

### Eligibility-check stub logic

```mermaid
flowchart LR
  A[POST /api/payors/:id/eligibility-check<br/>{ memberId }] --> B{Cached<br/>response?}
  B -- Yes --> R1[Return cache]
  B -- No --> C[Hash memberId → active / inactive]
  C --> D[Generate copay,<br/>deductible from hash]
  D --> E[Insert eligibility_checks row]
  E --> R2[Return synthetic 270/271]
```

🛈 **Why a deterministic stub** — without a real clearinghouse contract, we still want consistent demo behavior. Hashing the member ID means the same member always gets the same fake plan / copay across sessions. Swap `payorEligibilityService.checkEligibility()` for a real X12 caller when ready.

🛈 **PA flag drives Prior Auths** — when an order is created and the payor's allowable-rate row has `requires_prior_auth = true` for that HCPC, the order is auto-tagged and a PA record is created in `NEEDED` state.

## Common tasks

- [Process a prior authorization](../workflows/08-process-prior-authorization.md)

## Permissions

Payor master is admin-only. Eligibility-check execution is open to any user with `orders: WRITE` (hospital intake staff). Cached responses honor tenant scoping — vendors don't see hospital eligibility lookups.

## Behind the scenes

- **API endpoints**:
  - `GET/POST/PATCH /api/payors`.
  - `GET/POST /api/payors/:id/contract-items` — allowable-rate table.
  - `POST /api/payors/:id/eligibility-check` — body `{memberId, groupId?}`; returns synthetic 270/271.
  - `GET /api/payors/:id/eligibility-checks` — recent cached lookups.
- **DB tables** (migration `0008_payors.sql`):
  - `payors` — id, name, `kind` (one of 8 `PAYOR_KINDS`), contact info, status.
  - `payor_contract_items` — `payorId`, `hcpcCode`, `allowableAmountCents`, `patientResponsibilityCents`, `requiresPriorAuth`, effective window.
  - `eligibility_checks` — cached responses keyed by `(payorId, memberId)`.
- **Order columns added**: `orders.payorId`, `orders.payorMemberId`, `orders.payorGroupId`.

## Related

- [Prior Authorizations](./06-prior-auths.md)
- [Orders](./02-orders.md)
- [Invoices](./09-invoices.md)

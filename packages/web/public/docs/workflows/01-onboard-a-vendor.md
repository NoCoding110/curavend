# Workflow 01 — Onboard a New Vendor

## At a glance

| | |
|---|---|
| **What** | Stand up a brand-new vendor organization in Curavend so a hospital can route orders to it. |
| **Persona** | Platform Admin (`ACCOUNT_MANAGER` / `ACCOUNT_MANAGER_USER`), with handoff to the new Vendor Admin. |
| **Prerequisites** | Vendor company name, primary contact email, service-area states/zips, at least one Curavend hospital that wants to buy from them. |
| **Estimated time** | 20-30 minutes (admin side) + 30-60 minutes (vendor self-setup). |

---

## Steps

### Phase A — Admin creates the vendor org

1. Sign in at **`/login`** as a platform admin (`admin@curavend.com` in the demo).
2. From the sidebar pick **Vendors** → you land on **`/vendors`**.
3. Click **New vendor** in the top-right.

   ![Step 3](../images/wf-onboard-vendor-step-3.png)

4. Fill the **Create Vendor** form:
   - **Name** — legal entity name (e.g. `MedSupply Pro`).
   - **NPI / Tax ID** — optional but recommended (used in OIG screening and 1099 reporting).
   - **Item categories** — multi-select: `DME`, `ORTHOTICS`, `BIOLOGICS`, `WOUND_CARE`, `PHARMACY`, etc. Controls which orders Curavend's routing engine will offer them.
   - **Primary state** — used by the routing engine's geographic filter.
5. Click **Save**. You're returned to **`/vendors`** with the new row at the top.

### Phase B — Invite the vendor admin user

6. Click into the new vendor's row → the detail page opens at **`/vendors/{id}`**.
7. Open the **Users** tab → click **Invite user**.
8. Enter the vendor primary contact's email, set **Role** to `VENDOR_ACCOUNT_MANAGER`, leave **Send email invite** checked, click **Send**.

   ![Step 8](../images/wf-onboard-vendor-step-8.png)

9. The invitee receives a Resend-delivered email with a one-click link that lands at **`/auth/accept-invite?token=…`**, prompts them to set a password, and (if MFA is enforced) walks them through TOTP setup.

### Phase C — Vendor admin completes self-setup

10. After login the new vendor admin lands at **`/dashboard`**. They should immediately complete four things, in this order:

    | # | Page | What to do |
    |---|---|---|
    | a | **`/vendor-locations`** | Add at least one warehouse / DC. State + zip-prefix list drives the geographic routing filter. |
    | b | **`/vendor-coverage`** | Pick the states and zip prefixes the vendor will service. (Granularity ≥ state, ≤ 5-digit zip.) |
    | c | **`/sku-catalog`** | Add the vendor's HCPC ↔ SKU mappings with pack sizes. Without this the pricing waterfall has nothing to price. |
    | d | **Settings → ERP Connector** at **`/profile`** → **Integrations** tab | Configure `HTTP_POST` / `WEBHOOK_POST` / `EDI_850` / `MANUAL` push and set the `authSecretRef` (the **name** of the env var, not the value). |

### Phase D — Hospital links to the new vendor

11. Have a Hospital admin sign in and go to **`/facility-vendors`** (titled "My Vendors" for hospitals).
12. Click **Add vendor** → search → select the newly created vendor → tick the facilities that may order from them → **Save**.

    ![Step 12](../images/wf-onboard-vendor-step-12.png)

13. From this moment the vendor will appear as a candidate in the routing engine for orders that match their item categories and coverage area.

---

## What happens behind the scenes

- `POST /api/vendors` creates a row in `vendors`, generates a tenant UUID, and seeds a system-default **Procurement Team** user-group for the tenant (migration `0006_user_groups.sql`).
- `POST /api/users` with `userType=VENDOR` inserts into `users` and `user_memberships`. Resend sends the invite email. The first login auto-issues an access JWT (`15m`) + refresh JWT (`7d`).
- The vendor's locations / coverage / SKUs all live in `vendor_locations`, `vendor_coverage`, `vendor_item_skus`.
- The hospital ↔ vendor link is a row in `hospital_vendors` (with per-facility scoping in `hospital_vendor_facilities`). Once present, `lib/vendorRouting.ts` can match this vendor.

---

## Verification

1. As admin, hit **`/vendors`** — your new vendor is listed with the correct categories and at least one location pill.
2. As the vendor admin, hit **`/dashboard`** — KPI cards render (even if zero), no "tenant not found" error.
3. As a hospital admin, place a test requisition for an HCPC the vendor covers. On the routing-preview drawer the new vendor should appear in the candidates list with a score.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Invite email never arrives | `RESEND_API_KEY` not set or vendor email blocked by their MX | Check **`/admin/integration-log`** for a `RESEND_SEND` row with status `RETRYING` / `DEAD_LETTER`. Resend manually from the admin row action. |
| Vendor admin signs in but sees an empty **Vendor Locations** page | Schema seeded but no locations yet | They must add the first location themselves on **`/vendor-locations`**; routing requires ≥ 1. |
| New vendor never appears in routing candidates | Missing coverage rows OR no overlapping item-category | Verify the vendor has at least one `vendor_coverage` row whose state matches the hospital and at least one matching item-category. |
| "ERP push failed" alerts after first real order | `authSecretRef` points at an env var that isn't set on the Worker | Use `wrangler secret put VENDOR_ACME_API_KEY` then re-run from **`/admin/integration-log`**. |

---

## Related

- Feature reference: [`features/18-user-management.md`](../features/18-user-management.md), [`features/02-orders.md`](../features/02-orders.md)
- Personas: [`personas/vendor.md`](../personas/vendor.md), [`personas/admin.md`](../personas/admin.md)
- Adjacent workflows: [`12-onboard-a-hospital.md`](./12-onboard-a-hospital.md), [`13-configure-ehr-feed.md`](./13-configure-ehr-feed.md), [`14-grant-user-permissions.md`](./14-grant-user-permissions.md)

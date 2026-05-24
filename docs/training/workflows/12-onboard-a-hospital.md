# Workflow 12 — Onboard a New Hospital

## At a glance

| | |
|---|---|
| **What** | Create a new hospital tenant, invite its admin, configure facilities / departments / physicians, attach to a GPO, and link to vendors. |
| **Persona** | Platform admin (creates tenant + admin), with handoff to Hospital Admin (everything else). |
| **Prerequisites** | Hospital legal name + NPI + primary contact email. Facility addresses. GPO membership (optional). |
| **Estimated time** | 45-90 minutes end-to-end. |

---

## Steps

### A — Admin creates the hospital tenant

1. Sign in as platform admin at **`/login`**.
2. From the sidebar pick **Hospitals** (admin-only menu under **Admin**) → **`/admin/hospitals`** or **`/hospitals`** depending on your nav. Click **New hospital**.
3. Fill the create form:
   - **Name** — legal entity name.
   - **NPI** — 10-digit National Provider Identifier.
   - **Tax ID** — used for 1099s and OIG.
   - **Order number prefix** — short code (e.g. `BGH`) used in `{PREFIX}-{YEAR}-{6digit}` order numbers.
   - **Primary address** — street / city / state / zip.
   - **Preferred currency** — defaults `USD`.
   - **Tax-exempt** — boolean; if true, also enter cert ID and expiry.
4. Click **Save**. A row is created in `hospitals` and a Procurement Team user-group is seeded.

   ![Step 4](../images/wf-onboard-hospital-step-4.png)

### B — Invite the hospital admin

5. Open the new hospital's detail page → **Users** tab → click **Invite user**.
6. Email + role `FACILITY_ACCOUNT_MANAGER`. Send invite.
7. Invitee accepts via emailed link, sets password, completes MFA.

### C — Hospital admin sets up facilities

8. The new hospital admin signs in and lands at **`/dashboard`**.
9. Go to **`/hospital-management`** (titled "Facilities & Departments"). Click **Add facility**.
10. Per facility, fill:
    - **Name** — e.g. _"Main Campus"_, _"North Clinic"_.
    - **Address** — full address; used by tax engine for jurisdiction lookup.
    - **Active** — toggle.
11. Click **Save**. Repeat for every physical location.

    ![Step 11](../images/wf-onboard-hospital-step-11.png)

### D — Add departments

12. On the same page, expand a facility row → click **Add department**.
13. Per department, fill:
    - **Name** — e.g. _"Cardiology"_, _"Orthopedics"_.
    - **Cost center** — optional accounting code.
14. Click **Save**. Departments scope spend-by-department analytics (see workflow 09).

### E — Add physicians

15. Go to **`/hospital-management`** → **Physicians** tab → click **Add physician**.
16. Per physician, fill:
    - **First / last name**
    - **NPI** — 10-digit.
    - **Specialty** — picklist.
    - **License #** + **License state** — used for credential expiry alerts.
    - **DEA #** — optional, required for controlled-substance prescribers.
17. Click **Save**. Physicians can later be tagged on orders (`order_contacts` with type `CLINICIAN`).

### F — Configure GPO membership (optional)

18. Go to **`/admin/gpo-contracts`** (admin or hospital admin with GPO permission).
19. Pick the GPO in the left sidebar (Vizient / Premier / HealthTrust / Intalere / Capstone / Other).
20. Click **Set hospital membership** → pick the new hospital → enter member ID → **Save**.
21. The pricing cascade now uses any GPO contract rates the GPO has loaded.

See workflow 15 for the full GPO setup.

### G — Link to vendors

22. Have the hospital admin go to **`/facility-vendors`** ("My Vendors").
23. Click **Add vendor** → search → select vendor → tick facilities allowed → **Save**.
24. The hospital can now route orders to the vendor.

    ![Step 24](../images/wf-onboard-hospital-step-24.png)

### H — Smoke test

25. Hospital admin places one test requisition (workflow 02), submits it (workflow 06 must have at least a catch-all rule), approves and converts (workflow 03). Verify an order shows up on **`/supply-orders`**.

---

## What happens behind the scenes

- `POST /api/hospitals` inserts into `hospitals` and seeds the default Procurement Team user-group.
- `POST /api/hospital-facilities` and `POST /api/hospital-departments` populate the sub-tables. Facility addresses feed the tax engine's `sales_tax_rates` lookup.
- `POST /api/users` with `userType=HOSPITAL` + role `FACILITY_ACCOUNT_MANAGER` creates the admin and a `user_memberships` row linking to the hospital tenant.
- Setting GPO membership updates `hospitals.gpoOrganizationId` + `hospitals.gpoMemberId`.
- Linking to a vendor inserts into `hospital_vendors` (parent) + `hospital_vendor_facilities` (which facilities can use which vendors).

---

## Verification

1. Hospital admin can sign in; sidebar shows the Hospital menu.
2. **`/hospital-management`** lists every facility and department you added.
3. **`/facility-vendors`** lists the linked vendors.
4. A test requisition can be submitted, approved, and converted to an order without errors.
5. `GET /api/me` returns the hospital admin's user object with `hospitalId` set and `permissions.facilities = FULL` (account-manager fast-path).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **NPI rejected** | Server validates as 10 digits | Re-enter; remove dashes / spaces. |
| Hospital admin sees an empty sidebar | `userType` was set to something other than `HOSPITAL` | Edit user; have them re-login. |
| Order numbers come out as `ORD-2026-…` instead of your prefix | `orderNumberPrefix` was left blank on the hospital row | Edit the hospital, set the prefix, save. New orders use the new prefix. |
| Tax engine returns 0% on every order | Facility address has no state / wrong state, or `sales_tax_rates` doesn't cover that jurisdiction | Verify state on facility; check **`/admin/sales-tax-rates`** if available. |
| Vendor doesn't appear in **`/facility-vendors`** search | Vendor's `itemCategories` don't overlap or vendor not active | Verify vendor at **`/vendors`**. |
| Submit requisition → "No approval rule matched" | No rules exist for the new hospital | Create a catch-all rule (workflow 06). |

---

## Related

- Feature reference: [`personas/hospital.md`](../personas/hospital.md), [`features/18-user-management.md`](../features/18-user-management.md)
- Adjacent workflows: [`01-onboard-a-vendor.md`](./01-onboard-a-vendor.md), [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md), [`14-grant-user-permissions.md`](./14-grant-user-permissions.md), [`15-set-up-gpo-membership.md`](./15-set-up-gpo-membership.md)

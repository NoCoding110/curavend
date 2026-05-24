# Workflow 11 — Onboard a New Lab

## At a glance

| | |
|---|---|
| **What** | Stand up a new lab tenant in Curavend, configure its lab groups and kit sites, and send the first kit order. |
| **Persona** | Platform admin (creates the tenant), with handoff to the new Lab Account Manager (configures + first order). |
| **Prerequisites** | Lab company name, primary contact email, list of kit site addresses (where the lab ships kits to / receives specimens back from). |
| **Estimated time** | 30-45 minutes including the first test order. |

---

## Steps

### A — Admin creates the lab user + tenant

1. Sign in as platform admin at **`/login`**.
2. From the sidebar pick **Users** (admin-only) → **`/admin/users`** or use **Vendors** sidebar item set to type `LAB` — labs use the same multi-tenant scaffolding.
3. Click **Add user** (top-right). In the modal:
   - **Email** — primary lab contact.
   - **User type** — `LAB` (added in session 4 / migration `0003`).
   - **Role** — `LAB_ACCOUNT_MANAGER`.
   - **Tenant name** — the lab company name (creates a new lab tenant automatically).
4. Click **Save & send invite**. Resend dispatches the welcome email.

   ![Step 4](../images/wf-onboard-lab-step-4.png)

5. Invitee follows the email link at **`/auth/accept-invite?token=…`**, sets password, completes MFA setup if enforced.

### B — Lab admin lands at the Lab Portal

6. After login the new lab admin sees a Lab-specific sidebar:
   - **Lab Dashboard** at **`/labs`**
   - **Lab Orders** at **`/labs/orders`**
   - **Lab Groups** at **`/labs/groups`**
   - **Kit Sites** at **`/labs/kit-sites`**

   ![Step 6](../images/wf-onboard-lab-step-6.png)

### C — Set up lab groups

7. Go to **`/labs/groups`** → click **New group**.
8. Lab groups partition orders by clinical team (e.g. _"Cardiology Panel"_, _"Endocrine"_). Fill:
   - **Name** — short label.
   - **Default panel codes** — multi-select test codes (used to auto-populate new orders for this group).
   - **Default kit site** — optional; pre-fills the ship-to.
   - **Members** — pick users who should see orders for this group.
9. Click **Save**. Repeat for each clinical team.

### D — Configure kit sites

10. Go to **`/labs/kit-sites`** → click **New kit site**.
11. A kit site is a physical location the lab ships kits to (often a clinic, sometimes a patient's home aggregator). Fill:
    - **Name** — short identifier.
    - **Address** — street / city / state / zip.
    - **Contact name + phone + email** — who to reach about a problem shipment.
    - **Active** — toggle.
12. Click **Save**. Repeat for each kit site.

    ![Step 12](../images/wf-onboard-lab-step-12.png)

### E — Send the first kit order

13. Go to **`/labs/orders`** → click **New order** (lands on **`/labs/orders/new`**).
14. Fill the create form:
    - **Lab group** — picks default panel + ship-to.
    - **Kit site** — auto-filled from the group, override if needed.
    - **Patient** — search or create.
    - **Panel codes** — pre-filled from the group; edit if this is a custom panel.
    - **Clinical note** — optional.
15. Click **Create order**. Status starts `DRAFT`.
16. From the order detail page (**`/labs/orders/{id}`**) you have a per-asset action panel:
    - **Generate TRF (test requisition form) PDF**
    - **Generate shipping label**
    - **Generate return label**
    - **Generate barcode stickers**
    - **Download consolidated PDF** (TRF + labels + stickers in one file)
    - **Download XLSX tracking**

    ![Step 16](../images/wf-onboard-lab-step-16.png)

17. Click each asset to generate. All PDFs are produced server-side via Browser Rendering (`@cloudflare/puppeteer`) and stored in R2.
18. The order's **Workflow control card** (right side of the detail page) shows the workflow status. Click **Move to SUBMITTED** when you're ready to ship.

---

## What happens behind the scenes

- New `LAB` user is created via `POST /api/users`. The lab tenant is a row in `lab_groups` parent or a new vendor-like tenant depending on configuration; the user is linked via `user_memberships`.
- Lab groups live in `lab_groups`; members in `lab_group_members`; kit sites in `lab_kit_sites`. Migration `0003_lab_portal_and_medzah_parity.sql`.
- New lab order: `POST /api/labs/orders` inserts into `lab_orders` + `lab_order_items` (panel codes). Mints `LAB-{YEAR}-{6digit}`.
- PDF / label / sticker generation routes (`/api/utility/*` and `/api/labs/orders/:id/asset/*`) render with Puppeteer in the `BROWSER` binding and persist to R2 with keys saved on the order.
- The workflow control card calls the workflow control plane (`/api/workflows/lab-order/:id/...`) which is the same engine that drives the rest of the platform's long-running processes (session 7 — `workflow_instances` + `workflow_events`).

---

## Verification

1. The new lab admin can sign in and the sidebar shows the Lab-only menu (not the Hospital menu).
2. **`/labs/orders`** lists the new order with its `LAB-2026-…` number and DRAFT status.
3. Clicking **Download consolidated PDF** returns a valid multi-page PDF.
4. The workflow instance for the order is visible at **`/admin/workflows`** (admin-only).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Invite email never arrives** | `RESEND_API_KEY` not set | Check **`/admin/integration-log`**. |
| Lab admin signs in but sees the Hospital sidebar | `userType` set wrong (e.g. `HOSPITAL`) | Edit user, set `userType=LAB`. They must re-login for the JWT to reflect. |
| PDF generation returns 500 | `BROWSER` binding misconfigured or Puppeteer pool exhausted | Check Worker logs; retry — Cloudflare's Browser Rendering pool refills within seconds. |
| **`/labs/kit-sites`** save fails with `"zip code invalid"` | Backend validates US zip format (5 digits or 5+4) | Re-enter zip. |
| Workflow card shows `FAILED` | A step handler returned error | Click into **`/admin/workflows`** → find the instance → review `workflow_activity_log`; click **Retry** or **Terminate**. |
| Sticker PDF prints blank barcodes | `bwip-js` failed silently for an unsupported code | Use Code128 or QR — those are the tested code formats. |

---

## Related

- Feature reference: [`personas/lab.md`](../personas/lab.md), [`features/18-user-management.md`](../features/18-user-management.md)
- Adjacent workflows: [`12-onboard-a-hospital.md`](./12-onboard-a-hospital.md), [`01-onboard-a-vendor.md`](./01-onboard-a-vendor.md), [`14-grant-user-permissions.md`](./14-grant-user-permissions.md)

# Workflow 14 — Grant a User Fine-Grained Permissions

## At a glance

| | |
|---|---|
| **What** | Set per-resource access (NONE / READ / WRITE / FULL) for an individual user, or assign them to a Group whose permissions are inherited. |
| **Persona** | Hospital admin (`FACILITY_ACCOUNT_MANAGER`), vendor admin, or platform admin. |
| **Prerequisites** | The target user already exists in your tenant. |
| **Estimated time** | 2-5 minutes per user. |

---

## Steps

### A — Open the user

1. Hospital admins: from the sidebar pick **Settings** → **`/profile`** → scroll to the **User Management** card. (Vendor admins use the same page; the tenant context comes from your JWT.)
2. In the User Management table, find the user → click their name → user-edit drawer opens.

   ![Step 2](../images/wf-permissions-step-2.png)

3. The drawer has tabs: **Profile**, **Memberships**, **Permissions**, **Groups**.

### B — Direct user permissions

4. Switch to the **Permissions** tab.
5. You see a matrix with one row per resource and four radio columns per row.
6. The 11 resources:

   | Resource | What it controls |
   |---|---|
   | `facilities` | `/hospital-management` Facilities tab |
   | `departments` | `/hospital-management` Departments tab |
   | `physicians` | `/hospital-management` Physicians tab |
   | `orders` | `/supply-orders`, `/requisitions`, and downstream pages |
   | `vendors` | `/vendors` admin view |
   | `vendor-locations` | `/vendor-locations` |
   | `vendor-coverage` | `/vendor-coverage` |
   | `contracts` | `/contracts` |
   | `requisitions` | `/requisitions` (separable from `orders`) |
   | `formulary` | `/admin/formulary` |
   | `goods-receipts` | `/goods-receipts` |

7. For each row, pick one of:
   - **NONE** — menu item hidden; API returns 403.
   - **READ** — can view list + detail; cannot create / edit / delete.
   - **WRITE** — can create + edit; cannot delete.
   - **FULL** — can do everything including delete and admin actions (e.g. approve).

   ![Step 7](../images/wf-permissions-step-7.png)

8. Click **Save permissions**. Changes take effect on the user's **next request** (not next login — JWT is not re-issued; permissions are looked up server-side every call).

### C — Group-based permissions (recommended for > 5 users)

9. Switch to the **Groups** tab on the user drawer.
10. Click **Add to group** → pick from a multi-select of groups in your tenant → **Save**.
11. To create a group first: go to **`/profile`** → **User Groups** card → **Add group**.
12. In the group's detail drawer, **Permissions** tab → set the same matrix at the group level → **Save**.

    ![Step 12](../images/wf-permissions-step-12.png)

13. Members of the group inherit the group's grants. Where both group and direct permissions exist, the user gets the **max** of any individual grant + every group's grant for each resource.

### D — Verify the user's effective permissions

14. As the affected user, sign in (or refresh).
15. Inspect `GET /api/me` (or have a developer do it). The `permissions` field is the merged 11-resource map.
16. Alternatively, simply attempt the action — denied actions render a permission-error toast with the missing resource:level requirement.

---

## What happens behind the scenes

- Direct user grants live in `user_permissions(userId, resource, level)`.
- Group grants live in `user_group_permissions(groupId, resource, level)`.
- Group membership in `user_group_members(groupId, userId, isActive)`.
- `middleware/requirePermission.ts::computeEffectivePermissions(userId)` does:
  1. **Fast path** — if user is `ADMIN` userType OR has an account-manager role, return `{everything: FULL}` skip DB.
  2. Otherwise look up `user_permissions` (direct), `user_group_permissions` (via active group memberships), and `roleDefaultFor(role)` as final fallback.
  3. Merge with `MAX(level)` per resource — direct overrides, group adds, role defaults fill gaps.
- The effective map is what `/api/me` returns, and is computed fresh on every request the user makes (no caching). Safe to change live.

---

## Verification

1. The user's `/api/me` response shows the expected `permissions.{resource}: LEVEL` map.
2. UI menu items hide/show consistent with the grants (e.g. removing `vendor-locations: READ` removes that sidebar entry).
3. The audit log on the user's profile shows the permission change with timestamp and actor.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| User can still see a page after you set the resource to NONE | They're on a stale page — server is correctly returning 403 but UI hasn't navigated | Have them refresh; the page should now show a permission-error placeholder. |
| Account-manager users always see everything | Fast-path bypasses per-resource grants for account-manager roles | This is by design. To restrict an account-manager, downgrade their role to `FACILITY_ACCOUNT_MANAGER_USER` and configure per-resource grants. |
| Group changes don't take effect | User isn't an **active** member of the group | On the group's Members tab, ensure the `isActive` toggle is on. |
| User has `WRITE` but the **Delete** button is still hidden | Delete requires `FULL`, not `WRITE` | Bump the resource to `FULL` if they truly need delete. |
| You demoted a user but their old session still has access | Permissions are checked per-request, not from JWT — old session still works, just at the new permission level | This is correct behavior. If you suspect compromise, also revoke their refresh token via admin's user-revoke action. |
| System-default Procurement Team group can't be deleted | Protected — returns 409 | Don't delete; just remove members or edit permissions. |

---

## Related

- Feature reference: [`features/19-permissions-groups.md`](../features/19-permissions-groups.md), [`features/18-user-management.md`](../features/18-user-management.md)
- Adjacent workflows: [`06-set-up-approval-rules.md`](./06-set-up-approval-rules.md), [`12-onboard-a-hospital.md`](./12-onboard-a-hospital.md), [`01-onboard-a-vendor.md`](./01-onboard-a-vendor.md)

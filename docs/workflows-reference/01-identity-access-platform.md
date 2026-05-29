# Identity, Access & Platform — Workflow Reference

> **Scope.** This document covers every workflow in the Identity, Access & Platform domain of the Curavend platform: authentication (login, MFA via TOTP + Email OTP, account lockout, password reset/change), session/token lifecycle (refresh, logout/revocation), multi-tenant membership selection/switching, user CRUD and approval, fine-grained per-resource permissions and permission groups, per-user filter presets, subscription/billing (Stripe), platform admin operations (approvals, HIPAA audit logs, OIG screening, fee-schedule uploads, manual cron triggers, dev utilities), notifications and notification routing preferences, support ticketing, combined/advanced search, AI medical-order extraction, real-time order chat, generic file upload/download with scope-checked audit, PDF/file utilities, and the generic workflow control plane. All endpoints are mounted in `packages/api/src/index.ts`. The global `authMiddleware` (`packages/api/src/middleware/auth.ts`) protects `/api/*` except the public allow-list (auth login/reset/refresh/MFA-verify/membership-select/unlock/email-otp, health, OpenAPI docs, CDS Hooks, fulfillment/EHR webhooks, FHIR launch/redirect, JWKS). RBAC is enforced two ways: coarse role gates via `rbac(...)`/`requireUserType(...)` (`packages/api/src/middleware/rbac.ts`) and fine-grained per-resource gates via `requirePermission(resource, level)` (`packages/api/src/middleware/requirePermission.ts`).

## Workflow index

- **W1-01** — User login (password + lockout)
- **W1-02** — MFA challenge & verification (TOTP)
- **W1-03** — Enroll TOTP authenticator (first-time MFA setup)
- **W1-04** — Email OTP MFA (send + verify)
- **W1-05** — Multi-tenant membership selection at login
- **W1-06** — In-app tenant (membership) switching
- **W1-07** — Forgot password / password reset
- **W1-08** — Change password (authenticated)
- **W1-09** — Emergency account unlock (server-secret)
- **W1-10** — Token refresh & logout/revocation
- **W1-11** — Create user & assign tenant / groups / temp password
- **W1-12** — Update user, status (activate/deactivate), soft-delete
- **W1-13** — Attach/detach additional tenant memberships
- **W1-14** — User approval (pending → approved/rejected)
- **W1-15** — Grant per-user resource permission overrides
- **W1-16** — Define a permission group & grant resources / members
- **W1-17** — Per-user saved filter presets
- **W1-18** — Subscribe to a plan (Stripe checkout) & manage subscription
- **W1-19** — Platform admin: HIPAA audit-log review
- **W1-20** — Platform admin: OIG exclusion screening
- **W1-21** — Platform admin: fee-schedule / state-rate uploads & dev utilities
- **W1-22** — Notification preferences (routing rules) & in-app notification inbox
- **W1-23** — Submit & triage a support ticket
- **W1-24** — Combined search (orders / SKUs / contracts) + advanced order search
- **W1-25** — AI medical-order extraction (fax/image → order)
- **W1-26** — Real-time order chat (room + messages + WebSocket DO)
- **W1-27** — File upload / scope-checked download / delete
- **W1-28** — File & PDF utilities (base64 upload, HTML/image→PDF, merge, compress, presigned URL)
- **W1-29** — Workflow control plane (start / status / terminate / raise-event / purge)

---

### W1-01: User login (password + lockout)
- **Actors:** Hospital | Vendor | Lab | Provider | Super-Vendor | Admin
- **Trigger:** UI login form submit → `POST /api/auth/login`
- **Entry points:** `packages/web/src/features/auth` (Login page) · `POST /api/auth/login`
- **Permissions / tenant scope:** PUBLIC (no JWT). Protected by Cloudflare Turnstile (`turnstile()`) + rate limit `10 / 300s` per IP (prefix `rl:login`). Tenant scope is established by the resolved membership, not the request.
- **Steps:**
  1. Validate body (`loginSchema`: email, password).
  2. Look up user by lowercased email; if absent, log `LOGIN_FAILURE` and return generic 401 (no email enumeration).
  3. Reject if `userStatus !== 'ACTIVE'` (`LOGIN_FAILURE` reason `ACCOUNT_INACTIVE`).
  4. Enforce lockout: if `lockedUntil` is in the future → `LOGIN_BLOCKED_LOCKED` + 401 with remaining minutes.
  5. Verify password (`verifyPassword`). On failure increment `failed_login_attempts`; at `MAX_FAILURES=5` set `locked_until = now + 15 min`, log `LOGIN_FAILURE` (+ `ACCOUNT_LOCKED` when locked).
  6. On success: reset lockout counters, set `lastLoggedInAt`/`currentLoggedInAt`, `timedOut=0`; log `LOGIN_SUCCESS`.
  7. Branch: if `mustChangePassword` → return `{ requiresPasswordChange, userId }`. Else if `mfaEnabled && mfaSecret` → issue temporary `mfaToken`, log `MFA_CHALLENGE`, return `{ requiresMfa, mfaToken }` (→ W1-02). Else count memberships (→ W1-05) or auto-issue full tokens.
  8. Single-membership path issues `generateTokens` (access + refresh) and returns the user object; `mfaSetupRequired` is `true` for ADMIN users without MFA enrolled.
- **State machine:** User `userStatus`: `ACTIVE | INACTIVE` (only ACTIVE may log in). Lockout: `failed_login_attempts` 0→5; at 5 `locked_until` set 15 min; cleared on success / reset / unlock.
- **Side effects:** auth-audit rows (`logAuthEvent` → `authAuditService`); user-row updates; no notifications.
- **Related services/crons:** `services/authService.ts` (`verifyPassword`, `generateTokens`, `generateTemporaryToken`), `services/authAuditService.ts`, `lib/membershipResolver.ts`, `middleware/rateLimit.ts`, `middleware/turnstile.ts`.
- **Source:** `packages/api/src/routes/auth.ts:131-281`

### W1-02: MFA challenge & verification (TOTP)
- **Actors:** Any user with `mfaEnabled=1`
- **Trigger:** `POST /api/auth/mfa/verify` after login returned `requiresMfa`
- **Entry points:** `packages/web/src/features/auth` (MFA prompt) · `POST /api/auth/mfa/verify`
- **Permissions / tenant scope:** PUBLIC (verifies temporary `mfaToken` instead of a session JWT). Rate limit `5 / 60s` per IP (prefix `rl:mfa`).
- **Steps:**
  1. Validate `mfaVerifySchema` (`mfaToken`, 6-digit `code`).
  2. `verifyTemporaryToken(mfaToken)` → userId (else 401).
  3. Load user; require `mfaSecret`.
  4. `verifyMfaCode(secret, code)`; on failure log `MFA_FAILURE` + 401.
  5. On success log `MFA_SUCCESS`; if MFA was not yet enabled, set `mfaEnabled=1` (completes enrollment — see W1-03).
  6. Same membership branch as login: >1 membership → `{ requiresMembershipSelection, memberships, partialToken }` (→ W1-05); else issue full tokens.
- **State machine:** `users.mfaEnabled`: 0→1 on first successful verify.
- **Side effects:** auth-audit `MFA_FAILURE`/`MFA_SUCCESS`; possible `mfaEnabled` update.
- **Related services/crons:** `services/authService.ts` (`verifyMfaCode`, `verifyTemporaryToken`, `generateTokens`), `services/authAuditService.ts`.
- **Source:** `packages/api/src/routes/auth.ts:523-623`

### W1-03: Enroll TOTP authenticator (first-time MFA setup)
- **Actors:** Any user (ADMIN users are prompted via `mfaSetupRequired`)
- **Trigger:** `POST /api/auth/mfa/init-setup` (token-based, pre-session) or `POST /api/auth/mfa/setup` (authenticated)
- **Entry points:** `packages/web/src/features/auth` / `profile` (MFA setup) · `POST /api/auth/mfa/init-setup`, `POST /api/auth/mfa/setup`, then `POST /api/auth/mfa/verify`
- **Permissions / tenant scope:** `init-setup` is PUBLIC (verifies `mfaSetupToken`); `setup` requires a session (`c.get('user')`). Self-only.
- **Steps:**
  1. `init-setup`: verify `mfaSetupToken` → userId; reject if already `mfaEnabled`; `generateMfaSecret(email)`; persist `mfaSecret` (not yet enabled); return `{ secret, uri, qrCodeUrl, mfaSetupToken }`. `setup`: same but for an authenticated user.
  2. Frontend renders QR; user scans in authenticator app.
  3. User submits a code to `POST /api/auth/mfa/verify` (W1-02), which flips `mfaEnabled=1`.
- **State machine:** `mfaSecret` stored → `mfaEnabled` 0→1 only after a verified code.
- **Side effects:** writes `mfaSecret`; auth-audit on the subsequent verify.
- **Related services/crons:** `services/authService.ts` (`generateMfaSecret`, `verifyTemporaryToken`).
- **Source:** `packages/api/src/routes/auth.ts:447-521`

### W1-04: Email OTP MFA (send + verify)
- **Actors:** Any user; alternative MFA channel to TOTP
- **Trigger:** `POST /api/auth/email-otp/send` then `POST /api/auth/email-otp/verify`
- **Entry points:** `packages/web/src/features/auth` · `POST /api/auth/email-otp/send`, `POST /api/auth/email-otp/verify`
- **Permissions / tenant scope:** PUBLIC. send: rate limit `5 / 600s` (prefix `rl:email-otp-send`); verify: `10 / 300s` (prefix `rl:email-otp-verify`).
- **Steps:**
  1. send: validate `{ email, purpose }` where `purpose ∈ MFA_LOGIN | EMAIL_VERIFY | STEP_UP | PASSWORD_RESET`; `lookupUserMfaPref` resolves userId; `sendOtpCode` generates a 6-digit numeric code, bcrypt-hashes it into `email_otp_codes` (TTL 10 min, `attempts=0`), emails it; log `MFA_CHALLENGE` (method `email_otp`). Returns `{ codeId, expiresAt }`.
  2. verify: validate `{ email, code, purpose }`; `verifyOtpCode` finds the newest unconsumed, unexpired code; over `MAX_ATTEMPTS_PER_CODE=5` → `LOCKED`; bad code increments `attempts` → `INVALID`; success sets `consumedAt`. Failure logs `MFA_FAILURE`; success logs `MFA_SUCCESS` and issues a short-lived `stepToken` (client then proceeds to membership/token step).
- **State machine:** `email_otp_codes`: created → (attempts 0..5) → `consumedAt` (used) | expired (TTL) | `LOCKED` (≥5 attempts). Purposes per `EMAIL_OTP_PURPOSES`.
- **Side effects:** OTP email via `EmailService.sendEmailOtp`; auth-audit; `email_otp_codes` rows.
- **Related services/crons:** `services/emailOtpService.ts`, `services/emailService.ts`, `services/authAuditService.ts`.
- **Source:** `packages/api/src/routes/auth.ts:882-952`; `packages/api/src/services/emailOtpService.ts`

### W1-05: Multi-tenant membership selection at login
- **Actors:** Any user belonging to >1 tenant (`user_memberships`)
- **Trigger:** Login or MFA verify returns `requiresMembershipSelection` → `POST /api/auth/select-membership`
- **Entry points:** `packages/web/src/features/auth` (membership picker) · `POST /api/auth/select-membership`
- **Permissions / tenant scope:** PUBLIC (verifies `partialToken`). The chosen membership must belong to the user (`resolveMembership`), else 403.
- **Steps:**
  1. Validate `{ partialToken, membershipId }`.
  2. `verifyTemporaryToken(partialToken)` → userId; load user.
  3. `resolveMembership(userId, membershipId)`; if not owned → `ForbiddenError`.
  4. Issue full tokens with `userType = membership.tenantType` and the membership's tenant ids/role so all downstream scope checks reflect the active org.
  5. Return tokens + user incl. `activeMembershipId`.
- **State machine:** n/a (selection, not a status change).
- **Side effects:** none beyond token issuance.
- **Related services/crons:** `lib/membershipResolver.ts` (`listMemberships`, `resolveMembership`, `resolveDefaultMembership`, `countMemberships`), `services/authService.ts`.
- **Source:** `packages/api/src/routes/auth.ts:283-341`; membership enrichment helper `auth.ts:408-445`

### W1-06: In-app tenant (membership) switching
- **Actors:** Authenticated multi-membership user
- **Trigger:** TenantSwitcher UI → `POST /api/auth/switch-membership`; list via `GET /api/auth/memberships`
- **Entry points:** `packages/web/src/features/*` (TenantSwitcher) · `GET /api/auth/memberships`, `POST /api/auth/switch-membership`
- **Permissions / tenant scope:** Authenticated (inline `requireAuth` since auth routes mount before global middleware). Target membership must be the caller's.
- **Steps:**
  1. `GET /memberships` → `listMemberships` + label enrichment (hospital/vendor/provider/super-vendor names).
  2. `POST /switch-membership` with `{ membershipId }`; `resolveMembership` validates ownership; re-issues tokens scoped to that membership (`userType=tenantType`).
- **State machine:** n/a.
- **Side effects:** new token pair; frontend re-renders under the new tenant.
- **Related services/crons:** `lib/membershipResolver.ts`, `services/authService.ts`.
- **Source:** `packages/api/src/routes/auth.ts:343-406`

### W1-07: Forgot password / password reset
- **Actors:** Any user
- **Trigger:** `POST /api/auth/forgot-password` then `POST /api/auth/reset-password`
- **Entry points:** `packages/web/src/features/auth` (Forgot/Reset pages) · `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- **Permissions / tenant scope:** PUBLIC. Both Turnstile-protected. forgot: rate limit `5 / 900s` (prefix `rl:forgot`); reset: `10 / 900s` (prefix `rl:reset`).
- **Steps:**
  1. forgot: validate email; always returns the same generic message (no enumeration). If the user exists, `generateResetCode()` is stored in KV `reset:{userId}` with 900s TTL and emailed (`EmailService.sendPasswordResetEmail`); log `PASSWORD_RESET_REQUESTED`.
  2. reset: validate `{ email, code, newPassword }` (newPassword must satisfy `strongPassword`: ≥12 chars, upper/lower/digit/special). Compare against KV code; mismatch/expired → log `PASSWORD_RESET_FAILED` + 401.
  3. On success: hash & store new password, clear `mustChangePassword`, clear lockout counters, delete the KV code, set `revoked-user:{userId}` epoch in KV (invalidates all prior refresh tokens, TTL 604800s), log `PASSWORD_RESET_COMPLETED`.
- **State machine:** reset code lifecycle: issued (KV TTL 900s) → consumed (deleted) | expired. `mustChangePassword` 1→0.
- **Side effects:** reset email; KV writes (`reset:*`, `revoked-user:*`); auth-audit; refresh-token revocation.
- **Related services/crons:** `services/authService.ts` (`generateResetCode`, `hashPassword`), `services/emailService.ts`, KV.
- **Source:** `packages/api/src/routes/auth.ts:625-710`

### W1-08: Change password (authenticated)
- **Actors:** Any authenticated user (self)
- **Trigger:** `POST /api/auth/change-password`
- **Entry points:** `packages/web/src/features/profile` / `auth` · `POST /api/auth/change-password`
- **Permissions / tenant scope:** Requires session user; self-only.
- **Steps:**
  1. Validate `changePasswordSchema` (`currentPassword`, `newPassword` = `strongPassword`).
  2. Verify current password; failure logs `PASSWORD_CHANGE_FAILED` + 401.
  3. Reject if new == current.
  4. Hash & store, clear `mustChangePassword`; log `PASSWORD_CHANGED`.
- **State machine:** `mustChangePassword` 1→0.
- **Side effects:** auth-audit; password-hash update. (Note: this handler reads `c.get('user')`; the route is reached through the auth routes sub-router — see source.)
- **Related services/crons:** `services/authService.ts`, `services/authAuditService.ts`.
- **Source:** `packages/api/src/routes/auth.ts:751-797`

### W1-09: Emergency account unlock (server-secret)
- **Actors:** Operator with server-side access (not a normal session)
- **Trigger:** `POST /api/auth/unlock-account` with `Authorization: Bearer <JWT_SECRET>`
- **Entry points:** ops/manual · `POST /api/auth/unlock-account`
- **Permissions / tenant scope:** Gate is the raw `JWT_SECRET` value in the bearer header (not a user JWT). 403 otherwise.
- **Steps:**
  1. Compare bearer to `c.env.JWT_SECRET`; mismatch → 403.
  2. Require `email`; load user (404 if missing).
  3. Raw SQL: clear `failed_login_attempts`, `locked_until`, set `user_status='ACTIVE'`; log `ACCOUNT_UNLOCKED`.
- **State machine:** lockout cleared; `userStatus` → `ACTIVE`.
- **Side effects:** user-row update; auth-audit `ACCOUNT_UNLOCKED`.
- **Related services/crons:** `services/authAuditService.ts`.
- **Source:** `packages/api/src/routes/auth.ts:712-749`

### W1-10: Token refresh & logout/revocation
- **Actors:** Any authenticated user / client
- **Trigger:** `POST /api/auth/refresh` (silent renewal) / `POST /api/auth/logout`
- **Entry points:** API client interceptor · `POST /api/auth/refresh`, `POST /api/auth/logout`
- **Permissions / tenant scope:** refresh is PUBLIC (verifies refresh JWT). logout uses inline `requireAuth`. Per-user revocation epoch enforced.
- **Steps:**
  1. refresh: validate `{ refreshToken }`; `verifyRefreshToken`; reject if issued before the `revoked-user:{userId}` epoch (KV) → `TOKEN_REVOKED`; reject if user missing or not `ACTIVE`; else issue a fresh token pair from the user's current (legacy) columns.
  2. logout: verify bearer; write `revoked-user:{userId}` = now-epoch (KV TTL 604800s) so all earlier refresh tokens are rejected.
- **State machine:** Refresh token validity gated on `iat ≥ revoked epoch`.
- **Side effects:** KV `revoked-user:*` write on logout; token issuance on refresh.
- **Related services/crons:** `services/authService.ts` (`verifyRefreshToken`, `generateTokens`), KV.
- **Source:** `packages/api/src/routes/auth.ts:799-880`

### W1-11: Create user & assign tenant / groups / temp password
- **Actors:** Admin (ACCOUNT_MANAGER / ACCOUNT_MANAGER_USER) | Facility / Vendor / Provider managers | Super-Vendor
- **Trigger:** Add-user UI → `POST /api/users`
- **Entry points:** `packages/web/src/features/addUser`, `userManagement` · `POST /api/users`
- **Permissions / tenant scope:** `rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER','FACILITY_ACCOUNT_MANAGER','VENDOR_ACCOUNT_MANAGER','PROVIDER_EXECUTIVE_ADMIN','SUPER_VENDOR')`. Non-admin creators cannot create users outside their own facility/vendor (checked against `hospitalId`/`vendorId`).
- **Steps:**
  1. Validate `createUserSchema` (`userType ∈ ADMIN|HOSPITAL|VENDOR`; `role` ∈ the 10-role enum; optional tenant ids, `groupIds`, NPI/specialty/license).
  2. Reject duplicate email (409).
  3. Enforce creator scope.
  4. Generate temp password (`nanoid(12)`), hash it; insert user with `userStatus='ACTIVE'`, `step='WELCOME_EMAIL'`, `mustChangePassword=1`, `mfaEnabled=0`, `accountManagerId=creator`.
  5. Send welcome email with temp password (`EmailService.sendWelcomeEmail`).
  6. For each `groupId` the caller may manage (same-tenant unless platform admin) insert `user_group_members`.
  7. Return created user (password/MFA secret stripped), 201.
- **State machine:** new user `userStatus='ACTIVE'`, `step='WELCOME_EMAIL'`, `mustChangePassword=1`. (Note: created users are immediately ACTIVE; the self-signup `approvalStatus='PENDING'` flow is the admin approval path W1-14.)
- **Side effects:** welcome email; `users` + `user_group_members` rows.
- **Related services/crons:** `services/authService.ts` (`hashPassword`), `services/emailService.ts`, `services/sequenceService.ts`.
- **Source:** `packages/api/src/routes/users.ts:307-426`

### W1-12: Update user, status (activate/deactivate), soft-delete
- **Actors:** Managers per `canManageUser` (admins; same-hospital/vendor/provider/super-vendor managers; self)
- **Trigger:** `PUT /api/users/:id`, `PUT /api/users/:id/status`, `DELETE /api/users/:id`, `PUT /api/users/:id/notification-settings`, `POST /api/users/:id/phi-consent`, `GET /api/users/:id/groups`
- **Entry points:** `packages/web/src/features/userManagement`, `profile` · the endpoints above; also `GET /api/users`, `GET /api/users/:id`, `GET /api/users/me`
- **Permissions / tenant scope:** List/read are scope-filtered by `buildScopeFilter` (admins see all; others see same-tenant or self). Mutations gated by `canManageUser`. status/delete additionally `rbac(...managers)`. notification-settings & phi-consent are self-only (settings) / per-id. `GET /users/me` returns the caller (password/MFA secret stripped).
- **Steps:**
  1. update: validate `updateUserSchema`; patch allowed fields; if `groupIds` present, reconcile membership additions/removals within the caller's tenant (admins bypass tenant filter).
  2. status: validate `{ userStatus: ACTIVE|INACTIVE }`; block self-deactivation; update.
  3. delete: soft-delete by setting `userStatus='INACTIVE'`.
  4. phi-consent: insert `phi_consent_log` row (ip/ua/timestamp) and set `users.hasAgreedToPHIAccess=1`.
  5. notification-settings: store JSON in KV `notification_settings:{id}` (self-only).
- **State machine:** `userStatus`: `ACTIVE | INACTIVE` (delete = INACTIVE). `hasAgreedToPHIAccess` 0→1 on consent.
- **Side effects:** `users`/`user_group_members` updates; `phi_consent_log` write; KV settings.
- **Related services/crons:** none external.
- **Source:** `packages/api/src/routes/users.ts:217-643,721-745`

### W1-13: Attach/detach additional tenant memberships
- **Actors:** Admin only (ACCOUNT_MANAGER / ACCOUNT_MANAGER_USER)
- **Trigger:** `POST /api/users/:id/memberships`, `DELETE /api/users/:id/memberships/:membershipId`
- **Entry points:** `packages/web/src/features/userManagement` · the two endpoints above
- **Permissions / tenant scope:** `rbac('ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER')`.
- **Steps:**
  1. attach: require `{ tenantType (HOSPITAL|VENDOR|PROVIDER|SUPER_VENDOR), tenantId, role, isDefault? }`; 409 if a row already exists for (user, tenantType, tenantId); insert `user_memberships` (`isActive=1`).
  2. detach: soft-delete — set `isActive=0` (row retained for audit).
- **State machine:** `user_memberships.isActive`: 1→0 on detach. Legacy `users.hospitalId/vendorId` are NOT changed here — they rotate via W1-06.
- **Side effects:** `user_memberships` rows.
- **Related services/crons:** consumed by `lib/membershipResolver.ts`.
- **Source:** `packages/api/src/routes/users.ts:645-719`

### W1-14: User approval (pending → approved/rejected)
- **Actors:** Admin (ACCOUNT_MANAGER)
- **Trigger:** Admin panel → `GET /api/admin/pending-users`, `PUT /api/admin/users/:id/approve`, `PUT /api/admin/users/:id/reject`
- **Entry points:** `packages/web/src/features/admin` (User Approvals) · the three endpoints above
- **Permissions / tenant scope:** `rbac('ACCOUNT_MANAGER')` (platform admin).
- **Steps:**
  1. List users where `approvalStatus='PENDING'`.
  2. approve: set `approvalStatus='APPROVED'`, `userStatus='ACTIVE'`; create an in-app notification (`NotificationService.createNotification`) and send an approval email.
  3. reject: set `approvalStatus='REJECTED'`, `userStatus='INACTIVE'`; send a rejection email (optional `reason`).
- **State machine:** `users.approvalStatus`: `PENDING → APPROVED | REJECTED` (enum `APPROVED | PENDING | REJECTED`, default `PENDING`, from `packages/db/src/schema/users.ts:29`). Side-effect on `userStatus`: approve→`ACTIVE`, reject→`INACTIVE`.
- **Side effects:** notification + email; `users` update.
- **Related services/crons:** `services/notificationService.ts`, `services/emailService.ts`.
- **Source:** `packages/api/src/routes/admin.ts:24-92`

### W1-15: Grant per-user resource permission overrides
- **Actors:** Hospital manager / platform admin
- **Trigger:** Permissions matrix UI → `GET/PUT/DELETE /api/user-permissions/*`
- **Entry points:** `packages/web/src/features/userManagement` (PermissionsMatrix) · `GET /api/user-permissions/me`, `GET /api/user-permissions?userId=`, `PUT /api/user-permissions/:userId`, `DELETE /api/user-permissions/:userId/:resource`
- **Permissions / tenant scope:** `me` is any authenticated user (returns own effective map). Others `rbac('FACILITY_ACCOUNT_MANAGER','ACCOUNT_MANAGER','ACCOUNT_MANAGER_USER')` + `assertSameHospital` (admins/account managers bypass; otherwise target must share the caller's hospital).
- **Steps:**
  1. `me`: `computeEffectivePermissions` returns the full 16-resource map = `max(user override, group grant, role default)`.
  2. read: returns target's `overrides` + computed `effective` (overrides ?? `roleDefaultFor(role, resource)`).
  3. PUT: bulk upsert `{ resource: level }`; `level='NONE'` deletes the override (revert to role default); validates against `PERMISSION_RESOURCES` / `PERMISSION_LEVELS`; records `grantedBy`.
  4. DELETE: remove a single override.
- **State machine:** Per-resource level `NONE | READ | WRITE | FULL` (rank 0..3, `PERMISSION_LEVEL_RANK`).
- **Side effects:** `user_permissions` rows.
- **Related services/crons:** `middleware/requirePermission.ts` (`computeEffectivePermissions`, `roleDefaultFor`), `services/groupResolver.ts`.
- **Source:** `packages/api/src/routes/userPermissions.ts`; resources/levels `packages/db/src/schema/userPermissions.ts:4-43`

### W1-16: Define a permission group & grant resources / members
- **Actors:** Managers (`ACCOUNT_MANAGER`, `ACCOUNT_MANAGER_USER`, `FACILITY_ACCOUNT_MANAGER`, `VENDOR_ACCOUNT_MANAGER`, `PROVIDER_EXECUTIVE_ADMIN`, `SUPER_VENDOR`)
- **Trigger:** Group management UI → `/api/user-groups/*`
- **Entry points:** `packages/web/src/features/userManagement` (GroupManagement) · `GET/POST /api/user-groups`, `GET/PUT/DELETE /api/user-groups/:id`, `POST/DELETE /api/user-groups/:id/members[/:userId]`, `GET/PUT /api/user-groups/:id/permissions`, `GET /api/user-groups/:id/effective-recipients`
- **Permissions / tenant scope:** `rbac(...MANAGER_ROLES)`. Tenant resolved via `callerTenant`; `assertGroupAccess` forces same-tenant unless platform admin. Admin/account managers may pass `?tenantType=&tenantId=` to operate cross-tenant.
- **Steps:**
  1. create: require `name`; `groupKind ∈ USER_GROUP_KINDS` (`PERMISSION_BUNDLE | SCOPED_TEAM | NOTIFICATION_ROUTE | COMPOSITE`, default COMPOSITE); `tenantType ∈ USER_GROUP_TENANT_TYPES` (`HOSPITAL|VENDOR|PROVIDER|SUPER_VENDOR|ADMIN`); uniqueness pre-check; insert (`isSystemDefault=0`).
  2. detail (`GET /:id`) returns members + permissions.
  3. members: add `{ userIds[] }` (idempotent; non-admins must add same-tenant users); remove single user.
  4. permissions: bulk upsert `{ resource: level }`; `NONE` deletes; group grants are merged max-of into each member's effective level by `requirePermission`.
  5. delete: 409 if `isSystemDefault=1`; otherwise unset `notification_preferences.recipientGroupId` pointers, cascade-delete permissions + members + group.
  6. `effective-recipients`: preview the user list a notification targeting this group would reach (`resolveGroupRecipients`).
- **State machine:** n/a (groups have no status); `isSystemDefault` protects seeded groups.
- **Side effects:** `user_groups`, `user_group_members`, `user_group_permissions` rows; on delete, nulls `notification_preferences` references.
- **Related services/crons:** `services/groupResolver.ts` (`listGroupsInTenant`, `resolveGroupRecipients`, `resolveGroupPermissions`), `middleware/requirePermission.ts`.
- **Source:** `packages/api/src/routes/userGroups.ts`; enums `packages/db/src/schema/userGroups.ts:7-22`

### W1-17: Per-user saved filter presets
- **Actors:** Any authenticated user (self)
- **Trigger:** Save/apply a list filter → `/api/user-filter-presets/*`
- **Entry points:** list pages across `packages/web` · `GET /api/user-filter-presets?entity=`, `POST /api/user-filter-presets`, `PUT /api/user-filter-presets/:id`, `DELETE /api/user-filter-presets/:id`
- **Permissions / tenant scope:** Authenticated; rows are strictly self-scoped (`userId == caller.id`; 403 on others).
- **Steps:**
  1. list by `entity` (default first); each preset stores serialized `filters` JSON.
  2. create: require `entity`, `name`, `filters`; setting `isDefault` unsets the prior default for that (user, entity).
  3. update / delete with ownership check; default toggling maintains a single default per (user, entity).
- **State machine:** `isDefault` 0/1, at most one default per (user, entity).
- **Side effects:** `user_filter_presets` rows.
- **Related services/crons:** none.
- **Source:** `packages/api/src/routes/userFilterPresets.ts`

### W1-18: Subscribe to a plan (Stripe checkout) & manage subscription
- **Actors:** Any authenticated user; Admin can view any subscription
- **Trigger:** Subscription page → `/api/subscriptions/*`; confirmation arrives via Stripe webhook (`/api/webhooks`, outside this domain)
- **Entry points:** `packages/web/src/features/*` (Subscription) · `GET /api/subscriptions/plans`, `GET /api/subscriptions/plans/:id/features`, `POST /api/subscriptions/subscriptions`, `GET /api/subscriptions/subscriptions`, `GET /api/subscriptions/subscriptions/:id`, `DELETE /api/subscriptions/subscriptions/:id`, `GET /api/subscriptions/payment-history`
- **Permissions / tenant scope:** Authenticated. Single-subscription reads/cancel: owner or `userType==='ADMIN'` (else 403).
- **Steps:**
  1. List plans / plan features.
  2. create: require `planId`; if `STRIPE_SECRET_KEY` set, build a Stripe Checkout session via REST (success/cancel URLs, metadata userId/planId/subscriptionId) and record subscription `status='PENDING'` with `stripe_subscription_id=session.id`; return `checkoutUrl`. Without a key, create `PENDING` with a warning.
  3. Webhook later flips status to active (handled in webhooks route).
  4. cancel: if a live Stripe subscription, DELETE it on Stripe; set local `status='CANCELLED'`.
- **State machine:** subscription `status`: `PENDING → (active via webhook) → CANCELLED`. payment_history rows use `SUCCEEDED | FAILED | PENDING`.
- **Side effects:** Stripe API calls; `subscriptions` rows; reads `payment_history`.
- **Related services/crons:** Stripe REST; webhook handler (`routes/webhooks.ts`, out of domain).
- **Source:** `packages/api/src/routes/subscriptions.ts`

### W1-19: Platform admin — HIPAA audit-log review
- **Actors:** Admin (ACCOUNT_MANAGER)
- **Trigger:** Admin panel → audit-log viewers
- **Entry points:** `packages/web/src/features/admin` (PHI/File Access Log) · `GET /api/admin/phi-access-log`, `GET /api/admin/file-access-log`, `GET /api/admin/phi-consent-log`, `GET /api/admin/stats`
- **Permissions / tenant scope:** `rbac('ACCOUNT_MANAGER')`.
- **Steps:**
  1. phi-access-log: paginated read of `phi_access_log` (HIPAA §164.312(b)).
  2. file-access-log: filterable read of `file_access_log` (userId, fileKind, orderId, hospitalId, vendorId, fromDate, toDate).
  3. phi-consent-log: read of `phi_consent_log`.
  4. stats: platform aggregates (users by type, orders by status, pending users, total vendors/hospitals/providers).
- **State machine:** n/a (read-only).
- **Side effects:** none.
- **Related services/crons:** rows produced by `services/phiAuditService.ts` (W1-24/W1-25 search/AI) and the upload audit (W1-27).
- **Source:** `packages/api/src/routes/admin.ts:94-191`

### W1-20: Platform admin — OIG exclusion screening
- **Actors:** Admin (ACCOUNT_MANAGER) | System/cron (monthly refresh)
- **Trigger:** Admin OIG tools → `/api/admin/oig/*`; monthly cron `0 6 1 * *`
- **Entry points:** `packages/web/src/features/admin` · `GET /api/admin/oig/count`, `GET /api/admin/oig/search?q=`, `POST /api/admin/oig/screen`, `GET /api/admin/oig/last-refresh`, `POST /api/admin/oig/refresh`
- **Permissions / tenant scope:** `rbac('ACCOUNT_MANAGER')`.
- **Steps:**
  1. count / search the local LEIE copy (`oig_exclusion_list`).
  2. screen a single entity (`{ npi, ein, lastName, businessName }`) → `{ excluded, match }` via `screenOig`.
  3. last-refresh reads KV `oig:last_refresh`; refresh triggers `handleOigRefresh` in background (waitUntil) and stamps KV.
- **State machine:** n/a.
- **Side effects:** background LEIE refresh writes `oig_exclusion_list` + KV timestamp.
- **Related services/crons:** `cron/oigScreeningRefresh.ts` (`screenOig`, `handleOigRefresh`); cron schedule `0 6 1 * *` in `index.ts`.
- **Source:** `packages/api/src/routes/admin.ts:193-244`; `packages/api/src/index.ts:464-473`

### W1-21: Platform admin — fee-schedule / state-rate uploads & dev utilities
- **Actors:** Admin (ACCOUNT_MANAGER); some reads open to any authenticated user
- **Trigger:** Admin tools → `/api/admin/*`
- **Entry points:** `packages/web/src/features/admin` · `GET/POST/DELETE /api/admin/state-rates`, `POST /api/admin/upload-medicare`, `POST /api/admin/cron/run-sla-monitor`, `POST /api/admin/cron/run-event-wait-sweep`, `POST /api/admin/cron/run-kit-letter-sync`, `POST /api/admin/utils/fernet-roundtrip`, `POST /api/admin/utils/hl7-parse`, `POST /api/admin/utils/hmac-sign`
- **Permissions / tenant scope:** Mutations & utilities `rbac('ACCOUNT_MANAGER')`. `GET /admin/state-rates` is authenticated-only (no admin gate).
- **Steps:**
  1. state-rates: read/filter (state, hcpc), bulk upsert items, or delete (optionally by state).
  2. upload-medicare: multipart CSV → create `medicare_fee_schedules` + parse rows into `medicare_fee_schedule_items`.
  3. manual cron triggers: SLA monitor, workflow event-wait sweep, kit-letter sync (`dryRun` supported) — run the same handlers as the scheduled crons on demand.
  4. dev utilities: Fernet encrypt/decrypt roundtrip, HL7 barcode parse, HMAC webhook signature generation (testing only).
- **State machine:** n/a.
- **Side effects:** writes fee-schedule/state-rate tables; cron triggers carry their own side effects (notifications etc.).
- **Related services/crons:** `cron/orderSlaMonitor.ts`, `cron/kitLetterSync.ts`, `services/workflowService.ts` (`sweepExpiredEventWaits`), `services/fernetCipher.ts`, `lib/hl7BarcodeParser.ts`, `middleware/hmacAuth.ts`.
- **Source:** `packages/api/src/routes/admin.ts:246-436`

### W1-22: Notification preferences (routing rules) & in-app notification inbox
- **Actors:** Admin | Hospital | Vendor | Provider (preferences scoped to their tenant); any user (inbox)
- **Trigger:** Notification preferences UI / notification bell
- **Entry points:** `packages/web/src/features/notificationPreferences`, app shell (bell) · `GET/POST /api/notification-preferences`, `PUT/DELETE /api/notification-preferences/:id`; `GET /api/notifications`, `GET /api/notifications/count`, `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`
- **Permissions / tenant scope:** preferences: `assertScope` — `userType==='ADMIN'` bypass, else the scope (HOSPITAL/VENDOR/PROVIDER) must match the caller's own tenant id. inbox: self (`receiverId == caller.id`).
- **Steps:**
  1. preferences list by `{ scopeType, scopeId, eventType? }`.
  2. create: require `scopeType, scopeId, eventType, channel, recipientType`; validate against `NOTIFICATION_EVENT_TYPES`, `NOTIFICATION_CHANNELS` (`EMAIL|SMS|IN_APP|WEBHOOK`), `NOTIFICATION_RECIPIENT_TYPES` (`PATIENT|CONTACT|ORDERER|CLINICIAN|PROCUREMENT_TEAM|CUSTOM|GROUP`); `CUSTOM` requires customEmail/Phone/WebhookUrl; upsert on the UNIQUE(scope,event,channel,recipient).
  3. update toggles `isActive` / custom targets; delete removes the rule.
  4. inbox: list / unread count / mark-one-read / mark-all-read.
- **State machine:** preference `isActive` 0/1. Notification `isRead` 0→1.
- **Side effects:** `notification_preferences` rows steer `notificationRouter`; `notifications` rows are created by other domains (e.g. W1-14 approval) and via the `chat.new_message`/order/invoice queue handlers.
- **Related services/crons:** `services/notificationRouter.ts` (resolves recipients incl. `GROUP`→members), `services/notificationService.ts`.
- **Source:** `packages/api/src/routes/notificationPreferences.ts`, `packages/api/src/routes/notifications.ts`; enums `packages/db/src/schema/notificationPreferences.ts:47-83`

### W1-23: Submit & triage a support ticket
- **Actors:** Any authenticated user (own tickets) | Admin (all tickets)
- **Trigger:** Help & Support UI → `/api/support-tickets/*`
- **Entry points:** `packages/web/src/features/supportAndHelp`, `helpCenter` · `GET/POST /api/support-tickets`, `GET/PUT /api/support-tickets/:id`, `GET/POST /api/support-tickets/:id/messages`
- **Permissions / tenant scope:** Authenticated. Non-admins are restricted to `ownerId == caller.id`; admins see all.
- **Steps:**
  1. create: require `subject` + `description`; insert ticket (`status='OPEN'`, generated `number` `TICKET-<base36>`, `ownerId=creatorId=caller`); seed the first message from `description`.
  2. list (filter by `status`), detail (ticket + messages), messages list.
  3. update: change `status` (setting `CLOSED` stamps `closedAt`), `isRead`, `subject`.
  4. add message: appends to `support_ticket_messages` and bumps the ticket `updatedAt`.
- **State machine:** ticket `status` starts `OPEN`; `CLOSED` sets `closedAt`. (Status values are accepted free-form from the body — `OPEN` on create, `CLOSED` special-cased; no strict enum is enforced in the route.)
- **Side effects:** `support_tickets`, `support_ticket_messages` rows.
- **Related services/crons:** none in-route.
- **Source:** `packages/api/src/routes/supportTickets.ts`

### W1-24: Combined search (orders / SKUs / contracts) + advanced order search
- **Actors:** Hospital | Vendor | Provider | Admin
- **Trigger:** Global search box → `POST /api/search` (preferred) / `GET /api/search`; advanced filter → `POST /api/search/advanced`
- **Entry points:** app shell search · `POST|GET /api/search`, `POST /api/search/advanced`
- **Permissions / tenant scope:** Authenticated. Per-type tenant scoping: orders/contracts filtered by hospitalId/vendorId/providerId; SKUs restricted to the hospital's contracted vendors (via `hospital_vendors`) or the vendor's own SKUs; non-admin with no tenant match → `1=0` (empty). Search term travels in the POST body (not the URL) because it may be PHI (patient name).
- **Steps:**
  1. Validate `q` (≥2 chars) and `types` (default `orders,skus,contracts`).
  2. Run a LIKE search per requested type with the scope filters; group results.
  3. Write a PHI access-log entry (`logPhiAccess`, resourceType `SEARCH`).
  4. advanced: Medzah-style filter/sort DSL over the `orders` entity only (v1), with tenant scoping + pagination.
- **State machine:** n/a.
- **Side effects:** `phi_access_log` write (combined search).
- **Related services/crons:** `services/phiAuditService.ts`, `lib/advancedSearch.ts`.
- **Source:** `packages/api/src/routes/search.ts`

### W1-25: AI medical-order extraction (fax/image → order)
- **Actors:** Hospital | Provider | Admin (whoever creates orders)
- **Trigger:** Upload an order fax/image → `POST /api/ai/parse-order` (creates) or `POST /api/ai/extract-only` (preview)
- **Entry points:** Create-order flow in `packages/web` · `POST /api/ai/parse-order`, `POST /api/ai/extract-only`
- **Permissions / tenant scope:** Authenticated. `parse-order` requires `hospitalId` in the body; provider/super-vendor ids are taken from the caller's JWT.
- **Steps:**
  1. Validate `fileData` (base64) + `mediaType ∈ application/pdf|image/jpeg|image/png|image/webp`.
  2. `AiService.extractOrderFromDocument` (Workers AI) returns structured patient + HCPC line data.
  3. parse-order: insert an `orders` row (`status='PENDING'`, `orderSubStatus='NEW_ORDER'`, generated `ORD-...` identifier, extracted patient/diagnosis/insurance fields), insert `order_items` per extracted line, write an `order_history` "created from AI-parsed document" entry; return `{ orderId, extracted }` for review.
  4. extract-only: return `{ extracted }` without persisting.
- **State machine:** created order enters the orders state machine at `PENDING` / `orderSubStatus='NEW_ORDER'` (full order lifecycle is the Orders domain).
- **Side effects:** `orders`, `order_items`, `order_history` rows.
- **Related services/crons:** `services/aiService.ts` (Workers AI binding `c.env.AI`).
- **Source:** `packages/api/src/routes/ai.ts`

### W1-26: Real-time order chat (room + messages + WebSocket DO)
- **Actors:** Hospital ↔ Vendor (per order)
- **Trigger:** Open an order's chat → `/api/rooms/*`; live updates via WebSocket
- **Entry points:** `packages/web/src/features/message` · `GET/POST /api/rooms`, `GET /api/rooms/:id`, `GET/POST /api/rooms/:id/messages`, `GET /api/rooms/:id/ws`, `PUT /api/rooms/:id/read`, `PUT /api/rooms/:id/archive`
- **Permissions / tenant scope:** Authenticated. List is scoped by `hospitalId`/`vendorId`. Room creation requires `orderId`+`hospitalId`+`vendorId` (idempotent per order). Sender identity is taken from the JWT (never trusted from client).
- **Steps:**
  1. create room (returns existing if one exists for the order).
  2. post message: insert `messages` (sender = caller; `receiverUserType` is the opposite party), increment the receiving side's unread count, bump `updatedAt`, and enqueue `chat.new_message` to `EVENTS_QUEUE`.
  3. WebSocket upgrade forwards to the `ChatRoom` Durable Object (`CHAT_ROOM`), passing userId/userName/roomId.
  4. read resets the caller-side unread count; archive sets room `status='ARCHIVE'`.
- **State machine:** room `status` → `ARCHIVE` on archive; unread counters per side.
- **Side effects:** `messages`/`rooms` rows; `chat.new_message` queue event (consumed by `queues/chatEvents.ts` → notification fan-out); Durable Object fan-out.
- **Related services/crons:** `durable-objects/ChatRoom.ts`, `queues/chatEvents.ts` (`handleChatMessage`), `services/notificationService.ts`.
- **Source:** `packages/api/src/routes/rooms.ts`; queue dispatch `packages/api/src/index.ts:500-501`

### W1-27: File upload / scope-checked download / delete
- **Actors:** Any authenticated user (upload/download) | Admin only (delete)
- **Trigger:** File picker / link click → `/api/uploads/*`
- **Entry points:** attachment widgets across `packages/web` · `POST /api/uploads`, `GET /api/uploads/:key`, `DELETE /api/uploads/:key`
- **Permissions / tenant scope:** Authenticated. Download is scope-checked: `resolveFileScope` resolves the file's owning entity, `canUserAccessFile` authorizes the caller (orphan files are admin-only). Delete is `userType==='ADMIN'` only.
- **Steps:**
  1. upload: multipart `file`; enforce `MAX_FILE_SIZE=25MB` and an allow-list of content types; store in R2 under `buildStorageKey(folder, name)` with `uploadedBy` metadata.
  2. download: resolve scope → authorize → fetch from R2 → write a `file_access_log` row (HIPAA §164.312(b), best-effort via `waitUntil`) → stream with `Cache-Control: private`.
  3. delete: admin removes the object from R2.
- **State machine:** n/a.
- **Side effects:** R2 objects; `file_access_log` rows (surfaced in W1-19).
- **Related services/crons:** `services/storageService.ts`, `lib/fileScope.ts`.
- **Source:** `packages/api/src/routes/uploads.ts`

### W1-28: File & PDF utilities (base64 upload, HTML/image→PDF, merge, compress, presigned URL)
- **Actors:** Any authenticated user / internal callers
- **Trigger:** Document-generation flows → `/api/utility/*`
- **Entry points:** internal/document features · `GET /api/utility/blob-exists`, `POST /api/utility/upload-base64`, `POST /api/utility/convert-html-to-pdf`, `POST /api/utility/convert-image-to-pdf`, `POST /api/utility/merge-pdfs`, `POST /api/utility/compress-pdf`, `GET /api/utility/presigned-url`
- **Permissions / tenant scope:** Authenticated (no per-resource gate; these are generic file primitives).
- **Steps:**
  1. blob-exists checks an R2 key.
  2. upload-base64 stores a base64 payload, returns key + proxied URL.
  3. convert-html-to-pdf renders via the Browser binding with a fallback path; image-to-pdf wraps an image; merge-pdfs concatenates ≥2 keys; compress-pdf shrinks one (returns savings %).
  4. presigned-url returns an S3-style signed GET/PUT URL (requires R2 S3 creds; clamps `expiresIn` 60..86400s).
- **State machine:** n/a.
- **Side effects:** R2 writes for generated artifacts.
- **Related services/crons:** `services/storageService.ts`, `services/pdfService.ts`.
- **Source:** `packages/api/src/routes/utility.ts`

### W1-29: Workflow control plane (start / status / terminate / raise-event / purge)
- **Actors:** Admin (ACCOUNT_MANAGER) | System (queue consumer executes steps)
- **Trigger:** Admin workflows page / inline order controls → `/api/workflows/*`; step execution via `workflow.step` queue event; timeout sweep via 15-min cron
- **Entry points:** `packages/web/src/features/admin` (Workflows admin) + LabOrderDetail inline controls · `GET /api/workflows`, `POST /api/workflows/:type/start`, `GET /api/workflows/:id`, `GET /api/workflows/:id/status`, `POST /api/workflows/:id/terminate`, `POST /api/workflows/:id/events`, `DELETE /api/workflows/:id`
- **Permissions / tenant scope:** All endpoints `rbac('ACCOUNT_MANAGER')`. Step code itself never runs here — only inside the queue consumer.
- **Steps:**
  1. list/search instances (filter type/status/entityType/entityId; returns `registeredTypes`).
  2. start: validate the `:type` against `REGISTRY`; create an instance and enqueue the first step; return Durable-Functions-style management URLs.
  3. status (`/:id/status`): rich view incl. activity log + management URLs (`getRichWorkflowStatus`); `/:id` is the legacy short shape.
  4. terminate: `terminateWorkflow(reason, byUser)`; 409 `WORKFLOW_NOT_TERMINABLE` if already terminal.
  5. events: `raiseEvent(eventName, payload)` (payload ≤16KB); resumes a `WAITING_FOR_EVENT` instance; 409 `WORKFLOW_NOT_ACCEPTING_EVENTS` otherwise.
  6. purge: delete completed history (activity + event rows); 409 `WORKFLOW_NOT_PURGEABLE` for active instances.
- **State machine:** `workflow_instances.status` ∈ `PENDING | RUNNING | COMPLETED | FAILED | CANCELLED | TERMINATED | WAITING_FOR_EVENT` (`WORKFLOW_STATUSES`). Transitions in `workflowService.ts`: `PENDING → RUNNING → (COMPLETED | WAITING_FOR_EVENT | FAILED)`; `WAITING_FOR_EVENT → RUNNING` on a matching event, or `→ FAILED` when the wait expires (cron sweep `sweepExpiredEventWaits`); any non-terminal `→ TERMINATED` via terminate. Activity-log rows use `STARTED | COMPLETED | FAILED` (`packages/db/src/schema/workflowActivityLog.ts:12`).
- **Side effects:** `workflow_instances`, `workflow_activity_log`, `workflow_events` rows; `workflow.step` queue events; `terminatedBy/terminatedAt/terminateReason`/`customStatus` fields.
- **Related services/crons:** `services/workflowService.ts` (`startWorkflow`, `runStep`, `terminateWorkflow`, `raiseEvent`, `purgeWorkflow`, `getRichWorkflowStatus`, `sweepExpiredEventWaits`); queue dispatch + 15-min cron sweep in `index.ts`.
- **Source:** `packages/api/src/routes/workflows.ts`; statuses `packages/db/src/schema/workflowInstances.ts:4-12`; queue/cron wiring `packages/api/src/index.ts:338-364,512-514`

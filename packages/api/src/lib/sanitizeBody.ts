/**
 * Mass-assignment guard.
 *
 * Several create/update handlers spread the raw request body straight into a
 * Drizzle insert/update (`.values(body)` / `.set({ ...body })`). Without
 * filtering, a caller can set ownership/privilege/identity columns they should
 * never control (tenant reassignment, self-promotion, approval bypass).
 *
 * stripImmutableFields() removes the known-dangerous keys before the write.
 * It's a denylist (not an allow-list) so it preserves every legitimate field a
 * handler accepts today while closing the escalation vectors. Handlers that set
 * these columns intentionally do so explicitly (not via the spread).
 */
const IMMUTABLE_KEYS = new Set<string>([
  'id',
  'role',
  'userType',
  'user_type',
  'hospitalId',
  'hospital_id',
  'vendorId',
  'vendor_id',
  'providerId',
  'provider_id',
  'superVendorId',
  'super_vendor_id',
  'labId',
  'lab_id',
  'approvalStatus',
  'approval_status',
  'userStatus',
  'user_status',
  'isAdmin',
  'permissions',
  'passwordHash',
  'password_hash',
  'createdAt',
  'created_at',
  'createdBy',
  'created_by',
]);

/**
 * Return a shallow copy of `body` with mass-assignment-sensitive keys removed.
 * Pass extra keys to also strip route-specific protected columns.
 */
export function stripImmutableFields<T extends Record<string, unknown>>(
  body: T,
  extra: string[] = [],
): T {
  const block = extra.length ? new Set([...IMMUTABLE_KEYS, ...extra]) : IMMUTABLE_KEYS;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!block.has(k)) out[k] = v;
  }
  // Returned as T for caller ergonomics (insert sites keep their required-field
  // typing). The denied keys are physically absent at runtime regardless.
  return out as T;
}

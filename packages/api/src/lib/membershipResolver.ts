import { eq, and } from 'drizzle-orm';
import { userMemberships, users } from '@curavend/db';
import type { Database } from './db';

/**
 * membershipResolver — Phase F: turn a user's membership choice into the
 * tenant fields that should populate the issued JWT (and the User record
 * the frontend gets back).
 *
 * The legacy users.hospitalId / vendorId / providerId / superVendorId
 * columns continue to carry the *active* membership for back-compat with
 * 179+ call sites that read them. Switching memberships just changes which
 * membership row the JWT was issued from — the columns get the new values
 * baked into claims, and downstream middleware doesn't need to change.
 *
 * Returns null if the user has no memberships (unusual — backfill should
 * have given every existing user one row).
 */

export type TenantType = 'HOSPITAL' | 'VENDOR' | 'PROVIDER' | 'SUPER_VENDOR';

export interface ResolvedMembership {
  membershipId: string;
  tenantType: TenantType;
  tenantId: string;
  role: string;
  /**
   * The four tenant fields, set so that exactly one is populated based on
   * tenantType. These get copied into the JWT and the User payload returned
   * to the frontend.
   */
  hospitalId: string | null;
  vendorId: string | null;
  providerId: string | null;
  superVendorId: string | null;
}

export interface MembershipSummary {
  id: string;
  tenantType: TenantType;
  tenantId: string;
  role: string;
  isDefault: boolean;
  /** Best-effort display label — caller can enrich with hospital/vendor name */
  label?: string;
}

/** Load every active membership for a user, default first. */
export async function listMemberships(
  db: Database,
  userId: string,
): Promise<MembershipSummary[]> {
  const rows = await db
    .select()
    .from(userMemberships)
    .where(
      and(
        eq(userMemberships.userId, userId),
        eq(userMemberships.isActive, 1),
      ),
    );

  // Default first, then by created_at asc
  rows.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return b.isDefault - a.isDefault;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });

  return rows.map((r) => ({
    id: r.id,
    tenantType: r.tenantType as TenantType,
    tenantId: r.tenantId,
    role: r.role,
    isDefault: !!r.isDefault,
  }));
}

/** Resolve a specific membership by id, scoped to the user. */
export async function resolveMembership(
  db: Database,
  userId: string,
  membershipId: string,
): Promise<ResolvedMembership | null> {
  const row = await db
    .select()
    .from(userMemberships)
    .where(
      and(
        eq(userMemberships.id, membershipId),
        eq(userMemberships.userId, userId),
        eq(userMemberships.isActive, 1),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!row) return null;
  return shapeMembership(row);
}

/** Resolve the user's default membership (used when no picker shown). */
export async function resolveDefaultMembership(
  db: Database,
  userId: string,
): Promise<ResolvedMembership | null> {
  const all = await db
    .select()
    .from(userMemberships)
    .where(
      and(
        eq(userMemberships.userId, userId),
        eq(userMemberships.isActive, 1),
      ),
    );

  if (all.length === 0) return null;
  const def = all.find((r) => !!r.isDefault) ?? all[0];
  return shapeMembership(def);
}

/** Decide whether the user has multiple memberships (login should show picker). */
export async function countMemberships(
  db: Database,
  userId: string,
): Promise<number> {
  const all = await db
    .select({ id: userMemberships.id })
    .from(userMemberships)
    .where(
      and(
        eq(userMemberships.userId, userId),
        eq(userMemberships.isActive, 1),
      ),
    );
  return all.length;
}

function shapeMembership(row: typeof userMemberships.$inferSelect): ResolvedMembership {
  const tenantType = row.tenantType as TenantType;
  return {
    membershipId: row.id,
    tenantType,
    tenantId: row.tenantId,
    role: row.role,
    hospitalId:    tenantType === 'HOSPITAL'     ? row.tenantId : null,
    vendorId:      tenantType === 'VENDOR'        ? row.tenantId : null,
    providerId:    tenantType === 'PROVIDER'      ? row.tenantId : null,
    superVendorId: tenantType === 'SUPER_VENDOR' ? row.tenantId : null,
  };
}

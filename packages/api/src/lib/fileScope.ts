import { eq, sql, or } from 'drizzle-orm';
import { orders, contracts, inventory, invoices } from '@curavend/db';
import type { Database } from './db';
import type { AuthUser } from '../middleware/auth';

/**
 * fileScope.ts — resolves an R2 file_key to its tenant context, and decides
 * whether a given user is allowed to download it.
 *
 * Two responsibilities:
 *   1. resolveFileScope(db, key) → owner entity + tenant ids (for audit log)
 *   2. canUserAccessFile(user, scope) → boolean (for the access check)
 *
 * Files referenced by orders.attachments / orders.delivery_sign_attachment /
 * orders.encounter_attachment / orders.original_order_attachment all map back
 * to the same order, hence the OR-LIKE search there.
 */

export type FileKind =
  | 'CONTRACT'
  | 'ORDER_ATTACHMENT'
  | 'INVENTORY_MANIFEST'
  | 'DELIVERY_PROOF'
  | 'INVOICE_PDF'
  | 'ORDER_PACKET'
  | 'OTHER';

export interface FileScope {
  kind: FileKind;
  hospitalId: string | null;
  vendorId: string | null;
  orderId: string | null;
  contractId: string | null;
  invoiceId: string | null;
}

export const UNKNOWN_SCOPE: FileScope = {
  kind: 'OTHER',
  hospitalId: null,
  vendorId: null,
  orderId: null,
  contractId: null,
  invoiceId: null,
};

/**
 * Walk the schema until we find a row that references this file_key. Returns
 * UNKNOWN_SCOPE if nothing references it (orphan / external upload).
 *
 * Order matters: most-frequent first to short-circuit.
 */
export async function resolveFileScope(
  db: Database,
  fileKey: string,
): Promise<FileScope> {
  if (!fileKey) return UNKNOWN_SCOPE;

  // ── 1. Order attachments (most common) ──────────────────────────────────
  // attachments is a JSON array; the others are scalar columns. SQLite can
  // do a simple LIKE on attachments to test JSON membership.
  const likeKey = `%${fileKey}%`;

  const orderHit = await db
    .select({
      id: orders.id,
      hospitalId: orders.hospitalId,
      vendorId: orders.vendorId,
      deliverySignAttachment: orders.deliverySignAttachment,
    })
    .from(orders)
    .where(
      or(
        eq(orders.deliverySignAttachment, fileKey),
        eq(orders.encounterAttachment, fileKey),
        eq(orders.originalOrderAttachment, fileKey),
        sql`${orders.attachments} LIKE ${likeKey}`,
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (orderHit) {
    const isDeliveryProof = orderHit.deliverySignAttachment === fileKey;
    return {
      kind: isDeliveryProof ? 'DELIVERY_PROOF' : 'ORDER_ATTACHMENT',
      hospitalId: orderHit.hospitalId ?? null,
      vendorId: orderHit.vendorId ?? null,
      orderId: orderHit.id,
      contractId: null,
      invoiceId: null,
    };
  }

  // ── 2. Contracts ───────────────────────────────────────────────────────
  const contractHit = await db
    .select({
      id: contracts.id,
      hospitalId: contracts.hospitalId,
      vendorId: contracts.vendorId,
    })
    .from(contracts)
    .where(eq(contracts.s3key, fileKey))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (contractHit) {
    return {
      kind: 'CONTRACT',
      hospitalId: contractHit.hospitalId ?? null,
      vendorId: contractHit.vendorId ?? null,
      orderId: null,
      contractId: contractHit.id,
      invoiceId: null,
    };
  }

  // ── 3. Invoices ────────────────────────────────────────────────────────
  const invoiceHit = await db
    .select({
      id: invoices.id,
      hospitalId: invoices.hospitalId,
      vendorId: invoices.vendorId,
    })
    .from(invoices)
    .where(eq(invoices.attachment, fileKey))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (invoiceHit) {
    return {
      kind: 'INVOICE_PDF',
      hospitalId: invoiceHit.hospitalId ?? null,
      vendorId: invoiceHit.vendorId ?? null,
      orderId: null,
      contractId: null,
      invoiceId: invoiceHit.id,
    };
  }

  // ── 4. Inventory manifests ─────────────────────────────────────────────
  const inventoryHit = await db
    .select({
      id: inventory.id,
      vendorId: inventory.vendorId,
    })
    .from(inventory)
    .where(eq(inventory.s3key, fileKey))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (inventoryHit) {
    return {
      kind: 'INVENTORY_MANIFEST',
      hospitalId: null,
      vendorId: inventoryHit.vendorId ?? null,
      orderId: null,
      contractId: null,
      invoiceId: null,
    };
  }

  // ── No match — orphan or external upload ───────────────────────────────
  return UNKNOWN_SCOPE;
}

/**
 * Decide whether `user` may download a file with the given scope.
 *
 * Rules:
 *   - ADMIN: full access to everything
 *   - HOSPITAL: own hospital's files only
 *   - VENDOR: own vendor's files only (incl. orders routed to them)
 *   - PROVIDER: own provider's hospitals (resolved via hospital lookup —
 *               kept simple here: provider can read everything under their
 *               hospitalId list, which the caller passes via
 *               user.hospitalId; if the provider is multi-hospital we'd
 *               need a hospitals lookup, deferred to Phase F multi-org work)
 *   - SUPER_VENDOR: own super-vendor's vendors (resolved similarly)
 *   - UNKNOWN_SCOPE: only ADMIN may read orphan files
 */
export function canUserAccessFile(
  user: AuthUser,
  scope: FileScope,
): boolean {
  // Platform admins can read anything
  if (user.userType === 'ADMIN') return true;

  // Orphan / unresolvable file → only admin (above) may access
  if (
    scope.hospitalId === null &&
    scope.vendorId === null &&
    scope.orderId === null &&
    scope.contractId === null &&
    scope.invoiceId === null
  ) {
    return false;
  }

  switch (user.userType) {
    case 'HOSPITAL':
      // Hospital users see their own hospital's files
      return Boolean(user.hospitalId && scope.hospitalId === user.hospitalId);

    case 'VENDOR':
      // Vendor users see their own vendor's files
      return Boolean(user.vendorId && scope.vendorId === user.vendorId);

    case 'PROVIDER':
      // Provider users see hospitals under their provider — basic check
      // currently relies on hospitalId match; multi-hospital support
      // deferred to Phase F membership work.
      return Boolean(
        user.hospitalId && scope.hospitalId === user.hospitalId,
      );

    case 'SUPER_VENDOR':
      // Super-vendor users see vendors under their super-vendor
      return Boolean(
        user.vendorId && scope.vendorId === user.vendorId,
      );

    default:
      return false;
  }
}

/** Get user-facing description for log/error display. */
export function describeScope(scope: FileScope): string {
  if (scope.orderId) return `order ${scope.orderId}`;
  if (scope.contractId) return `contract ${scope.contractId}`;
  if (scope.invoiceId) return `invoice ${scope.invoiceId}`;
  return scope.kind.toLowerCase();
}

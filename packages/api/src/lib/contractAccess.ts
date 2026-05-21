/**
 * Centralized access checks for contracts.
 *
 * Two distinct concepts:
 *   - assertContractAccess: can this user READ or WRITE this contract row at all?
 *     Tenant must match (ADMIN bypass).
 *   - assertCanReviewContract: can this user approve/reject/request-changes
 *     this submission? Only the *counterparty* to the drafter (or ADMIN) can.
 */
import { ForbiddenError } from './errors';
import type { AuthUser } from '../middleware/auth';

export interface ContractTenantFields {
  hospitalId?: string | null;
  vendorId?: string | null;
  providerId?: string | null;
  superVendorId?: string | null;
}

export interface ContractLifecycleFields extends ContractTenantFields {
  initiatedBy?: string | null;
  status?: string | null;
}

/**
 * Tenant-scope check — admins always pass; everyone else must own
 * the matching tenant field on the contract.
 */
export function assertContractAccess(
  user: AuthUser,
  contract: ContractTenantFields,
  action: 'read' | 'write' = 'write',
): void {
  if (user?.userType === 'ADMIN') return;
  if (user?.userType === 'HOSPITAL' && contract.hospitalId && contract.hospitalId === user.hospitalId) return;
  if (user?.userType === 'VENDOR' && contract.vendorId && contract.vendorId === user.vendorId) return;
  if (user?.userType === 'PROVIDER' && contract.providerId && contract.providerId === user.providerId) return;
  if (user?.userType === 'SUPER_VENDOR' && contract.superVendorId && contract.superVendorId === user.superVendorId) return;
  throw new ForbiddenError(`You do not have ${action} access to this contract`);
}

/**
 * Did this user draft the contract? ADMIN-drafted contracts are reviewable by
 * either party; otherwise the drafter cannot review their own submission.
 */
export function isContractDrafter(user: AuthUser, contract: ContractLifecycleFields): boolean {
  if (!contract.initiatedBy) return false;
  if (contract.initiatedBy === 'HOSPITAL') {
    return user?.userType === 'HOSPITAL' && !!contract.hospitalId && contract.hospitalId === user.hospitalId;
  }
  if (contract.initiatedBy === 'VENDOR') {
    return user?.userType === 'VENDOR' && !!contract.vendorId && contract.vendorId === user.vendorId;
  }
  // ADMIN-drafted contracts have no specific drafter party
  return false;
}

/**
 * Approve/reject/request-changes is only allowed for the COUNTERPARTY of the
 * drafter (the side that did NOT submit). Admins can always review.
 *
 * For ADMIN-initiated contracts, either tenant party may review.
 */
export function assertCanReviewContract(user: AuthUser, contract: ContractLifecycleFields): void {
  if (user?.userType === 'ADMIN') return;

  // First, the user must have read access (tenant match) at minimum
  assertContractAccess(user, contract, 'read');

  // Drafter cannot review their own submission
  if (isContractDrafter(user, contract)) {
    throw new ForbiddenError('You cannot review a contract you initiated. Wait for the counterparty.');
  }

  // For ADMIN-initiated contracts, either party may review (and tenant match
  // already validated). For HOSPITAL- or VENDOR-initiated, only the OTHER
  // side may review.
  if (contract.initiatedBy === 'HOSPITAL') {
    if (user?.userType !== 'VENDOR' || !contract.vendorId || contract.vendorId !== user.vendorId) {
      throw new ForbiddenError('Only the vendor party can review this contract');
    }
    return;
  }
  if (contract.initiatedBy === 'VENDOR') {
    if (user?.userType !== 'HOSPITAL' || !contract.hospitalId || contract.hospitalId !== user.hospitalId) {
      throw new ForbiddenError('Only the hospital party can review this contract');
    }
    return;
  }
  // ADMIN-initiated: tenant check above is sufficient
}

/**
 * Returns the "other party" userType for routing notifications.
 * If HOSPITAL drafted, the reviewer is VENDOR, and vice versa.
 */
export function counterpartyOf(contract: ContractLifecycleFields): 'HOSPITAL' | 'VENDOR' | null {
  if (contract.initiatedBy === 'HOSPITAL') return 'VENDOR';
  if (contract.initiatedBy === 'VENDOR') return 'HOSPITAL';
  return null;
}

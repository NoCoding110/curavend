/**
 * Contract state-machine transitions.
 *
 * Each function enforces:
 *   - Permitted source status (e.g., only DRAFT can be submitted)
 *   - Caller role (drafter vs reviewer)
 *   - Atomic DB updates: contract row, optional revision row, history row
 *   - Notification dispatch via notifyContractEvent
 *
 * Routes call these helpers — never write transition logic in the route.
 */
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  contracts,
  contractItems,
  contractRevisions,
  contractHistory,
} from '@curavend/db';
import { getDb } from './db';
import { ForbiddenError, NotFoundError, ValidationError } from './errors';
import { assertContractAccess, assertCanReviewContract, isContractDrafter } from './contractAccess';
import { notifyContractEvent, type ContractEventType } from '../queues/contractNotifications';
import type { AuthUser } from '../middleware/auth';
import type { Env } from './env';

type Db = ReturnType<typeof getDb>;

async function logHistory(
  db: Db,
  contractId: string,
  description: string,
  userId: string | null,
): Promise<void> {
  await db.insert(contractHistory).values({
    contractId,
    description,
    changedByUserId: userId,
  });
}

async function loadContract(db: Db, id: string) {
  const rows = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Contract not found');
  return rows[0];
}

/**
 * DRAFT → PENDING_APPROVAL.
 * Snapshots current contract_items + metadata into a new contract_revisions row.
 * Drafter only (the user who created the contract, or admin).
 */
export async function submitContract(env: Env, user: AuthUser, contractId: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  assertContractAccess(user, contract, 'write');

  if (contract.status !== 'DRAFT') {
    throw new ValidationError(`Cannot submit contract in status ${contract.status}`);
  }

  // Determine next revision number
  const last = await db
    .select({ n: contractRevisions.revisionNumber })
    .from(contractRevisions)
    .where(eq(contractRevisions.contractId, contractId))
    .orderBy(desc(contractRevisions.revisionNumber))
    .limit(1);
  const nextRevision = (last[0]?.n ?? 0) + 1;

  // Snapshot current items
  const items = await db
    .select({
      hcpcCode: contractItems.hcpcCode,
      description: contractItems.description,
      rate: contractItems.negotiatedRate,
      quantity: contractItems.quantity,
    })
    .from(contractItems)
    .where(eq(contractItems.contractId, contractId));

  if (items.length === 0) {
    throw new ValidationError('Cannot submit a contract with no line items');
  }

  const revisionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(contractRevisions).values({
    id: revisionId,
    contractId,
    revisionNumber: nextRevision,
    s3key: contract.s3key,
    name: contract.name,
    startDate: contract.startDate,
    endDate: contract.endDate,
    itemsSnapshot: JSON.stringify(items),
    submittedByUserId: user.id,
    submittedAt: now,
  });

  await db
    .update(contracts)
    .set({
      status: 'PENDING_APPROVAL',
      currentRevisionId: revisionId,
      updatedAt: now,
    })
    .where(eq(contracts.id, contractId));

  await logHistory(db, contractId, `${user.email} submitted revision ${nextRevision} for approval`, user.id);

  await notifyContractEvent(env, contractId, 'submitted', user.id);

  return { revisionId, revisionNumber: nextRevision };
}

/** PENDING_APPROVAL → DRAFT (drafter withdraws their own submission). */
export async function withdrawContract(env: Env, user: AuthUser, contractId: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  assertContractAccess(user, contract, 'write');

  if (contract.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Cannot withdraw contract in status ${contract.status}`);
  }
  if (user.userType !== 'ADMIN' && !isContractDrafter(user, contract)) {
    throw new ForbiddenError('Only the drafter can withdraw a submission');
  }

  const now = new Date().toISOString();
  await db
    .update(contracts)
    .set({ status: 'DRAFT', updatedAt: now })
    .where(eq(contracts.id, contractId));

  await logHistory(db, contractId, `${user.email} withdrew the submission`, user.id);
  return { status: 'DRAFT' };
}

/**
 * PENDING_APPROVAL → APPROVED (or ACTIVE if startDate ≤ today).
 * Reviewer only (counterparty, or admin).
 * Marks the current revision as APPROVED.
 */
export async function approveContract(env: Env, user: AuthUser, contractId: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  if (contract.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Cannot approve contract in status ${contract.status}`);
  }
  assertCanReviewContract(user, contract);

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const nextStatus = contract.startDate <= today && contract.endDate >= today ? 'ACTIVE' : 'APPROVED';

  await db
    .update(contracts)
    .set({ status: nextStatus, updatedAt: now })
    .where(eq(contracts.id, contractId));

  // Mark the current revision as approved
  if (contract.currentRevisionId) {
    await db
      .update(contractRevisions)
      .set({
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewDecision: 'APPROVED',
      })
      .where(eq(contractRevisions.id, contract.currentRevisionId));
  }

  // If this was an amendment, mark the parent as SUPERSEDED
  if (contract.parentContractId) {
    await db
      .update(contracts)
      .set({ status: 'SUPERSEDED', updatedAt: now })
      .where(eq(contracts.id, contract.parentContractId));
    await logHistory(
      db,
      contract.parentContractId,
      `Superseded by amendment ${contractId.slice(0, 8)}`,
      user.id,
    );
  }

  await logHistory(db, contractId, `${user.email} approved (status → ${nextStatus})`, user.id);
  await notifyContractEvent(env, contractId, 'approved', user.id);

  return { status: nextStatus };
}

/** PENDING_APPROVAL → REJECTED. Reviewer only. Records reason. */
export async function rejectContract(env: Env, user: AuthUser, contractId: string, reason?: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  if (contract.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Cannot reject contract in status ${contract.status}`);
  }
  assertCanReviewContract(user, contract);

  const now = new Date().toISOString();
  await db
    .update(contracts)
    .set({
      status: 'REJECTED',
      rejectedReason: reason ?? null,
      updatedAt: now,
    })
    .where(eq(contracts.id, contractId));

  if (contract.currentRevisionId) {
    await db
      .update(contractRevisions)
      .set({
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewDecision: 'REJECTED',
        reviewComment: reason ?? null,
      })
      .where(eq(contractRevisions.id, contract.currentRevisionId));
  }

  await logHistory(db, contractId, `${user.email} rejected: ${reason ?? '(no reason)'}`, user.id);
  await notifyContractEvent(env, contractId, 'rejected', user.id);

  return { status: 'REJECTED', reason };
}

/** PENDING_APPROVAL → DRAFT with comment. Reviewer only. Drafter resubmits as new revision. */
export async function requestContractChanges(env: Env, user: AuthUser, contractId: string, comment: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  if (contract.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Cannot request changes on contract in status ${contract.status}`);
  }
  assertCanReviewContract(user, contract);
  if (!comment || !comment.trim()) {
    throw new ValidationError('A comment is required when requesting changes');
  }

  const now = new Date().toISOString();
  await db
    .update(contracts)
    .set({ status: 'DRAFT', updatedAt: now })
    .where(eq(contracts.id, contractId));

  if (contract.currentRevisionId) {
    await db
      .update(contractRevisions)
      .set({
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewDecision: 'CHANGES_REQUESTED',
        reviewComment: comment,
      })
      .where(eq(contractRevisions.id, contract.currentRevisionId));
  }

  await logHistory(db, contractId, `${user.email} requested changes: ${comment}`, user.id);
  await notifyContractEvent(env, contractId, 'changes_requested', user.id);

  return { status: 'DRAFT', comment };
}

/** REJECTED → DRAFT (drafter or admin re-opens for further edits). */
export async function reopenContract(env: Env, user: AuthUser, contractId: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  assertContractAccess(user, contract, 'write');

  if (contract.status !== 'REJECTED') {
    throw new ValidationError(`Cannot reopen contract in status ${contract.status}`);
  }
  if (user.userType !== 'ADMIN' && !isContractDrafter(user, contract)) {
    throw new ForbiddenError('Only the drafter or an admin can reopen a rejected contract');
  }

  const now = new Date().toISOString();
  await db
    .update(contracts)
    .set({ status: 'DRAFT', rejectedReason: null, updatedAt: now })
    .where(eq(contracts.id, contractId));

  await logHistory(db, contractId, `${user.email} reopened the contract`, user.id);
  return { status: 'DRAFT' };
}

/** ACTIVE → TERMINATED. Either party may terminate (or admin). */
export async function terminateContract(env: Env, user: AuthUser, contractId: string, reason?: string) {
  const db = getDb(env.DB);
  const contract = await loadContract(db, contractId);
  assertContractAccess(user, contract, 'write');

  if (contract.status !== 'ACTIVE' && contract.status !== 'APPROVED') {
    throw new ValidationError(`Cannot terminate contract in status ${contract.status}`);
  }

  const now = new Date().toISOString();
  await db
    .update(contracts)
    .set({
      status: 'TERMINATED',
      terminatedAt: now,
      terminatedBy: user.id,
      terminationReason: reason ?? null,
      updatedAt: now,
    })
    .where(eq(contracts.id, contractId));

  await logHistory(db, contractId, `${user.email} terminated: ${reason ?? '(no reason)'}`, user.id);
  await notifyContractEvent(env, contractId, 'terminated', user.id);

  return { status: 'TERMINATED' };
}

/**
 * Clone an ACTIVE contract into a new DRAFT contract referencing it as parent.
 * On approval of the child, the parent transitions to SUPERSEDED.
 */
export async function amendContract(env: Env, user: AuthUser, contractId: string) {
  const db = getDb(env.DB);
  const parent = await loadContract(db, contractId);
  assertContractAccess(user, parent, 'write');

  if (parent.status !== 'ACTIVE') {
    throw new ValidationError(`Can only amend ACTIVE contracts (current: ${parent.status})`);
  }

  const initiatedBy: 'HOSPITAL' | 'VENDOR' | 'ADMIN' =
    user.userType === 'ADMIN' ? 'ADMIN' :
    user.userType === 'HOSPITAL' ? 'HOSPITAL' :
    user.userType === 'VENDOR' ? 'VENDOR' :
    'ADMIN';

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(contracts).values({
    id: newId,
    startDate: parent.startDate,
    endDate: parent.endDate,
    name: parent.name ? `${parent.name} (Amendment)` : 'Amendment',
    vendorId: parent.vendorId,
    hospitalId: parent.hospitalId,
    superVendorId: parent.superVendorId,
    providerId: parent.providerId,
    s3key: parent.s3key,
    status: 'DRAFT',
    initiatedBy,
    parentContractId: contractId,
    itemCategories: parent.itemCategories,
    createdAt: now,
    updatedAt: now,
  });

  // Copy current items
  const parentItems = await db
    .select()
    .from(contractItems)
    .where(eq(contractItems.contractId, contractId));

  for (const item of parentItems) {
    await db.insert(contractItems).values({
      contractId: newId,
      hcpcCode: item.hcpcCode,
      description: item.description,
      negotiatedRate: item.negotiatedRate,
      quantity: item.quantity,
    });
  }

  await logHistory(db, newId, `${user.email} created amendment of ${contractId.slice(0, 8)}`, user.id);
  return { id: newId, parentContractId: contractId };
}

export type { ContractEventType };

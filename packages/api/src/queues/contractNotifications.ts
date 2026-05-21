/**
 * Contract event notifications — in-app rows + email.
 *
 * Routing matrix (who gets notified for which event):
 *   submitted          → counterparty users
 *   approved           → drafter users (and counterparty for confirmation)
 *   rejected           → drafter users
 *   changes_requested  → drafter users
 *   terminated         → both parties
 *   amended            → counterparty
 *   expiring           → both parties
 *   expired            → both parties
 */
import { eq, and } from 'drizzle-orm';
import { contracts, hospitals, vendors, users } from '@curavend/db';
import { getDb } from '../lib/db';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import type { Env } from '../lib/env';

export type ContractEventType =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'terminated'
  | 'amended'
  | 'expiring'
  | 'expired';

interface ContractRow {
  id: string;
  name: string | null;
  hospitalId: string | null;
  vendorId: string | null;
  status: string;
  startDate: string;
  endDate: string;
  initiatedBy: string | null;
  rejectedReason: string | null;
  terminationReason: string | null;
}

const HUMAN_EVENT: Record<ContractEventType, string> = {
  submitted: 'submitted for approval',
  approved: 'approved',
  rejected: 'rejected',
  changes_requested: 'returned with requested changes',
  terminated: 'terminated',
  amended: 'amended',
  expiring: 'expiring soon',
  expired: 'expired',
};

async function fetchContract(env: Env, contractId: string): Promise<ContractRow | null> {
  const db = getDb(env.DB);
  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  return rows[0] ?? null;
}

async function tenantLabel(env: Env, contract: ContractRow): Promise<{ hospital: string; vendor: string }> {
  const db = getDb(env.DB);
  let hospital = 'a hospital';
  let vendor = 'a vendor';
  if (contract.hospitalId) {
    const h = await db.select({ name: hospitals.name }).from(hospitals).where(eq(hospitals.id, contract.hospitalId)).limit(1);
    if (h[0]?.name) hospital = h[0].name;
  }
  if (contract.vendorId) {
    const v = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, contract.vendorId)).limit(1);
    if (v[0]?.name) vendor = v[0].name;
  }
  return { hospital, vendor };
}

async function getActiveUsersForTenant(
  env: Env,
  tenant: 'hospital' | 'vendor',
  tenantId: string,
): Promise<{ id: string; email: string | null; name: string | null }[]> {
  const db = getDb(env.DB);
  const whereClause =
    tenant === 'hospital'
      ? and(eq(users.hospitalId, tenantId), eq(users.userStatus, 'ACTIVE'))
      : and(eq(users.vendorId, tenantId), eq(users.userStatus, 'ACTIVE'));
  return db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(whereClause);
}

/**
 * Routing rules:
 *   - drafter side is determined by initiatedBy ("HOSPITAL" | "VENDOR" | "ADMIN")
 *   - submitted → counterparty
 *   - approved/rejected/changes_requested → drafter
 *   - terminated/amended/expiring/expired → both parties
 */
function routeForEvent(
  event: ContractEventType,
  initiatedBy: string | null,
): Array<'hospital' | 'vendor'> {
  const drafter = initiatedBy === 'HOSPITAL' ? 'hospital' : initiatedBy === 'VENDOR' ? 'vendor' : null;
  const counterparty = drafter === 'hospital' ? 'vendor' : drafter === 'vendor' ? 'hospital' : null;

  switch (event) {
    case 'submitted':
      // Drafter knows; tell counterparty
      return counterparty ? [counterparty] : ['hospital', 'vendor'];
    case 'approved':
    case 'rejected':
    case 'changes_requested':
      return drafter ? [drafter] : ['hospital', 'vendor'];
    case 'terminated':
    case 'amended':
    case 'expiring':
    case 'expired':
      return ['hospital', 'vendor'];
  }
}

function buildMessage(
  event: ContractEventType,
  contract: ContractRow,
  labels: { hospital: string; vendor: string },
): string {
  const subject = contract.name ?? `Contract ${contract.id.slice(0, 8)}`;
  const parties = `${labels.hospital} ↔ ${labels.vendor}`;
  const action = HUMAN_EVENT[event];
  switch (event) {
    case 'submitted':
      return `${subject} (${parties}) was ${action}. Please review.`;
    case 'rejected':
      return `${subject} was ${action}${contract.rejectedReason ? `: ${contract.rejectedReason}` : ''}`;
    case 'terminated':
      return `${subject} was ${action}${contract.terminationReason ? `: ${contract.terminationReason}` : ''}`;
    case 'expiring':
      return `${subject} expires on ${contract.endDate}. Consider renewing.`;
    case 'expired':
      return `${subject} has ${action} (${contract.endDate}).`;
    default:
      return `${subject} was ${action}.`;
  }
}

/** Public API: notify all relevant parties for a contract event. */
export async function notifyContractEvent(
  env: Env,
  contractId: string,
  event: ContractEventType,
  actorUserId: string,
): Promise<void> {
  try {
    const contract = await fetchContract(env, contractId);
    if (!contract) return;
    const labels = await tenantLabel(env, contract);
    const message = buildMessage(event, contract, labels);
    const subject = `[Curavend] Contract ${event.replace('_', ' ')}`;
    const html = `<p>${message}</p><p><a href="${env.FRONTEND_URL}/contracts/${contractId}">View contract</a></p>`;

    const targetTenants = routeForEvent(event, contract.initiatedBy);
    const recipientUsers: { id: string; email: string | null; name: string | null }[] = [];

    for (const tenant of targetTenants) {
      const tenantId = tenant === 'hospital' ? contract.hospitalId : contract.vendorId;
      if (!tenantId) continue;
      const list = await getActiveUsersForTenant(env, tenant, tenantId);
      recipientUsers.push(...list);
    }

    // Dedupe + skip the actor (don't notify yourself)
    const seen = new Set<string>();
    const filtered = recipientUsers.filter((u) => {
      if (u.id === actorUserId) return false;
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    const notifSvc = new NotificationService(env.DB);
    const emailSvc = env.RESEND_API_KEY ? new EmailService(env.RESEND_API_KEY) : null;

    for (const u of filtered) {
      try {
        await notifSvc.createNotification({
          receiverId: u.id,
          message,
          redirectTo: 'CONTRACT',
          redirectId: contractId,
        });
      } catch (err) {
        console.warn('[contract-notify] in-app failed:', err);
      }
      if (emailSvc && u.email) {
        try {
          await emailSvc.sendEmail({ to: u.email, subject, html });
        } catch (err) {
          console.warn('[contract-notify] email failed:', err);
        }
      }
    }
  } catch (err) {
    // Notifications must never break the calling transition
    console.error('[contract-notify] failed:', err);
  }
}

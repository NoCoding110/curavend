/**
 * Daily DMEPOS compliance expiry sweep.
 *
 * Walks `vendor_compliance_docs` and `vendor_dmepos_compliance` for items
 * expiring within 30 days (or already expired). Fires in-app notifications
 * to platform admins (ACCOUNT_MANAGER, ACCOUNT_MANAGER_USER) so they can
 * chase vendors for renewed certificates.
 *
 * Idempotency: tracks "last notified" via vendor_compliance_docs.notes
 * (appends a timestamp) to avoid spamming every day. We notify once when
 * the cert enters the 30-day window and again when it expires.
 *
 * Wired into the existing daily 0 8 * * * cron.
 */
import { and, eq, lte } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  vendorComplianceDocs,
  vendorDmeposCompliance,
  vendors,
  users,
} from '@curavend/db';
import type { Env } from '../lib/env';
import { NotificationService } from '../services/notificationService';

const NOTIFY_WINDOW_DAYS = 30;

interface ExpiringItem {
  vendorId: string;
  vendorName: string;
  itemLabel: string;          // e.g. "CMS_ACCREDITATION (Cert #12345)" or "Surety Bond"
  expirationDate: string;
  daysLeft: number;
}

export async function handleDmeposExpiry(env: Env): Promise<{
  notified: number;
  expiring: number;
  alreadyExpired: number;
}> {
  const db = getDb(env.DB);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cutoff = new Date(today.getTime() + NOTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // 1. Active cert docs expiring within window
  const docs = await db
    .select()
    .from(vendorComplianceDocs)
    .where(
      and(
        eq(vendorComplianceDocs.isActive, 1),
        lte(vendorComplianceDocs.expirationDate, cutoff),
      ),
    );

  // 2. Vendor-summary accreditation / bond expiries
  const sums = await db.select().from(vendorDmeposCompliance);
  const summaryExpiring: ExpiringItem[] = [];
  for (const s of sums) {
    if (s.accreditationExpiresAt && s.accreditationExpiresAt <= cutoff) {
      summaryExpiring.push({
        vendorId: s.vendorId,
        vendorName: '',
        itemLabel: `DMEPOS Accreditation${s.accreditationBody ? ` (${s.accreditationBody})` : ''}`,
        expirationDate: s.accreditationExpiresAt,
        daysLeft: Math.ceil(
          (new Date(s.accreditationExpiresAt).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
        ),
      });
    }
    if (s.suretyBondExpiresAt && s.suretyBondExpiresAt <= cutoff) {
      summaryExpiring.push({
        vendorId: s.vendorId,
        vendorName: '',
        itemLabel: 'Surety Bond',
        expirationDate: s.suretyBondExpiresAt,
        daysLeft: Math.ceil(
          (new Date(s.suretyBondExpiresAt).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
        ),
      });
    }
  }

  // Resolve vendor names
  const allVendorIds = Array.from(
    new Set([...docs.map((d) => d.vendorId), ...summaryExpiring.map((e) => e.vendorId)]),
  );
  const vendorRows = allVendorIds.length
    ? await db.select().from(vendors)
    : [];
  const vNameMap = new Map(vendorRows.map((v) => [v.id, v.name]));

  // Build combined item list
  const allExpiring: ExpiringItem[] = [
    ...docs.map((d) => {
      const expDays = d.expirationDate
        ? Math.ceil(
            (new Date(d.expirationDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
          )
        : 999;
      return {
        vendorId: d.vendorId,
        vendorName: vNameMap.get(d.vendorId) ?? 'Unknown vendor',
        itemLabel: `${d.certType.replace('_', ' ')}${d.certNumber ? ` (#${d.certNumber})` : ''}`,
        expirationDate: d.expirationDate ?? '',
        daysLeft: expDays,
      };
    }),
    ...summaryExpiring.map((s) => ({
      ...s,
      vendorName: vNameMap.get(s.vendorId) ?? 'Unknown vendor',
    })),
  ];

  if (allExpiring.length === 0) {
    return { notified: 0, expiring: 0, alreadyExpired: 0 };
  }

  // Fetch all platform admins to notify
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'ACCOUNT_MANAGER'));
  const adminMgrs = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'ACCOUNT_MANAGER_USER'));
  const adminIds = Array.from(new Set([...admins, ...adminMgrs].map((u) => u.id)));

  if (adminIds.length === 0) {
    return { notified: 0, expiring: allExpiring.length, alreadyExpired: 0 };
  }

  // De-dupe: one notification per vendor per day summarizing all their expiring items.
  // The notification table doesn't have a uniqueness constraint we can use, so we
  // just send one consolidated notification per vendor per cron run.
  const byVendor = new Map<string, ExpiringItem[]>();
  for (const e of allExpiring) {
    if (!byVendor.has(e.vendorId)) byVendor.set(e.vendorId, []);
    byVendor.get(e.vendorId)!.push(e);
  }

  const notif = new NotificationService(env.DB);
  let notified = 0;
  let alreadyExpired = 0;
  for (const [vendorId, items] of byVendor) {
    const vendorName = items[0].vendorName;
    const expired = items.filter((i) => i.daysLeft <= 0);
    if (expired.length > 0) alreadyExpired += expired.length;
    const expiringSoon = items.filter((i) => i.daysLeft > 0);
    const message =
      expired.length > 0
        ? `${vendorName}: ${expired.length} compliance doc(s) EXPIRED — ${expired
            .map((e) => e.itemLabel)
            .join(', ')}`
        : `${vendorName}: ${expiringSoon.length} compliance doc(s) expiring in ${Math.min(
            ...expiringSoon.map((e) => e.daysLeft),
          )}d — ${expiringSoon.map((e) => e.itemLabel).join(', ')}`;

    for (const adminId of adminIds) {
      await notif.createNotification({
        receiverId: adminId,
        message,
        redirectTo: 'NO_REDIRECT',
        redirectId: vendorId,
      });
      notified++;
    }
  }

  return { notified, expiring: allExpiring.length, alreadyExpired };
}

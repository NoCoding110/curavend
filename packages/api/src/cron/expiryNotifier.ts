/**
 * Cron: daily at 08:00 UTC.
 * Emails vendors / admins about accreditation, license, insurance,
 * contract, and fee-schedule items expiring within 30 days.
 */
import { getDb } from '../lib/db';
import { vendors, contracts, customFeeSchedules } from '@curavend/db';
import { and, lt, sql } from 'drizzle-orm';
import { EmailService } from '../services/emailService';
import { notifyVendorUsers } from '../queues/notificationHelpers';
import dayjs from 'dayjs';
import type { Env } from '../lib/env';

export async function handleExpiryNotifications(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const emailService = new EmailService(env.RESEND_API_KEY);

  const thirtyDaysFromNow = dayjs().add(30, 'day').format('YYYY-MM-DD');

  // Vendor licensing expiries
  const expiringVendors = await db.query.vendors.findMany({
    where: sql`(
      ${vendors.accreditationExpiryDate} IS NOT NULL AND ${vendors.accreditationExpiryDate} <= ${thirtyDaysFromNow}
    ) OR (
      ${vendors.stateLevelLicenseExpiryDate} IS NOT NULL AND ${vendors.stateLevelLicenseExpiryDate} <= ${thirtyDaysFromNow}
    ) OR (
      ${vendors.liabilityInsuranceExpiryDate} IS NOT NULL AND ${vendors.liabilityInsuranceExpiryDate} <= ${thirtyDaysFromNow}
    )`,
    limit: 100,
  });

  for (const vendor of expiringVendors) {
    if (!vendor.email) continue;
    try {
      const expiryItems: string[] = [];
      if (
        vendor.accreditationExpiryDate &&
        vendor.accreditationExpiryDate <= thirtyDaysFromNow
      ) {
        expiryItems.push(`Accreditation (${vendor.accreditationExpiryDate})`);
      }
      if (
        vendor.stateLevelLicenseExpiryDate &&
        vendor.stateLevelLicenseExpiryDate <= thirtyDaysFromNow
      ) {
        expiryItems.push(`State License (${vendor.stateLevelLicenseExpiryDate})`);
      }
      if (
        vendor.liabilityInsuranceExpiryDate &&
        vendor.liabilityInsuranceExpiryDate <= thirtyDaysFromNow
      ) {
        expiryItems.push(`Liability Insurance (${vendor.liabilityInsuranceExpiryDate})`);
      }

      await emailService.sendEmail({
        to: vendor.email,
        subject: `Curavend: Upcoming Expiry Notice - ${vendor.name ?? 'Vendor'}`,
        html: `<p>The following items for ${vendor.name ?? 'your organization'} are expiring within 30 days:</p><ul>${expiryItems.map((i) => `<li>${i}</li>`).join('')}</ul><p>Please update these in your Curavend account.</p>`,
      });

      // In-app notification to the vendor users
      await notifyVendorUsers(
        env,
        vendor.id,
        `Credentials expiring within 30 days: ${expiryItems.join(', ')}`,
        'VENDOR_USER',
        vendor.id,
      );
    } catch (err) {
      console.error(`[cron] Failed to send expiry notice to vendor ${vendor.id}:`, err);
    }
  }

  // Contracts expiring
  const expiringContracts = await db.query.contracts.findMany({
    where: and(lt(contracts.endDate, thirtyDaysFromNow)),
    limit: 100,
  });

  for (const contract of expiringContracts) {
    if (!contract.vendorId) continue;
    try {
      await notifyVendorUsers(
        env,
        contract.vendorId,
        `Contract "${contract.name ?? contract.id}" expires ${contract.endDate}`,
        'NO_REDIRECT',
        contract.id,
      );
    } catch (err) {
      console.error(`[cron] Failed to notify contract expiry ${contract.id}:`, err);
    }
  }

  // Fee schedules expiring
  const expiringSchedules = await db.query.customFeeSchedules.findMany({
    where: and(lt(customFeeSchedules.endDate, thirtyDaysFromNow)),
    limit: 100,
  });

  for (const fs of expiringSchedules) {
    if (!fs.vendorId) continue;
    try {
      await notifyVendorUsers(
        env,
        fs.vendorId,
        `Fee schedule expires ${fs.endDate}`,
        'NO_REDIRECT',
        fs.id,
      );
    } catch (err) {
      console.error(`[cron] Failed to notify fee schedule expiry ${fs.id}:`, err);
    }
  }

  console.log(
    `[cron] Processed ${expiringVendors.length} vendor, ${expiringContracts.length} contract, ${expiringSchedules.length} fee-schedule expiries`,
  );
}

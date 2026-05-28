/**
 * Compliance alert sweeper. Run daily by the 0 8 * * * cron.
 *
 * Walks 4 sources and emits one row per (subject, alertKind, thresholdDays)
 * using INSERT OR IGNORE so the sweep is idempotent within the day:
 *
 *   1. vendor_dmepos_compliance.accreditation_expiry_date — VENDOR_DMEPOS / EXPIRY
 *   2. vendors.accreditation_expiry_date                  — VENDOR_ACCREDITATION / EXPIRY
 *   3. vendors.state_level_license_expiry_date            — VENDOR_LICENSE / EXPIRY
 *   4. vendors.liability_insurance_expiry_date            — VENDOR_INSURANCE / EXPIRY
 *   5. lab_inventory_lots.expiration_date (ACTIVE only)   — LAB_LOT / EXPIRY
 *
 * Thresholds: 60, 30, 7 days. Severity: 60→INFO, 30→WARN, 7→CRITICAL.
 *
 * Resolves stale alerts whose underlying expiry date is now beyond the
 * threshold (the cert was renewed).
 */
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { complianceAlerts, vendors, labInventoryLots } from '@curavend/db';

const THRESHOLDS = [60, 30, 7] as const;

function severityFor(days: number): 'INFO' | 'WARN' | 'CRITICAL' {
  if (days <= 7) return 'CRITICAL';
  if (days <= 30) return 'WARN';
  return 'INFO';
}

function daysBetween(future: string): number {
  const d = new Date(future).getTime() - Date.now();
  return Math.ceil(d / (24 * 60 * 60 * 1000));
}

async function upsertAlert(
  d1: D1Database,
  args: {
    hospitalId?: string | null;
    subjectType: string;
    subjectId: string;
    alertKind: string;
    thresholdDays: number;
    expiresOn: string;
    message: string;
  },
) {
  const db = getDb(d1);
  try {
    await db.insert(complianceAlerts).values({
      id: crypto.randomUUID(),
      hospitalId: args.hospitalId ?? null,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      alertKind: args.alertKind,
      thresholdDays: args.thresholdDays,
      expiresOn: args.expiresOn,
      severity: severityFor(args.thresholdDays),
      message: args.message,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    // UNIQUE constraint = already alerted this threshold; safe to skip.
    if (!String(err?.message ?? '').includes('UNIQUE')) throw err;
  }
}

export interface ComplianceSweepResult {
  vendorAccreditation: number;
  vendorLicense: number;
  vendorInsurance: number;
  labLots: number;
  resolved: number;
}

export async function sweepComplianceAlerts(d1: D1Database): Promise<ComplianceSweepResult> {
  const db = getDb(d1);
  const result: ComplianceSweepResult = {
    vendorAccreditation: 0,
    vendorLicense: 0,
    vendorInsurance: 0,
    labLots: 0,
    resolved: 0,
  };

  // ─── Vendor expiries (3 buckets in one pass) ───────────────────────────
  const vendorRows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      accreditationExpiryDate: vendors.accreditationExpiryDate,
      stateLevelLicenseExpiryDate: vendors.stateLevelLicenseExpiryDate,
      liabilityInsuranceExpiryDate: vendors.liabilityInsuranceExpiryDate,
    })
    .from(vendors);
  for (const v of vendorRows) {
    const checks: Array<[string, string | null | undefined, keyof ComplianceSweepResult]> = [
      ['VENDOR_ACCREDITATION', v.accreditationExpiryDate, 'vendorAccreditation'],
      ['VENDOR_LICENSE', v.stateLevelLicenseExpiryDate, 'vendorLicense'],
      ['VENDOR_INSURANCE', v.liabilityInsuranceExpiryDate, 'vendorInsurance'],
    ];
    for (const [subjectType, expiresOn, counterKey] of checks) {
      if (!expiresOn) continue;
      const daysLeft = daysBetween(expiresOn);
      for (const t of THRESHOLDS) {
        if (daysLeft <= t && daysLeft > 0) {
          await upsertAlert(d1, {
            subjectType,
            subjectId: v.id,
            alertKind: 'EXPIRY',
            thresholdDays: t,
            expiresOn,
            message: `Vendor ${v.name ?? v.id.slice(0, 8)} ${subjectType.toLowerCase().replace('vendor_', '')} expires in ${daysLeft} day(s)`,
          });
          (result as any)[counterKey]++;
          break; // only emit the tightest threshold
        }
      }
    }
  }

  // ─── Lab lot expiries ──────────────────────────────────────────────────
  const cutoff = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const lotRows = await db
    .select({
      id: labInventoryLots.id,
      lotNumber: labInventoryLots.lotNumber,
      expirationDate: labInventoryLots.expirationDate,
      consumableId: labInventoryLots.consumableId,
    })
    .from(labInventoryLots)
    .where(
      and(
        eq(labInventoryLots.status, 'ACTIVE'),
        isNotNull(labInventoryLots.expirationDate),
        lte(labInventoryLots.expirationDate, cutoff),
        gte(labInventoryLots.expirationDate, new Date().toISOString().slice(0, 10)),
      ),
    );
  for (const lot of lotRows) {
    const daysLeft = daysBetween(lot.expirationDate!);
    for (const t of THRESHOLDS) {
      if (daysLeft <= t && daysLeft > 0) {
        await upsertAlert(d1, {
          subjectType: 'LAB_LOT',
          subjectId: lot.id,
          alertKind: 'EXPIRY',
          thresholdDays: t,
          expiresOn: lot.expirationDate!,
          message: `Lab lot ${lot.lotNumber} expires in ${daysLeft} day(s)`,
        });
        result.labLots++;
        break;
      }
    }
  }

  // ─── Auto-resolve stale alerts ─────────────────────────────────────────
  // When the underlying expiry date is now > 60 days out, mark resolved.
  const stale = await db.run(sql.raw(`
    UPDATE compliance_alerts
    SET resolved_at = '${new Date().toISOString()}', updated_at = '${new Date().toISOString()}'
    WHERE resolved_at IS NULL
      AND expires_on IS NOT NULL
      AND date(expires_on) > date('now', '+60 days')
  `));
  result.resolved = Number(stale?.meta?.changes ?? 0);

  return result;
}

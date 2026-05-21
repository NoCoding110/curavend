/**
 * Cron: daily at 08:00 UTC (mounted alongside other daily tasks).
 * Polls the external kit-letter catalog and upserts to local DB.
 */
import { syncKitLetters, type KitLetterSyncReport } from '../services/kitLetterSyncService';
import type { Env } from '../lib/env';

export async function handleKitLetterSync(env: Env): Promise<KitLetterSyncReport> {
  console.log('[cron] kit-letter sync start');
  const report = await syncKitLetters(env, { dryRun: false });
  console.log('[cron] kit-letter sync complete', report);
  return report;
}

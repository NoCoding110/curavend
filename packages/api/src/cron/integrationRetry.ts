/**
 * Cron: drive integration retries.
 *
 * Runs every 15 minutes (piggybacks on the existing `*\/15 * * * *`
 * trigger in `index.ts`). Scans RETRYING rows whose `next_retry_at` is past
 * and notifies the team. The actual re-fire of arbitrary outbound calls is
 * a future enhancement — for v1 the retry endpoint simply marks rows as
 * RETRYING and the wrapping caller code re-invokes them.
 *
 * What this cron DOES do today:
 *   - Surface stuck rows (status=RETRYING, attempts>=MAX) by transitioning
 *     them to DEAD_LETTER if they've passed the attempt cap.
 *   - Emit a console log summary for ops dashboards.
 */
import { and, eq, sql, lte } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { integrationLog } from '@curavend/db';
import type { Env } from '../lib/env';

const MAX_ATTEMPTS = 5;

export async function handleIntegrationRetry(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  // ── 1. Auto-promote stuck RETRYING rows past max attempts to DEAD_LETTER ──
  const stuck = await db
    .select({ id: integrationLog.id })
    .from(integrationLog)
    .where(
      and(
        eq(integrationLog.status, 'RETRYING'),
        sql`${integrationLog.attemptCount} >= ${MAX_ATTEMPTS}`,
      ),
    );
  for (const row of stuck) {
    await db
      .update(integrationLog)
      .set({ status: 'DEAD_LETTER', nextRetryAt: null, updatedAt: now })
      .where(eq(integrationLog.id, row.id));
  }

  // ── 2. Counts for ops visibility ───────────────────────────────────────
  const counts: any = await db.run(sql`
    SELECT status, COUNT(*) AS n FROM integration_log GROUP BY status
  `);
  const summary = (counts.results ?? counts ?? []).map((r: any) => `${r.status}=${r.n}`).join(' ');
  console.log(`[cron] integration retry: ${summary} | promoted_to_dead_letter=${stuck.length}`);
}

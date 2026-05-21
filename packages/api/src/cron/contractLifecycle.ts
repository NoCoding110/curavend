/**
 * Cron: daily lifecycle for contracts.
 *
 * Three things per run:
 *   1. APPROVED → ACTIVE  when startDate ≤ today
 *   2. ACTIVE   → EXPIRED when endDate   < today (and emit expired notification)
 *   3. Emit "expiring" notifications at 30/14/7 days before endDate (idempotent
 *      via the daily run — we don't dedupe across days; users will see a daily
 *      reminder for the last week, which is intentional)
 *
 * Notifications are routed via notifyContractEvent (CONTRACT redirect). Logs
 * one history row per transition so the contract detail page reflects automatic
 * state moves.
 */
import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { contracts, contractHistory } from '@curavend/db';
import { notifyContractEvent } from '../queues/contractNotifications';
import type { Env } from '../lib/env';

const SYSTEM_USER_ID = 'cron-contract-lifecycle';

export async function handleContractLifecycle(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. APPROVED → ACTIVE ────────────────────────────────────────────────
  const toActivate = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.status, 'APPROVED'), lte(contracts.startDate, today)));

  if (toActivate.length) {
    const ids = toActivate.map((r) => r.id);
    await db
      .update(contracts)
      .set({ status: 'ACTIVE', updatedAt: new Date().toISOString() })
      .where(inArray(contracts.id, ids));
    for (const id of ids) {
      try {
        await db.insert(contractHistory).values({
          contractId: id,
          description: 'Auto-activated by cron (start date reached)',
          changedByUserId: null,
        });
      } catch (e) {
        console.warn('[contract-cron] failed to insert history for activate', id, e);
      }
    }
  }

  // ── 2. ACTIVE → EXPIRED ────────────────────────────────────────────────
  const toExpire = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.status, 'ACTIVE'), lt(contracts.endDate, today)));

  if (toExpire.length) {
    const ids = toExpire.map((r) => r.id);
    await db
      .update(contracts)
      .set({ status: 'EXPIRED', updatedAt: new Date().toISOString() })
      .where(inArray(contracts.id, ids));
    for (const id of ids) {
      try {
        await db.insert(contractHistory).values({
          contractId: id,
          description: 'Auto-expired by cron (end date passed)',
          changedByUserId: null,
        });
        await notifyContractEvent(env, id, 'expired', SYSTEM_USER_ID);
      } catch (e) {
        console.warn('[contract-cron] failed to handle expire', id, e);
      }
    }
  }

  // ── 3. Expiring reminders (30/14/7 days out) ────────────────────────────
  const horizons = [30, 14, 7];
  for (const days of horizons) {
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + days);
    const targetDate = target.toISOString().slice(0, 10);

    const expiring = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(eq(contracts.status, 'ACTIVE'), eq(contracts.endDate, targetDate)));

    for (const row of expiring) {
      try {
        await notifyContractEvent(env, row.id, 'expiring', SYSTEM_USER_ID);
      } catch (e) {
        console.warn('[contract-cron] failed expiring notify', row.id, e);
      }
    }
  }

  console.log(
    `[cron] contract lifecycle: activated=${toActivate.length} expired=${toExpire.length}`,
  );
}

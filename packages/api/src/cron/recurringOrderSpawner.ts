/**
 * Cron: spawn child orders from active recurrence plans.
 *
 * Runs daily. For every ACTIVE plan whose `next_occurrence_date − leadTimeDays ≤ today`,
 * clone the template order's items + patient info into a fresh child order and
 * advance `nextOccurrenceDate` based on cadence.
 *
 * Idempotency: child orders are uniquely identifiable via
 *   `recurrence_plan_id = X AND recurrence_index = N`.
 * Before spawning occurrence N we check if a row with that pair already exists;
 * if so, skip (guards against double-cron-runs).
 *
 * Lifecycle transitions:
 *   - When `occurrencesSpawned >= totalOccurrences` → COMPLETED
 *   - When `nextOccurrenceDate > endDate` → COMPLETED
 *   - When `requireReauthEvery` boundary is hit → PAUSED + notification
 *   - When `pauseUntil` is in the past and status is PAUSED → ACTIVE (auto-resume)
 */
import { and, eq, sql, isNotNull, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orderRecurrencePlans,
  orders,
  orderItems,
  orderHistory,
} from '@curavend/db';
import { computeNextOccurrenceDate, type RecurrencePlanLike } from '../lib/recurrence';
import { mintOrderNumber } from '../lib/sequenceMinter';
import type { Env } from '../lib/env';

interface SpawnResult {
  considered: number;
  spawned: number;
  paused: number;
  completed: number;
  errors: number;
}

export async function handleRecurringOrderSpawner(env: Env): Promise<SpawnResult> {
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);
  const result: SpawnResult = { considered: 0, spawned: 0, paused: 0, completed: 0, errors: 0 };

  // ── Auto-resume paused plans whose pause window expired ─────────────────
  await db
    .update(orderRecurrencePlans)
    .set({ status: 'ACTIVE', pausedAt: null, pausedBy: null, pausedReason: null, pauseUntil: null, updatedAt: new Date().toISOString() })
    .where(and(eq(orderRecurrencePlans.status, 'PAUSED'), sql`${orderRecurrencePlans.pauseUntil} <= ${today}`));

  // ── Find ACTIVE plans due for spawning ──────────────────────────────────
  const due = await db
    .select()
    .from(orderRecurrencePlans)
    .where(
      and(
        eq(orderRecurrencePlans.status, 'ACTIVE'),
        isNotNull(orderRecurrencePlans.nextOccurrenceDate),
        // nextOccurrenceDate − leadTimeDays ≤ today
        sql`date(${orderRecurrencePlans.nextOccurrenceDate}, '-' || ${orderRecurrencePlans.leadTimeDays} || ' days') <= ${today}`,
      ),
    );

  for (const plan of due) {
    result.considered++;
    try {
      const occurrenceIndex = plan.occurrencesSpawned + 1;

      // Idempotency: skip if a child for this (plan, index) already exists.
      // This is the first-line defense; the DB-level partial UNIQUE index
      // on orders(recurrence_plan_id, recurrence_index) is the second
      // (catches races between this SELECT and the INSERT below).
      const existing = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.recurrencePlanId, plan.id), eq(orders.recurrenceIndex, occurrenceIndex)))
        .limit(1);
      if (existing.length) continue;

      // Load template order
      const templateRows = await db.select().from(orders).where(eq(orders.id, plan.parentOrderId)).limit(1);
      if (!templateRows.length) {
        console.warn(`[recurrence-cron] plan ${plan.id} template order ${plan.parentOrderId} not found`);
        result.errors++;
        continue;
      }
      const template = templateRows[0];

      // Mint a fresh order number
      const childIdentifier = await mintOrderNumber(env.DB, plan.hospitalId);
      const childId = crypto.randomUUID();
      const now = new Date().toISOString();

      try {
      await db.insert(orders).values({
        id: childId,
        identifier: childIdentifier,
        status: plan.vendorId ? 'IN_PROGRESS' : 'PENDING',
        orderSubStatus: plan.vendorId ? 'VENDOR_ASSIGNED' : 'NEW_ORDER',
        hospitalId: plan.hospitalId,
        vendorId: plan.vendorId,
        providerId: template.providerId,
        superVendorId: template.superVendorId,
        patientId: template.patientId,
        patientName: template.patientName,
        patientLastName: template.patientLastName,
        patientEmail: template.patientEmail,
        patientPhone: template.patientPhone,
        patientAddress: template.patientAddress,
        patientGender: template.patientGender,
        patientBirthDate: template.patientBirthDate,
        diagnosis: template.diagnosis,
        icd10: template.icd10,
        extremity: template.extremity,
        facility: template.facility,
        facilityNumber: template.facilityNumber,
        facilityId: template.facilityId,
        department: template.department,
        departmentNumber: template.departmentNumber,
        departmentId: template.departmentId,
        physicianId: template.physicianId,
        insurance: template.insurance,
        insuranceId: template.insuranceId,
        authProvider: template.authProvider,
        refProvider: template.refProvider,
        signDateTime: now,
        priority: template.priority,
        comment: `Auto-spawned occurrence #${occurrenceIndex} from recurrence plan ${plan.id.slice(0, 8)}`,
        recurrencePlanId: plan.id,
        recurrenceIndex: occurrenceIndex,
        orderSubStatusHistory: JSON.stringify([
          { status: 'NEW_ORDER', timestamp: now, source: 'RECURRENCE_CRON' },
          ...(plan.vendorId ? [{ status: 'VENDOR_ASSIGNED', timestamp: now, source: 'RECURRENCE_CRON' }] : []),
        ]),
        createdAt: now,
        updatedAt: now,
      });

      // Clone order items from template
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, plan.parentOrderId));
      for (const item of items) {
        await db.insert(orderItems).values({
          orderId: childId,
          code: item.code,
          quantity: item.quantity,
          description: item.description,
          priceSource: item.priceSource,
          contractId: item.contractId,
        });
      }

      } catch (insertErr: any) {
        // The partial UNIQUE index on orders(recurrence_plan_id, recurrence_index)
        // will reject a duplicate spawn even if a concurrent cron run beat us
        // past the SELECT check above. Treat this as a benign no-op.
        const msg = String(insertErr?.message ?? insertErr);
        if (msg.includes('UNIQUE') || msg.includes('constraint failed')) {
          console.log(`[recurrence-cron] plan ${plan.id} occurrence #${occurrenceIndex} already spawned (UNIQUE race) — skipping`);
          continue;
        }
        throw insertErr;
      }

      await db.insert(orderHistory).values({
        orderId: childId,
        description: `Auto-spawned occurrence #${occurrenceIndex} from recurrence plan ${plan.id.slice(0, 8)}`,
        changedByUserId: null,
      });

      // Enqueue order.created event for downstream notifications
      try {
        await env.EVENTS_QUEUE.send({ type: 'order.created', payload: { orderId: childId, fromRecurrence: true } });
      } catch (err) {
        console.warn('[recurrence-cron] enqueue failed:', err);
      }

      // ── Advance plan state ────────────────────────────────────────────
      const planLike: RecurrencePlanLike = {
        frequencyUnit: plan.frequencyUnit,
        frequencyValue: plan.frequencyValue,
        anchorDay: plan.anchorDay,
        startDate: plan.startDate,
        endDate: plan.endDate,
        totalOccurrences: plan.totalOccurrences,
        skipDates: plan.skipDates,
        occurrencesSpawned: plan.occurrencesSpawned + 1,
      };

      let nextDate: string | null = computeNextOccurrenceDate(planLike, plan.nextOccurrenceDate!);
      let nextStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED' = 'ACTIVE';
      let pausedReason: string | null = null;

      // Reauth gate
      if (
        plan.requireReauthEvery &&
        plan.requireReauthEvery > 0 &&
        occurrenceIndex % plan.requireReauthEvery === 0
      ) {
        nextStatus = 'PAUSED';
        pausedReason = 'INSURANCE_REAUTH_REQUIRED';
        result.paused++;
      }

      // Total occurrences cap
      if (plan.totalOccurrences != null && occurrenceIndex >= plan.totalOccurrences) {
        nextStatus = 'COMPLETED';
        nextDate = null;
        result.completed++;
      } else if (!nextDate) {
        nextStatus = 'COMPLETED';
        result.completed++;
      }

      await db
        .update(orderRecurrencePlans)
        .set({
          status: nextStatus,
          nextOccurrenceDate: nextDate,
          occurrencesSpawned: occurrenceIndex,
          pausedAt: nextStatus === 'PAUSED' ? now : null,
          pausedReason: nextStatus === 'PAUSED' ? pausedReason : null,
          updatedAt: now,
        })
        .where(eq(orderRecurrencePlans.id, plan.id));

      result.spawned++;
    } catch (err) {
      console.error(`[recurrence-cron] failed to spawn for plan ${plan.id}:`, err);
      result.errors++;
    }
  }

  console.log(
    `[cron] recurrence: considered=${result.considered} spawned=${result.spawned} paused=${result.paused} completed=${result.completed} errors=${result.errors}`,
  );
  return result;
}

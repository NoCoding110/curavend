/**
 * Cron: daily at 08:00 UTC.
 *
 * Order SLA breach monitor. Runs 5 aging checks and emails the procurement
 * team / lab admins one summary email per (tenant × event) so a hospital
 * with 10 stalled orders gets one email with 10 rows — not 10 emails.
 *
 * Each check is independent: a failure in one query does not block the
 * others (Medzah's labcorp_order_alerts has the opposite anti-pattern —
 * one failure kills the whole run).
 *
 * Dedup: each (event, orderId) is suppressed for 30 minutes after a SENT
 * delivery log row. The 08:00 UTC daily schedule means a persisting breach
 * gets a once-a-day reminder (24 h > 30 min window).
 */
import { eq, and, inArray, lt, isNull, sql } from 'drizzle-orm';
import {
  orders,
  orderShipments,
  labOrders,
  workflowInstances,
} from '@curavend/db';
import { getDb } from '../lib/db';
import {
  dispatchCustomerEvent,
  recentlyDispatched,
  type ResolvedRecipient,
} from '../services/notificationRouter';
import { slaBreachTemplate, type SlaBreachRow } from '../services/emailService';
import type { Env } from '../lib/env';

const APPROVAL_SLA_HOURS = 48;
const STALLED_SLA_HOURS = 48;
const NO_SHIPMENT_SLA_HOURS = 24;
const LAB_APPROVAL_SLA_HOURS = 48;
const LAB_WORKFLOW_FAILED_SLA_HOURS = 1;
const DEDUP_WINDOW_MIN = 30;
const MAX_ROWS_PER_EVENT = 500;

export interface SlaRunReport {
  approvalSla: number;
  stalledSla: number;
  noShipmentSla: number;
  labApprovalSla: number;
  labWorkflowFailed: number;
  errors: string[];
}

function isoHoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function ageHours(timestamp: string): number {
  return (Date.now() - new Date(timestamp).getTime()) / 3_600_000;
}

/** Group an array of breaches by a key — used to build one email per tenant. */
function groupBy<T>(rows: T[], keyFn: (r: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

// ─── Check 1: Awaiting approval > 48 h ─────────────────────────────────────

async function checkApprovalSla(env: Env): Promise<number> {
  const db = getDb(env.DB);
  const cutoff = isoHoursAgo(APPROVAL_SLA_HOURS);
  const breached = await db
    .select({
      id: orders.id,
      identifier: orders.identifier,
      hospitalId: orders.hospitalId,
      patientName: orders.patientName,
      patientLastName: orders.patientLastName,
      orderSubStatus: orders.orderSubStatus,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'PENDING'),
        inArray(orders.orderSubStatus, ['NEW_ORDER', 'ORDER_REQUESTED_FOR_MODIFY']),
        lt(orders.createdAt, cutoff),
      ),
    )
    .limit(MAX_ROWS_PER_EVENT);

  return await emailGroupedBreaches(env, breached, {
    eventType: 'ORDER_AWAITING_APPROVAL_SLA',
    breachLabel: `Orders awaiting approval > ${APPROVAL_SLA_HOURS} h`,
    detailColumnLabel: 'Substatus',
    toRow: (o) => ({
      identifier: o.identifier ?? o.id.slice(0, 8),
      patient: [o.patientName, o.patientLastName].filter(Boolean).join(' ') || null,
      detail: o.orderSubStatus,
      ageHours: ageHours(o.createdAt),
    }),
    relatedEntityId: (o) => o.id,
    groupKey: (o) => o.hospitalId,
  });
}

// ─── Check 2: Fulfillment stalled > 48 h ──────────────────────────────────

async function checkStalledSla(env: Env): Promise<number> {
  const db = getDb(env.DB);
  const cutoff = isoHoursAgo(STALLED_SLA_HOURS);
  const breached = await db
    .select({
      id: orders.id,
      identifier: orders.identifier,
      hospitalId: orders.hospitalId,
      patientName: orders.patientName,
      patientLastName: orders.patientLastName,
      orderSubStatus: orders.orderSubStatus,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'IN_PROGRESS'),
        inArray(orders.orderSubStatus, [
          'VENDOR_CONFIRMED_RECEIPT',
          'PATIENT_VISITED_AND_ASSESSED',
        ]),
        lt(orders.updatedAt, cutoff),
      ),
    )
    .limit(MAX_ROWS_PER_EVENT);

  return await emailGroupedBreaches(env, breached, {
    eventType: 'ORDER_FULFILLMENT_STALLED_SLA',
    breachLabel: `Orders stalled in fulfillment > ${STALLED_SLA_HOURS} h`,
    detailColumnLabel: 'Stuck at',
    toRow: (o) => ({
      identifier: o.identifier ?? o.id.slice(0, 8),
      patient: [o.patientName, o.patientLastName].filter(Boolean).join(' ') || null,
      detail: o.orderSubStatus,
      ageHours: ageHours(o.updatedAt),
    }),
    relatedEntityId: (o) => o.id,
    groupKey: (o) => o.hospitalId,
  });
}

// ─── Check 3: No shipment > 24 h after vendor confirmation ───────────────

async function checkNoShipmentSla(env: Env): Promise<number> {
  const db = getDb(env.DB);
  const cutoff = isoHoursAgo(NO_SHIPMENT_SLA_HOURS);
  // LEFT JOIN; filter where no shipment row exists for this order
  const breached = await db
    .select({
      id: orders.id,
      identifier: orders.identifier,
      hospitalId: orders.hospitalId,
      patientName: orders.patientName,
      patientLastName: orders.patientLastName,
      orderSubStatus: orders.orderSubStatus,
      updatedAt: orders.updatedAt,
      shipmentId: orderShipments.id,
    })
    .from(orders)
    .leftJoin(orderShipments, eq(orderShipments.orderId, orders.id))
    .where(
      and(
        inArray(orders.orderSubStatus, ['VENDOR_ASSIGNED', 'VENDOR_CONFIRMED_RECEIPT']),
        lt(orders.updatedAt, cutoff),
        isNull(orderShipments.id),
      ),
    )
    .limit(MAX_ROWS_PER_EVENT);

  return await emailGroupedBreaches(env, breached, {
    eventType: 'ORDER_NO_SHIPMENT_SLA',
    breachLabel: `Orders with no shipment > ${NO_SHIPMENT_SLA_HOURS} h`,
    detailColumnLabel: 'Substatus',
    toRow: (o) => ({
      identifier: o.identifier ?? o.id.slice(0, 8),
      patient: [o.patientName, o.patientLastName].filter(Boolean).join(' ') || null,
      detail: o.orderSubStatus,
      ageHours: ageHours(o.updatedAt),
    }),
    relatedEntityId: (o) => o.id,
    groupKey: (o) => o.hospitalId,
  });
}

// ─── Check 4: Lab order READY_FOR_APPROVAL > 48 h ────────────────────────

async function checkLabApprovalSla(env: Env): Promise<number> {
  const db = getDb(env.DB);
  const cutoff = isoHoursAgo(LAB_APPROVAL_SLA_HOURS);
  const breached = await db
    .select({
      id: labOrders.id,
      orderNumber: labOrders.orderNumber,
      labGroupId: labOrders.labGroupId,
      patientName: labOrders.patientName,
      patientLastName: labOrders.patientLastName,
      status: labOrders.status,
      updatedAt: labOrders.updatedAt,
    })
    .from(labOrders)
    .where(
      and(
        eq(labOrders.status, 'READY_FOR_APPROVAL'),
        lt(labOrders.updatedAt, cutoff),
      ),
    )
    .limit(MAX_ROWS_PER_EVENT);

  return await emailGroupedBreaches(env, breached, {
    eventType: 'LAB_ORDER_APPROVAL_OVERDUE',
    breachLabel: `Lab orders awaiting approval > ${LAB_APPROVAL_SLA_HOURS} h`,
    detailColumnLabel: 'Status',
    toRow: (o) => ({
      identifier: o.orderNumber,
      patient: [o.patientName, o.patientLastName].filter(Boolean).join(' ') || null,
      detail: o.status,
      ageHours: ageHours(o.updatedAt),
    }),
    relatedEntityId: (o) => o.id,
    groupKey: (o) => o.labGroupId,
    relatedEntityType: 'LAB_ORDER',
    isLab: true,
  });
}

// ─── Check 5: Lab workflow FAILED > 1 h ──────────────────────────────────

async function checkLabWorkflowFailed(env: Env): Promise<number> {
  const db = getDb(env.DB);
  const cutoff = isoHoursAgo(LAB_WORKFLOW_FAILED_SLA_HOURS);

  // Join workflow_instances → lab_orders to get tenant grouping
  const breached = await db
    .select({
      id: labOrders.id,
      orderNumber: labOrders.orderNumber,
      labGroupId: labOrders.labGroupId,
      patientName: labOrders.patientName,
      patientLastName: labOrders.patientLastName,
      wfErrorMessage: workflowInstances.errorMessage,
      wfUpdatedAt: workflowInstances.updatedAt,
    })
    .from(workflowInstances)
    .innerJoin(labOrders, eq(workflowInstances.entityId, labOrders.id))
    .where(
      and(
        eq(workflowInstances.workflowType, 'LAB_ORDER_ASSET_GEN'),
        eq(workflowInstances.entityType, 'lab_order'),
        eq(workflowInstances.status, 'FAILED'),
        lt(workflowInstances.updatedAt, cutoff),
      ),
    )
    .limit(MAX_ROWS_PER_EVENT);

  return await emailGroupedBreaches(env, breached, {
    eventType: 'LAB_ORDER_WORKFLOW_FAILED',
    breachLabel: `Lab asset-generation workflow failed > ${LAB_WORKFLOW_FAILED_SLA_HOURS} h`,
    detailColumnLabel: 'Error',
    toRow: (o) => ({
      identifier: o.orderNumber,
      patient: [o.patientName, o.patientLastName].filter(Boolean).join(' ') || null,
      detail: (o.wfErrorMessage ?? 'workflow failure').slice(0, 80),
      ageHours: ageHours(o.wfUpdatedAt),
    }),
    relatedEntityId: (o) => o.id,
    groupKey: (o) => o.labGroupId,
    relatedEntityType: 'LAB_ORDER',
    isLab: true,
  });
}

// ─── Shared dispatcher ────────────────────────────────────────────────────

async function emailGroupedBreaches<T>(
  env: Env,
  breached: T[],
  opts: {
    eventType:
      | 'ORDER_AWAITING_APPROVAL_SLA'
      | 'ORDER_FULFILLMENT_STALLED_SLA'
      | 'ORDER_NO_SHIPMENT_SLA'
      | 'LAB_ORDER_APPROVAL_OVERDUE'
      | 'LAB_ORDER_WORKFLOW_FAILED';
    breachLabel: string;
    detailColumnLabel: string;
    toRow: (r: T) => SlaBreachRow;
    relatedEntityId: (r: T) => string;
    groupKey: (r: T) => string | null;
    relatedEntityType?: string; // default ORDER
    isLab?: boolean;
  },
): Promise<number> {
  if (breached.length === 0) return 0;
  const relatedEntityType = opts.relatedEntityType ?? 'ORDER';

  // Dedup at the per-entity level using notification_delivery_log
  const fresh: T[] = [];
  for (const row of breached) {
    const id = opts.relatedEntityId(row);
    const seen = await recentlyDispatched(env, {
      eventType: opts.eventType,
      relatedEntityType,
      relatedEntityId: id,
      withinMinutes: DEDUP_WINDOW_MIN,
    });
    if (seen) {
      console.log(`[sla-monitor] dedup skip ${opts.eventType} ${id}`);
      continue;
    }
    fresh.push(row);
  }
  if (fresh.length === 0) return 0;

  // Group by tenant (hospital or lab group) → one email per tenant per event
  const groups = groupBy(fresh, opts.groupKey);
  let totalEmailed = 0;

  for (const [tenantId, rows] of groups) {
    const reportRows: SlaBreachRow[] = rows.map(opts.toRow);
    const html = slaBreachTemplate(opts.breachLabel, reportRows, opts.detailColumnLabel);
    const subject = `⚠️ ${rows.length} order(s) breached SLA: ${opts.breachLabel}`;

    // One delivery-log row per (tenant × event) — we tag it with the FIRST
    // breached order id so the entity-level dedup works. We then log each
    // additional order id as a no-op SENT row so subsequent runs dedup
    // each entity individually.
    const dispatchArgs: Parameters<typeof dispatchCustomerEvent>[1] = opts.isLab
      ? {
          eventType: opts.eventType,
          labGroupId: tenantId,
          labOrderId: opts.relatedEntityId(rows[0]),
          subject,
          htmlBuilder: () => html,
        }
      : {
          eventType: opts.eventType,
          hospitalId: tenantId,
          orderId: opts.relatedEntityId(rows[0]),
          subject,
          htmlBuilder: () => html,
        };
    const result = await dispatchCustomerEvent(env, dispatchArgs);
    totalEmailed += result.sent;

    // For multi-order summaries, also log per-entity SENT rows so each
    // entity's dedup is independent (otherwise a 10-order email only dedups
    // the first order's id and the other 9 would re-fire on next run).
    if (result.sent > 0 && rows.length > 1) {
      const db = getDb(env.DB);
      const now = new Date().toISOString();
      const extra = rows.slice(1).map((r) => ({
        eventType: opts.eventType,
        channel: 'EMAIL',
        recipientType: 'PROCUREMENT_TEAM',
        recipientAddress: 'group-summary',
        deliveryStatus: 'SENT',
        statusReason: `bundled with order ${opts.relatedEntityId(rows[0])}`,
        relatedEntityType,
        relatedEntityId: opts.relatedEntityId(r),
        sentAt: now,
      }));
      try {
        // Drizzle bulk insert
        const { notificationDeliveryLog } = await import('@curavend/db');
        await db.insert(notificationDeliveryLog).values(extra as any);
      } catch (err) {
        console.warn('[sla-monitor] failed to log bundled entities:', err);
      }
    }
  }
  return totalEmailed;
}

// ─── Public entry point ──────────────────────────────────────────────────

export async function handleOrderSlaMonitor(env: Env): Promise<SlaRunReport> {
  const report: SlaRunReport = {
    approvalSla: 0,
    stalledSla: 0,
    noShipmentSla: 0,
    labApprovalSla: 0,
    labWorkflowFailed: 0,
    errors: [],
  };
  console.log('[sla-monitor] run start');
  // Each check is wrapped so a failure in one query doesn't kill the others
  try {
    report.approvalSla = await checkApprovalSla(env);
  } catch (err: any) {
    report.errors.push(`approvalSla: ${err?.message ?? err}`);
    console.error('[sla-monitor] approvalSla failed:', err);
  }
  try {
    report.stalledSla = await checkStalledSla(env);
  } catch (err: any) {
    report.errors.push(`stalledSla: ${err?.message ?? err}`);
    console.error('[sla-monitor] stalledSla failed:', err);
  }
  try {
    report.noShipmentSla = await checkNoShipmentSla(env);
  } catch (err: any) {
    report.errors.push(`noShipmentSla: ${err?.message ?? err}`);
    console.error('[sla-monitor] noShipmentSla failed:', err);
  }
  try {
    report.labApprovalSla = await checkLabApprovalSla(env);
  } catch (err: any) {
    report.errors.push(`labApprovalSla: ${err?.message ?? err}`);
    console.error('[sla-monitor] labApprovalSla failed:', err);
  }
  try {
    report.labWorkflowFailed = await checkLabWorkflowFailed(env);
  } catch (err: any) {
    report.errors.push(`labWorkflowFailed: ${err?.message ?? err}`);
    console.error('[sla-monitor] labWorkflowFailed failed:', err);
  }
  console.log('[sla-monitor] run complete', report);
  return report;
}

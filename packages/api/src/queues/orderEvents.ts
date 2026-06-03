/**
 * Queue handlers for order.* events.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { rooms } from '@curavend/db';
import { getOrderById, notifyHospitalUsers, notifyVendorUsers } from './notificationHelpers';
import { pushOrderToErp } from '../jobs/pushOrderToErp';
import { dispatchCustomerEvent } from '../services/notificationRouter';
import { orderConfirmationTemplate, orderShippedTemplate, orderDeliveredTemplate } from '../services/customerEmailTemplates';
import { orders, orderItems, orderShipments, hospitals as hospitalsTbl, vendors as vendorsTbl } from '@curavend/db';
import type { Env } from '../lib/env';

export async function handleOrderCreated(env: Env, payload: { orderId: string }) {
  const order = await getOrderById(env, payload.orderId);
  if (!order) return;

  // Notify hospital (internal) that order was recorded
  if (order.hospitalId) {
    await notifyHospitalUsers(
      env,
      order.hospitalId,
      `New order ${order.identifier} created`,
      'ORDER',
      order.id,
    );
  }

  // If vendor already assigned at creation, notify vendor too
  if (order.vendorId) {
    await notifyVendorUsers(
      env,
      order.vendorId,
      `New order ${order.identifier} assigned to you`,
      'ORDER',
      order.id,
      `Curavend: New order ${order.identifier}`,
      `<p>A new order <strong>${order.identifier}</strong> has been assigned to your vendor account. Please review it in Curavend.</p>`,
    );
  }

  // ── Customer-facing order confirmation email ──────────────────────
  try {
    const db = getDb(env.DB);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const hospRow = order.hospitalId
      ? await db.select({ name: hospitalsTbl.name }).from(hospitalsTbl).where(eq(hospitalsTbl.id, order.hospitalId)).limit(1)
      : [];
    const vendRow = order.vendorId
      ? await db.select({ name: vendorsTbl.name }).from(vendorsTbl).where(eq(vendorsTbl.id, order.vendorId)).limit(1)
      : [];
    await dispatchCustomerEvent(env, {
      eventType: 'ORDER_CONFIRMATION',
      orderId: order.id,
      hospitalId: order.hospitalId ?? undefined,
      vendorId: order.vendorId ?? undefined,
      subject: `Curavend: Order ${order.identifier} confirmed`,
      htmlBuilder: () => orderConfirmationTemplate({
        order: {
          identifier: order.identifier,
          patientName: order.patientName,
          patientLastName: order.patientLastName,
          hospitalName: hospRow[0]?.name ?? null,
          vendorName: vendRow[0]?.name ?? null,
        },
        items: items.map((it) => ({ code: it.code, description: it.description, quantity: it.quantity })),
        unsubscribeUrl: null,
      }),
    });
  } catch (err) {
    console.warn('[orderEvents] customer order confirmation email failed:', err);
  }
}

/** Fired when tracking is set on an order. Sends shipped email to patient + contact. */
export async function handleOrderShipped(env: Env, payload: { orderId: string }) {
  try {
    const db = getDb(env.DB);
    const orderRow = await db.select().from(orders).where(eq(orders.id, payload.orderId)).limit(1);
    if (!orderRow.length) return;
    const order = orderRow[0];

    const shipmentRow = await db
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.orderId, order.id))
      .orderBy(orderShipments.shipmentSequence)
      .limit(1);
    const shipment = shipmentRow[0] ?? null;

    const vendRow = order.vendorId
      ? await db.select({ name: vendorsTbl.name, trackingUrlTemplate: vendorsTbl.trackingUrlTemplate }).from(vendorsTbl).where(eq(vendorsTbl.id, order.vendorId)).limit(1)
      : [];
    const hospRow = order.hospitalId
      ? await db.select({ name: hospitalsTbl.name }).from(hospitalsTbl).where(eq(hospitalsTbl.id, order.hospitalId)).limit(1)
      : [];

    await dispatchCustomerEvent(env, {
      eventType: 'ORDER_SHIPPED',
      orderId: order.id,
      hospitalId: order.hospitalId ?? undefined,
      vendorId: order.vendorId ?? undefined,
      subject: `Curavend: Order ${order.identifier} has shipped`,
      htmlBuilder: () => orderShippedTemplate({
        order: {
          identifier: order.identifier,
          patientName: order.patientName,
          patientLastName: order.patientLastName,
          hospitalName: hospRow[0]?.name ?? null,
          vendorName: vendRow[0]?.name ?? null,
        },
        carrierCode: shipment?.carrierCode ?? null,
        trackingNumber: shipment?.trackingNumber ?? null,
        vendorTrackingTemplate: vendRow[0]?.trackingUrlTemplate ?? null,
        shipmentDate: shipment?.shipmentDate ?? null,
        expectedDeliveryDate: shipment?.expectedDeliveryDate ?? null,
        unsubscribeUrl: null,
      }),
    });
  } catch (err) {
    console.warn('[orderEvents] order.shipped email failed:', err);
  }
}

/** Fired when an order's substatus transitions to DELIVERED. */
export async function handleOrderDelivered(env: Env, payload: { orderId: string }) {
  try {
    const db = getDb(env.DB);
    const orderRow = await db.select().from(orders).where(eq(orders.id, payload.orderId)).limit(1);
    if (!orderRow.length) return;
    const order = orderRow[0];

    const shipmentRow = await db
      .select({ podAttachment: orderShipments.podAttachment, actualDeliveryDate: orderShipments.actualDeliveryDate })
      .from(orderShipments)
      .where(eq(orderShipments.orderId, order.id))
      .orderBy(orderShipments.shipmentSequence)
      .limit(1);

    await dispatchCustomerEvent(env, {
      eventType: 'ORDER_DELIVERED',
      orderId: order.id,
      hospitalId: order.hospitalId ?? undefined,
      vendorId: order.vendorId ?? undefined,
      subject: `Curavend: Order ${order.identifier} delivered`,
      htmlBuilder: () => orderDeliveredTemplate({
        order: {
          identifier: order.identifier,
          patientName: order.patientName,
          patientLastName: order.patientLastName,
        },
        podUrl: shipmentRow[0]?.podAttachment ?? order.deliverySignAttachment ?? null,
        deliveredAt: shipmentRow[0]?.actualDeliveryDate ?? order.deliveryDateTime ?? null,
        unsubscribeUrl: null,
      }),
    });
  } catch (err) {
    console.warn('[orderEvents] order.delivered email failed:', err);
  }
}

export async function handleOrderStatusChanged(
  env: Env,
  payload: {
    orderId: string;
    newStatus: string;
    newSubStatus: string;
    oldStatus: string;
    changedByUserId: string;
  },
) {
  const order = await getOrderById(env, payload.orderId);
  if (!order) return;

  const { newSubStatus } = payload;

  const statusMessages: Record<string, string> = {
    VENDOR_ASSIGNED: `Order ${order.identifier} has been assigned to your account`,
    VENDOR_CONFIRMED: `Vendor confirmed receipt for order ${order.identifier}`,
    VENDOR_CONFIRMED_RECEIPT: `Vendor confirmed receipt for order ${order.identifier}`,
    VENDOR_DECLINED: `Vendor declined order ${order.identifier}`,
    DISPENSED: `Order ${order.identifier} has been dispensed`,
    FACILITY_CANCELLED: `Order ${order.identifier} was cancelled`,
    CANCELLED: `Order ${order.identifier} was cancelled`,
    ORDER_REQUESTED_FOR_MODIFY: `Modification requested for order ${order.identifier}`,
    PATIENT_VISITED_AND_ASSESSED: `Patient visit complete for order ${order.identifier}`,
    DELIVERED: `Order ${order.identifier} has been delivered`,
    SPEND_CONFIRMED: `Spend confirmed for order ${order.identifier}`,
    PROOF_UPLOADED: `Proof of delivery uploaded for order ${order.identifier}`,
    ORDER_COMPLETED: `Order ${order.identifier} is complete`,
    COMPLETED: `Order ${order.identifier} is complete`,
  };
  const msg = statusMessages[newSubStatus] ?? `Order ${order.identifier} status updated to ${newSubStatus}`;

  // Vendor-triggered transitions → notify hospital
  const vendorTriggered = [
    'VENDOR_CONFIRMED',
    'VENDOR_CONFIRMED_RECEIPT',
    'VENDOR_DECLINED',
    'DISPENSED',
    'ORDER_REQUESTED_FOR_MODIFY',
    'PATIENT_VISITED_AND_ASSESSED',
    'DELIVERED',
    'PROOF_UPLOADED',
    'ORDER_COMPLETED',
    'COMPLETED',
  ].includes(newSubStatus);

  // Hospital-triggered transitions → notify vendor
  const hospitalTriggered = ['VENDOR_ASSIGNED', 'FACILITY_CANCELLED', 'CANCELLED', 'SPEND_CONFIRMED'].includes(newSubStatus);

  if (vendorTriggered && order.hospitalId) {
    await notifyHospitalUsers(env, order.hospitalId, msg, 'ORDER', order.id);
  }
  if (hospitalTriggered && order.vendorId) {
    await notifyVendorUsers(env, order.vendorId, msg, 'ORDER', order.id);
  }

  // Auto-create chat room when vendor is assigned (if one doesn't exist yet)
  if (newSubStatus === 'VENDOR_ASSIGNED' && order.hospitalId && order.vendorId) {
    try {
      const db = getDb(env.DB);
      const existing = await db.select().from(rooms).where(eq(rooms.orderId, order.id)).limit(1);
      if (!existing.length) {
        const now = new Date().toISOString();
        await db.insert(rooms).values({
          id: crypto.randomUUID(),
          orderId: order.id,
          hospitalId: order.hospitalId,
          vendorId: order.vendorId,
          hospitalUnreadCount: 0,
          vendorUnreadCount: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
    } catch (err) {
      console.error('[orderEvents] Failed to auto-create chat room:', err);
    }
  }

  // ORDER_COMPLETED → emit invoice.created (handled by invoiceEvents)
  if (newSubStatus === 'ORDER_COMPLETED' && order.invoiceId) {
    try {
      await env.EVENTS_QUEUE.send({
        type: 'invoice.created',
        payload: { invoiceId: order.invoiceId, orderId: order.id },
      });
    } catch { /* empty */ }
  }

  // Gap 3 — Epic write-back on ORDER_COMPLETED
  if (newSubStatus === 'ORDER_COMPLETED') {
    try {
      await triggerEhrWriteBack(env, order);
    } catch (err) {
      console.error('[orderEvents] EHR write-back handler crashed:', err);
    }
  }

  // Phase E — fire ERP push for any vendor connector whose trigger_event
  // matches the new substatus. Failures isolated; one bad endpoint never
  // stalls the queue (each connector has its own retry/log lifecycle).
  try {
    const pushResults = await pushOrderToErp(env, {
      orderId: order.id,
      triggerEvent: newSubStatus,
    });
    if (pushResults.length) {
      const failed = pushResults.filter((r) => r.finalStatus === 'FAILED');
      if (failed.length) {
        console.warn(
          `[orderEvents] ${failed.length}/${pushResults.length} ERP pushes failed for order ${order.id}`,
        );
      }
    }
  } catch (err) {
    console.error('[orderEvents] ERP push handler crashed:', err);
  }
}

/**
 * Gap 3 — Trigger Epic FHIR write-back on ORDER_COMPLETED.
 * Opt-in: does nothing when epicConnectionId or fhirPatientId is absent.
 * All write attempts are logged to ehr_write_log (idempotent via INSERT OR IGNORE).
 */
async function triggerEhrWriteBack(env: any, order: any): Promise<void> {
  const epicConnectionId: string | null = order.epicConnectionId ?? order.epic_connection_id ?? null;
  const fhirPatientId: string | null = order.fhirPatientId ?? order.fhir_patient_id ?? null;
  if (!epicConnectionId || !fhirPatientId) return;

  const now = new Date().toISOString();
  const db = getDb(env.DB);

  async function writeLog(params: {
    resourceType: string;
    idempotencyKey: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    fhirId?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      await db.run(sql`
        INSERT OR IGNORE INTO ehr_write_log
          (id, order_id, connection_id, resource_type, idempotency_key, fhir_id, status, error_message, created_at)
        VALUES
          (${crypto.randomUUID()}, ${order.id}, ${epicConnectionId}, ${params.resourceType},
           ${params.idempotencyKey}, ${params.fhirId ?? null}, ${params.status},
           ${params.errorMessage ?? null}, ${now})
      `);
    } catch { /* log write failure non-fatal */ }
  }

  if (!env.FERNET_KEY) {
    await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'SKIPPED', errorMessage: 'FERNET_KEY not configured' });
    return;
  }

  let conn: any;
  try {
    const { loadConnection } = await import('../services/connectionRegistry');
    conn = await loadConnection(env, epicConnectionId);
    if (!conn) {
      await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'SKIPPED', errorMessage: 'EHR connection not found' });
      return;
    }
  } catch (err: any) {
    await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'SKIPPED', errorMessage: `loadConnection error: ${err?.message}` });
    return;
  }

  // DocumentReference write-back
  try {
    const { buildDwoPdf } = await import('../services/orderDocumentBuilder');
    const pdfBytes = await buildDwoPdf(env, order.id);
    if (pdfBytes) {
      // Try documentReference fhir service
      try {
        const fhirDocRef = await import('../services/fhir/documentReference') as any;
        const createFn = fhirDocRef.createDocumentReference ?? fhirDocRef.default?.createDocumentReference;
        if (typeof createFn === 'function') {
          const result = await createFn(env, conn, {
            patientId: fhirPatientId,
            loincCode: '57133-1',
            title: `Supply Order DWO - ${order.id}`,
            pdfBytes,
            idempotencyKey: `order-${order.id}-dwo-v1`,
          });
          await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'SUCCESS', fhirId: (result as any)?.id });
        } else {
          await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'SKIPPED', errorMessage: 'createDocumentReference not available' });
        }
      } catch (err: any) {
        await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'FAILED', errorMessage: err?.message ?? String(err) });
      }
    } else {
      await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'SKIPPED', errorMessage: 'PDF not available (non-DME order or render failed)' });
    }
  } catch (err: any) {
    await writeLog({ resourceType: 'DocumentReference', idempotencyKey: `order-${order.id}-dwo-v1`, status: 'FAILED', errorMessage: err?.message ?? String(err) });
  }

  // Procedure write-back per order item (requires fhir_encounter_id from Gap 2 sidecar table)
  // The orders table is at D1's ALTER TABLE column limit; fhir_encounter_id lives in order_approval_meta.
  let fhirEncounterId: string | null = order.fhirEncounterId ?? order.fhir_encounter_id ?? null;
  if (!fhirEncounterId) {
    try {
      const metaRow: any = await db.run(sql`SELECT fhir_encounter_id FROM order_approval_meta WHERE order_id = ${order.id} LIMIT 1`);
      fhirEncounterId = metaRow?.results?.[0]?.fhir_encounter_id ?? metaRow?.[0]?.fhir_encounter_id ?? null;
    } catch { /* non-fatal */ }
  }
  if (fhirEncounterId && conn?.mappingProfile?.procedureWriteEnabled) {
    const itemsRaw: any = await db.run(sql`SELECT id, hcpc_code, quantity FROM order_items WHERE order_id = ${order.id}`);
    const items: any[] = itemsRaw?.results ?? (Array.isArray(itemsRaw) ? itemsRaw : []);
    for (const item of items) {
      const idemKey = `order-${order.id}-item-${item.id}`;
      try {
        const fhirProc = await import('../services/fhir/procedure') as any;
        const createProcedureFn = fhirProc.createProcedure ?? fhirProc.default?.createProcedure;
        if (typeof createProcedureFn === 'function') {
          const result = await createProcedureFn(env, conn, {
            patientId: fhirPatientId,
            encounterId: fhirEncounterId,
            hcpcCode: item.hcpc_code,
            performedDateTime: order.updatedAt ?? now,
            quantity: item.quantity ?? 1,
            idempotencyKey: idemKey,
          });
          await writeLog({ resourceType: 'Procedure', idempotencyKey: idemKey, status: 'SUCCESS', fhirId: (result as any)?.id });
        } else {
          await writeLog({ resourceType: 'Procedure', idempotencyKey: idemKey, status: 'SKIPPED', errorMessage: 'createProcedure not available' });
        }
      } catch (err: any) {
        await writeLog({ resourceType: 'Procedure', idempotencyKey: idemKey, status: 'FAILED', errorMessage: err?.message ?? String(err) });
      }
    }
  }
}

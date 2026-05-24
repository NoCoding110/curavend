/**
 * Notification routing engine.
 *
 * Resolves "who should receive an email/SMS/in-app for this event on this
 * tenant" by consulting the `notification_preferences` table, applying
 * sensible defaults when no preference is set, filtering through the global
 * `unsubscribes` opt-out list, and recording every dispatch in
 * `notification_delivery_log`.
 */
import { eq, and, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  notificationPreferences,
  notificationDeliveryLog,
  unsubscribes,
  orders,
  orderContacts,
  hospitals,
  vendors,
  users,
  userGroupMembers,
  type NotificationEventType,
  type NotificationChannel,
  type NotificationRecipientType,
} from '@curavend/db';
import type { Env } from '../lib/env';

export interface ResolvedRecipient {
  channel: NotificationChannel;
  recipientType: NotificationRecipientType;
  address: string;
  userId?: string;
}

// Default routing when no preference is configured per tenant
const DEFAULT_ROUTES: Record<string, Array<{ channel: NotificationChannel; recipientType: NotificationRecipientType }>> = {
  ORDER_CONFIRMATION: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
    { channel: 'EMAIL', recipientType: 'PATIENT' },
  ],
  ORDER_SHIPPED: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
    { channel: 'EMAIL', recipientType: 'PATIENT' },
  ],
  ORDER_DELIVERED: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
    { channel: 'EMAIL', recipientType: 'PATIENT' },
  ],
  ORDER_COMPLETED: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
  ],
  ORDER_CANCELLED: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
  ],
  INVOICE_SENT: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
  ],
  INVOICE_PAID: [
    { channel: 'EMAIL', recipientType: 'CONTACT' },
  ],
  INVOICE_OVERDUE: [
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
  RECURRING_ORDER_UPCOMING: [
    { channel: 'EMAIL', recipientType: 'ORDERER' },
  ],
  RECURRING_ORDER_PAUSED: [
    { channel: 'EMAIL', recipientType: 'ORDERER' },
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
  // SLA breach events — daily cron alerts to the team that should triage them
  ORDER_AWAITING_APPROVAL_SLA: [
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
  ORDER_FULFILLMENT_STALLED_SLA: [
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
  ORDER_NO_SHIPMENT_SLA: [
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
  LAB_ORDER_WORKFLOW_FAILED: [
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
  LAB_ORDER_APPROVAL_OVERDUE: [
    { channel: 'EMAIL', recipientType: 'PROCUREMENT_TEAM' },
  ],
};

/**
 * Resolve recipients for a tenant/event pair.
 * Falls through to defaults if no `notification_preferences` rows exist.
 */
export async function resolveRecipients(
  env: Env,
  args: {
    eventType: NotificationEventType;
    hospitalId?: string | null;
    vendorId?: string | null;
    orderId?: string | null;
    /** For lab SLA events. Resolves PROCUREMENT_TEAM to active LAB users with this group. */
    labGroupId?: string | null;
  },
): Promise<ResolvedRecipient[]> {
  const db = getDb(env.DB);

  // Prefer hospital-level prefs for procurement events; fall back to defaults
  const scope = args.hospitalId
    ? { type: 'HOSPITAL' as const, id: args.hospitalId }
    : args.vendorId
    ? { type: 'VENDOR' as const, id: args.vendorId }
    : null;

  let routes: Array<{
    channel: NotificationChannel;
    recipientType: NotificationRecipientType;
    customEmail?: string | null;
    recipientGroupId?: string | null;
  }> = [];

  if (scope) {
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.scopeType, scope.type),
          eq(notificationPreferences.scopeId, scope.id),
          eq(notificationPreferences.eventType, args.eventType),
          eq(notificationPreferences.isActive, 1),
        ),
      );
    if (prefs.length > 0) {
      routes = prefs.map((p) => ({
        channel: p.channel as NotificationChannel,
        recipientType: p.recipientType as NotificationRecipientType,
        customEmail: p.customEmail,
        recipientGroupId: p.recipientGroupId,
      }));
    }
  }
  if (routes.length === 0) {
    routes = DEFAULT_ROUTES[args.eventType] ?? [];
  }

  // Resolve concrete addresses per route
  const out: ResolvedRecipient[] = [];
  const order = args.orderId
    ? await db.select().from(orders).where(eq(orders.id, args.orderId)).limit(1).then((r) => r[0])
    : null;
  const contacts = args.orderId
    ? await db.select().from(orderContacts).where(eq(orderContacts.orderId, args.orderId))
    : [];
  const contactByRole = new Map(contacts.map((c) => [c.role, c]));

  for (const route of routes) {
    if (route.channel !== 'EMAIL' && route.channel !== 'SMS' && route.channel !== 'IN_APP' && route.channel !== 'WEBHOOK') continue;

    switch (route.recipientType) {
      case 'PATIENT':
        if (order?.patientEmail) {
          out.push({ channel: route.channel, recipientType: 'PATIENT', address: order.patientEmail });
        }
        break;
      case 'CONTACT': {
        const shipTo = contactByRole.get('SHIP_TO');
        if (shipTo?.email) {
          out.push({ channel: route.channel, recipientType: 'CONTACT', address: shipTo.email });
        }
        break;
      }
      case 'ORDERER': {
        const orderer = contactByRole.get('ORDERER');
        if (orderer?.email) {
          out.push({ channel: route.channel, recipientType: 'ORDERER', address: orderer.email });
        }
        break;
      }
      case 'CLINICIAN': {
        const clinical = contactByRole.get('CLINICAL');
        if (clinical?.email) {
          out.push({ channel: route.channel, recipientType: 'CLINICIAN', address: clinical.email });
        }
        break;
      }
      case 'PROCUREMENT_TEAM': {
        // Lab events: every active LAB user in this group (lab events don't
        // have a designated procurement role — every lab member triages SLA).
        if (args.labGroupId) {
          const labUsers = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(
              and(
                eq(users.labGroupId, args.labGroupId),
                eq(users.userType, 'LAB'),
                eq(users.userStatus, 'ACTIVE'),
              ),
            );
          for (const u of labUsers) {
            if (u.email) {
              out.push({ channel: route.channel, recipientType: 'PROCUREMENT_TEAM', address: u.email, userId: u.id });
            }
          }
          break;
        }
        const targetHospitalId = args.hospitalId ?? order?.hospitalId;
        if (targetHospitalId) {
          const teamUsers = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(
              and(
                eq(users.hospitalId, targetHospitalId),
                eq(users.userStatus, 'ACTIVE'),
                eq(users.role, 'FACILITY_ACCOUNT_MANAGER'),
              ),
            );
          for (const u of teamUsers) {
            if (u.email) {
              out.push({ channel: route.channel, recipientType: 'PROCUREMENT_TEAM', address: u.email, userId: u.id });
            }
          }
        }
        break;
      }
      case 'GROUP': {
        // Fan out to every member of the configured user_groups row.
        // The route MUST carry a recipientGroupId; otherwise this is a misconfiguration.
        if (!route.recipientGroupId) break;
        const memberRows = await db
          .select({ userId: userGroupMembers.userId })
          .from(userGroupMembers)
          .where(eq(userGroupMembers.userGroupId, route.recipientGroupId));
        if (memberRows.length === 0) break;
        const memberUsers = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(
            and(
              inArray(
                users.id,
                memberRows.map((m) => m.userId),
              ),
              eq(users.userStatus, 'ACTIVE'),
            ),
          );
        for (const u of memberUsers) {
          if (u.email) {
            out.push({ channel: route.channel, recipientType: 'GROUP', address: u.email, userId: u.id });
          }
        }
        break;
      }
      case 'CUSTOM':
        if (route.customEmail) {
          out.push({ channel: route.channel, recipientType: 'CUSTOM', address: route.customEmail });
        }
        break;
    }
  }

  // ── Dedupe by (channel, address) ───────────────────────────────────────
  const seen = new Set<string>();
  const deduped = out.filter((r) => {
    const key = `${r.channel}:${r.address.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Drop unsubscribed addresses (EMAIL only) ───────────────────────────
  if (deduped.some((r) => r.channel === 'EMAIL')) {
    const emails = deduped.filter((r) => r.channel === 'EMAIL').map((r) => r.address.toLowerCase());
    const opted = emails.length
      ? await db
          .select({ email: unsubscribes.email })
          .from(unsubscribes)
          .where(inArray(unsubscribes.email, emails))
      : [];
    const optedSet = new Set(opted.map((o) => o.email.toLowerCase()));
    return deduped.filter((r) => r.channel !== 'EMAIL' || !optedSet.has(r.address.toLowerCase()));
  }
  return deduped;
}

/**
 * Check whether an event has already been dispatched (SENT) for a given
 * entity within the dedup window. Used by SLA monitors so the same breach
 * doesn't fire repeatedly within the same day/run.
 */
export async function recentlyDispatched(
  env: Env,
  args: {
    eventType: string;
    relatedEntityType: string;
    relatedEntityId: string;
    withinMinutes: number;
  },
): Promise<boolean> {
  const db = getDb(env.DB);
  const cutoff = new Date(Date.now() - args.withinMinutes * 60_000).toISOString();
  const rows = await db
    .select({ id: notificationDeliveryLog.id })
    .from(notificationDeliveryLog)
    .where(
      and(
        eq(notificationDeliveryLog.eventType, args.eventType),
        eq(notificationDeliveryLog.relatedEntityType, args.relatedEntityType),
        eq(notificationDeliveryLog.relatedEntityId, args.relatedEntityId),
        eq(notificationDeliveryLog.deliveryStatus, 'SENT'),
        sql`${notificationDeliveryLog.sentAt} >= ${cutoff}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Log a delivery attempt to `notification_delivery_log`. */
export async function logDelivery(
  env: Env,
  args: {
    eventType: string;
    channel: string;
    recipientType?: string;
    recipientAddress: string;
    recipientUserId?: string | null;
    deliveryStatus: string;
    statusReason?: string | null;
    externalMessageId?: string | null;
    relatedEntityType?: string;
    relatedEntityId?: string;
  },
): Promise<void> {
  const db = getDb(env.DB);
  try {
    await db.insert(notificationDeliveryLog).values({
      eventType: args.eventType,
      channel: args.channel,
      recipientType: args.recipientType ?? null,
      recipientAddress: args.recipientAddress,
      recipientUserId: args.recipientUserId ?? null,
      externalMessageId: args.externalMessageId ?? null,
      deliveryStatus: args.deliveryStatus,
      statusReason: args.statusReason ?? null,
      relatedEntityType: args.relatedEntityType ?? null,
      relatedEntityId: args.relatedEntityId ?? null,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[notificationRouter] logDelivery failed:', err);
  }
}

/**
 * Convenience: dispatch an event to all resolved recipients. Loads order/PO
 * context, renders the template, sends emails via Resend, logs each attempt.
 */
export async function dispatchCustomerEvent(
  env: Env,
  args: {
    eventType: NotificationEventType;
    orderId?: string;
    invoiceId?: string;
    labOrderId?: string;
    hospitalId?: string;
    vendorId?: string;
    labGroupId?: string;
    subject: string;
    htmlBuilder: (recipient: ResolvedRecipient) => string;
  },
): Promise<{ sent: number; failed: number }> {
  const recipients = await resolveRecipients(env, {
    eventType: args.eventType,
    hospitalId: args.hospitalId ?? null,
    vendorId: args.vendorId ?? null,
    orderId: args.orderId ?? null,
    labGroupId: args.labGroupId ?? null,
  });

  // Resolve relatedEntity for delivery-log linking + dedup
  const relatedEntityType = args.orderId
    ? 'ORDER'
    : args.invoiceId
    ? 'INVOICE'
    : args.labOrderId
    ? 'LAB_ORDER'
    : undefined;
  const relatedEntityId = args.orderId ?? args.invoiceId ?? args.labOrderId;

  let sent = 0;
  let failed = 0;
  if (!env.RESEND_API_KEY) {
    // Resend not configured — log everything as FAILED and bail
    for (const r of recipients) {
      await logDelivery(env, {
        eventType: args.eventType,
        channel: r.channel,
        recipientType: r.recipientType,
        recipientAddress: r.address,
        recipientUserId: r.userId ?? null,
        deliveryStatus: 'FAILED',
        statusReason: 'Resend not configured',
        relatedEntityType,
        relatedEntityId,
      });
      failed++;
    }
    return { sent, failed };
  }

  const { EmailService } = await import('./emailService');
  const emailService = new EmailService(env.RESEND_API_KEY);
  for (const r of recipients) {
    if (r.channel !== 'EMAIL') continue;
    try {
      await emailService.sendEmail({
        to: r.address,
        subject: args.subject,
        html: args.htmlBuilder(r),
      });
      await logDelivery(env, {
        eventType: args.eventType,
        channel: 'EMAIL',
        recipientType: r.recipientType,
        recipientAddress: r.address,
        recipientUserId: r.userId ?? null,
        deliveryStatus: 'SENT',
        relatedEntityType,
        relatedEntityId,
      });
      sent++;
    } catch (err: any) {
      await logDelivery(env, {
        eventType: args.eventType,
        channel: 'EMAIL',
        recipientType: r.recipientType,
        recipientAddress: r.address,
        recipientUserId: r.userId ?? null,
        deliveryStatus: 'FAILED',
        statusReason: err?.message ?? 'unknown',
        relatedEntityType,
        relatedEntityId,
      });
      failed++;
    }
  }
  return { sent, failed };
}

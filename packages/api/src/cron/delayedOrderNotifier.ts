/**
 * Cron: every 15 minutes.
 * Finds orders that have been at VENDOR_ASSIGNED for > 15 minutes without a
 * hospital notification, then notifies + emails the hospital.
 */
import { getDb } from '../lib/db';
import { orders } from '@curavend/db';
import { and, eq, lt } from 'drizzle-orm';
import { EmailService } from '../services/emailService';
import { notifyHospitalUsers } from '../queues/notificationHelpers';
import type { Env } from '../lib/env';

export async function handleDelayedOrderNotifications(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const emailService = new EmailService(env.RESEND_API_KEY);

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const unnotified = await db.query.orders.findMany({
    where: and(
      eq(orders.notifiedHospital, 0),
      lt(orders.createdAt, fifteenMinAgo),
    ),
    with: {
      hospital: true,
      vendor: true,
    },
    limit: 50,
  });

  for (const order of unnotified) {
    try {
      // In-app notification for hospital users
      if (order.hospitalId) {
        await notifyHospitalUsers(
          env,
          order.hospitalId,
          `Order ${order.identifier} is awaiting vendor action`,
          'ORDER',
          order.id,
        );
      }

      // Email the hospital's shared inbox if configured
      if (order.hospital?.email) {
        await emailService.sendOrderNotification(
          {
            identifier: order.identifier,
            status: order.status,
            patientName: order.patientName,
          },
          order.hospital.email,
          'new_order',
        );
      }

      await db
        .update(orders)
        .set({ notifiedHospital: 1, updatedAt: new Date().toISOString() })
        .where(eq(orders.id, order.id));
    } catch (err) {
      console.error(`[cron] Failed to notify for order ${order.id}:`, err);
    }
  }

  console.log(`[cron] Processed ${unnotified.length} delayed order notifications`);
}

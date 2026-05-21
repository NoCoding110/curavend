/**
 * Queue event → notification/email helpers.
 * Shared utilities used by the queue handlers.
 */
import { getDb } from '../lib/db';
import { users, orders, invoices, rooms } from '@curavend/db';
import { eq, and } from 'drizzle-orm';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import type { Env } from '../lib/env';

export async function notifyHospitalUsers(
  env: Env,
  hospitalId: string,
  message: string,
  redirectTo: string,
  redirectId: string,
  emailSubject?: string,
  emailBody?: string,
) {
  const db = getDb(env.DB);
  const svc = new NotificationService(env.DB);
  const targets = await db
    .select()
    .from(users)
    .where(and(eq(users.hospitalId, hospitalId), eq(users.userStatus, 'ACTIVE')));

  for (const u of targets) {
    await svc.createNotification({ receiverId: u.id, message, redirectTo, redirectId });
    if (emailSubject && emailBody && u.email) {
      try {
        const es = new EmailService(env.RESEND_API_KEY);
        await es.sendEmail({ to: u.email, subject: emailSubject, html: emailBody });
      } catch (err) {
        console.warn('[notify] email failed:', err);
      }
    }
  }
}

export async function notifyVendorUsers(
  env: Env,
  vendorId: string,
  message: string,
  redirectTo: string,
  redirectId: string,
  emailSubject?: string,
  emailBody?: string,
) {
  const db = getDb(env.DB);
  const svc = new NotificationService(env.DB);
  const targets = await db
    .select()
    .from(users)
    .where(and(eq(users.vendorId, vendorId), eq(users.userStatus, 'ACTIVE')));

  for (const u of targets) {
    await svc.createNotification({ receiverId: u.id, message, redirectTo, redirectId });
    if (emailSubject && emailBody && u.email) {
      try {
        const es = new EmailService(env.RESEND_API_KEY);
        await es.sendEmail({ to: u.email, subject: emailSubject, html: emailBody });
      } catch (err) {
        console.warn('[notify] email failed:', err);
      }
    }
  }
}

export async function getOrderById(env: Env, orderId: string) {
  const db = getDb(env.DB);
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows[0] ?? null;
}

export async function getInvoiceById(env: Env, invoiceId: string) {
  const db = getDb(env.DB);
  const rows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  return rows[0] ?? null;
}

export async function getRoomById(env: Env, roomId: string) {
  const db = getDb(env.DB);
  const rows = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return rows[0] ?? null;
}

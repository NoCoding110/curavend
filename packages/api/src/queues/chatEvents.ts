/**
 * Queue handler for chat.new_message.
 * Notifies the recipient side (hospital users if sender is vendor, and vice versa).
 */
import { getDb } from '../lib/db';
import { messages, rooms, users } from '@curavend/db';
import { eq, and, ne } from 'drizzle-orm';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import type { Env } from '../lib/env';

export async function handleChatMessage(
  env: Env,
  payload: { roomId: string; messageId: string; senderUserId: string },
) {
  const db = getDb(env.DB);

  const roomRows = await db.select().from(rooms).where(eq(rooms.id, payload.roomId)).limit(1);
  const room = roomRows[0];
  if (!room) return;

  const msgRows = await db.select().from(messages).where(eq(messages.id, payload.messageId)).limit(1);
  const msg = msgRows[0];
  if (!msg) return;

  // Look up sender to know which side they're on
  const senderRows = await db.select().from(users).where(eq(users.id, payload.senderUserId)).limit(1);
  const sender = senderRows[0];
  if (!sender) return;

  // Determine receivers (active users on the opposite side)
  let receivers: any[] = [];
  if (sender.userType === 'HOSPITAL' && room.vendorId) {
    receivers = await db
      .select()
      .from(users)
      .where(and(eq(users.vendorId, room.vendorId), eq(users.userStatus, 'ACTIVE'), ne(users.id, sender.id)));
  } else if (sender.userType === 'VENDOR' && room.hospitalId) {
    receivers = await db
      .select()
      .from(users)
      .where(and(eq(users.hospitalId, room.hospitalId), eq(users.userStatus, 'ACTIVE'), ne(users.id, sender.id)));
  }

  const notifSvc = new NotificationService(env.DB);
  for (const r of receivers) {
    await notifSvc.createNotification({
      receiverId: r.id,
      message: `New message from ${sender.name ?? sender.email}`,
      redirectTo: 'ROOM',
      redirectId: room.id,
    });
  }

  // Email (throttled in the future; for now, one per new message)
  if (receivers.length && env.RESEND_API_KEY) {
    try {
      const es = new EmailService(env.RESEND_API_KEY);
      const preview = (msg.text ?? '').slice(0, 140);
      for (const r of receivers) {
        if (!r.email) continue;
        await es.sendEmail({
          to: r.email,
          subject: `Curavend: New message from ${sender.name ?? 'a teammate'}`,
          html: `<p>You have a new message in Curavend:</p><blockquote>${preview}</blockquote>`,
        });
      }
    } catch (err) {
      console.warn('[chat] email failed:', err);
    }
  }
}

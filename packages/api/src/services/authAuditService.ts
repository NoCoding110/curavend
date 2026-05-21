import { getDb } from '../lib/db';
import { authAuditLog } from '@curavend/db';
import type { AuthAuditEvent } from '@curavend/db';
import type { Env } from '../lib/env';

export type { AuthAuditEvent };

export interface AuthAuditEventData {
  userId?: string | null;
  userEmail?: string | null;
  event: AuthAuditEvent;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Write an auth-event audit record.
 * Non-blocking — errors are swallowed so a logging failure never breaks
 * the request that triggered it.
 */
export async function logAuthEvent(env: Env, data: AuthAuditEventData): Promise<void> {
  try {
    const db = getDb(env.DB);
    await db.insert(authAuditLog).values({
      id: crypto.randomUUID(),
      userId: data.userId ?? null,
      userEmail: data.userEmail ?? null,
      event: data.event,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[auth-audit] failed to write audit log:', err);
  }
}

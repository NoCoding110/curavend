import { getDb } from '../lib/db';
import { phiAccessLog, phiConsentLog } from '@curavend/db';
import type { Env } from '../lib/env';

export interface PhiAccessEvent {
  userId: string;
  userEmail: string;
  userType: string;
  resourceType: 'ORDER' | 'INVOICE';
  resourceId: string;
  action: 'VIEW' | 'EXPORT';
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write a PHI access audit record.
 * Non-blocking — errors are swallowed so a logging failure never breaks
 * the request that triggered it.
 */
export async function logPhiAccess(env: Env, event: PhiAccessEvent): Promise<void> {
  try {
    const db = getDb(env.DB);
    await db.insert(phiAccessLog).values({
      id: crypto.randomUUID(),
      userId: event.userId,
      userEmail: event.userEmail,
      userType: event.userType,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      action: event.action,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      accessedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[phi-audit] failed to write access log:', err);
  }
}

export interface PhiConsentEvent {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Record that a user has acknowledged PHI access terms.
 */
export async function logPhiConsent(env: Env, event: PhiConsentEvent): Promise<void> {
  try {
    const db = getDb(env.DB);
    await db.insert(phiConsentLog).values({
      id: crypto.randomUUID(),
      userId: event.userId,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      acknowledgedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[phi-audit] failed to write consent log:', err);
  }
}

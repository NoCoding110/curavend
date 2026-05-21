/**
 * emailOtpService — generate, store, send, and verify email-based OTP codes.
 *
 * Used as an alternative MFA flow to TOTP. Codes are 6-digit numeric, valid
 * for 10 minutes, bcrypt-hashed at rest. Rate limit: 5 attempts per code.
 */
import bcrypt from 'bcryptjs';
import { eq, and, desc, gt, isNull } from 'drizzle-orm';
import { emailOtpCodes, users } from '@curavend/db';
import type { EmailOtpPurpose } from '@curavend/db';
import { EmailService } from './emailService';
import { getDb } from '../lib/db';
import type { Env } from '../lib/env';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_ATTEMPTS_PER_CODE = 5;

function generateNumericCode(): string {
  // 6 digits, leading zeros allowed
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const view = new DataView(buf.buffer);
  return (view.getUint32(0, false) % 1_000_000).toString().padStart(6, '0');
}

export async function sendOtpCode(
  env: Env,
  opts: { userId?: string | null; email: string; purpose: EmailOtpPurpose; ipAddress?: string | null },
): Promise<{ codeId: string; expiresAt: string }> {
  const db = getDb(env.DB);
  const code = generateNumericCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const codeId = crypto.randomUUID();
  await db.insert(emailOtpCodes).values({
    id: codeId,
    userId: opts.userId ?? null,
    email: opts.email.toLowerCase(),
    codeHash,
    purpose: opts.purpose,
    expiresAt,
    attempts: 0,
    ipAddress: opts.ipAddress ?? null,
  });
  const emailService = new EmailService(env.RESEND_API_KEY, db);
  await emailService.sendEmailOtp(opts.email, code, labelForPurpose(opts.purpose));
  return { codeId, expiresAt };
}

export async function verifyOtpCode(
  env: Env,
  opts: { email: string; code: string; purpose: EmailOtpPurpose },
): Promise<{ ok: true; userId: string | null } | { ok: false; reason: 'EXPIRED' | 'INVALID' | 'NOT_FOUND' | 'LOCKED' }> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(emailOtpCodes)
    .where(
      and(
        eq(emailOtpCodes.email, opts.email.toLowerCase()),
        eq(emailOtpCodes.purpose, opts.purpose),
        isNull(emailOtpCodes.consumedAt),
        gt(emailOtpCodes.expiresAt, now),
      ),
    )
    .orderBy(desc(emailOtpCodes.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if ((row.attempts ?? 0) >= MAX_ATTEMPTS_PER_CODE) {
    return { ok: false, reason: 'LOCKED' };
  }
  const match = await bcrypt.compare(opts.code, row.codeHash);
  if (!match) {
    await db
      .update(emailOtpCodes)
      .set({ attempts: (row.attempts ?? 0) + 1 })
      .where(eq(emailOtpCodes.id, row.id));
    return { ok: false, reason: 'INVALID' };
  }
  await db
    .update(emailOtpCodes)
    .set({ consumedAt: new Date().toISOString() })
    .where(eq(emailOtpCodes.id, row.id));
  return { ok: true, userId: row.userId };
}

function labelForPurpose(purpose: EmailOtpPurpose): string {
  switch (purpose) {
    case 'MFA_LOGIN':
      return 'complete your login';
    case 'EMAIL_VERIFY':
      return 'verify your email address';
    case 'STEP_UP':
      return 'authorize this sensitive action';
    case 'PASSWORD_RESET':
      return 'reset your password';
    default:
      return 'continue';
  }
}

/**
 * Resolve a user by email and return whether they have email OTP MFA enabled.
 */
export async function lookupUserMfaPref(
  env: Env,
  email: string,
): Promise<{ userId: string; emailOtpEnabled: boolean; totpEnabled: boolean } | null> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  return {
    userId: u.id,
    emailOtpEnabled: (u.emailOtpMfaEnabled ?? 0) === 1,
    totpEnabled: (u.mfaEnabled ?? 0) === 1,
  };
}

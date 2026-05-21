import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MFA_TOKEN_EXPIRY = '5m';

export interface TokenUser {
  id: string;
  email: string;
  role: string;
  userType: string;
  providerId?: string | null;
  hospitalId?: string | null;
  vendorId?: string | null;
  superVendorId?: string | null;
  hasAgreedToPHIAccess?: number | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface MfaSetupResult {
  secret: string;
  uri: string;
  qrCodeUrl: string;
}

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate access + refresh token pair for a fully authenticated user.
 */
export async function generateTokens(
  user: TokenUser,
  jwtSecret: string,
  jwtRefreshSecret: string,
): Promise<TokenPair> {
  const accessSecret = new TextEncoder().encode(jwtSecret);
  const refreshSecret = new TextEncoder().encode(jwtRefreshSecret);

  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new jose.SignJWT({
    email: user.email,
    role: user.role,
    userType: user.userType,
    providerId: user.providerId ?? undefined,
    hospitalId: user.hospitalId ?? undefined,
    vendorId: user.vendorId ?? undefined,
    superVendorId: user.superVendorId ?? undefined,
    hasAgreedToPHIAccess: user.hasAgreedToPHIAccess ?? 0,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('curavend')
    .sign(accessSecret);

  const refreshToken = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer('curavend')
    .sign(refreshSecret);

  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds
  };
}

/**
 * Verify an access token. Throws on invalid/expired token.
 */
export async function verifyAccessToken(
  token: string,
  jwtSecret: string,
): Promise<jose.JWTPayload> {
  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jose.jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'curavend',
  });
  return payload;
}

/**
 * Verify a refresh token. Throws on invalid/expired token.
 */
export async function verifyRefreshToken(
  token: string,
  jwtRefreshSecret: string,
): Promise<jose.JWTPayload> {
  const secret = new TextEncoder().encode(jwtRefreshSecret);
  const { payload } = await jose.jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'curavend',
  });
  return payload;
}

/**
 * Generate a short-lived temporary token for MFA verification flow.
 * This is returned after password is verified but before MFA is completed.
 */
export async function generateTemporaryToken(
  userId: string,
  jwtSecret: string,
): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);
  return new jose.SignJWT({ purpose: 'mfa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(MFA_TOKEN_EXPIRY)
    .setIssuer('curavend')
    .sign(secret);
}

/**
 * Verify a temporary MFA token.
 */
export async function verifyTemporaryToken(
  token: string,
  jwtSecret: string,
): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jose.jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'curavend',
  });
  if (payload.purpose !== 'mfa') {
    throw new Error('Invalid token purpose');
  }
  return payload.sub as string;
}

/**
 * Generate a TOTP secret and provisioning URI for MFA setup.
 */
export function generateMfaSecret(email: string): MfaSetupResult {
  const totp = new OTPAuth.TOTP({
    issuer: 'Curavend',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const secret = totp.secret.base32;
  const uri = totp.toString();
  // Generate a QR code URL via a public chart API (client can also generate locally)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;

  return { secret, uri, qrCodeUrl };
}

/**
 * Verify a TOTP code against the stored secret.
 */
export function verifyMfaCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: 'Curavend',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // Allow a window of 1 period (30 seconds) in each direction
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate a 6-digit password reset code.
 */
export function generateResetCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0] % 900000) + 100000;
  return code.toString();
}

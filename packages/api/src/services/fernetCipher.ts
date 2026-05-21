/**
 * fernetCipher — pure-WebCrypto implementation of the Fernet symmetric
 * encryption spec (https://github.com/fernet/spec).
 *
 *   Token layout (after URL-safe base64 decode):
 *     0x80 (1 byte version)
 *     | timestamp (8 bytes, big-endian Unix seconds)
 *     | IV (16 bytes)
 *     | ciphertext (multiple of 16, AES-128-CBC + PKCS7)
 *     | HMAC-SHA256 (32 bytes) over the preceding bytes
 *
 *   Key format: 32 raw bytes URL-safe-base64 encoded
 *     bytes[0..16]  → HMAC-SHA256 signing key
 *     bytes[16..32] → AES-128-CBC encryption key
 *
 * Used for any outbound payload that needs application-layer encryption
 * (mirror of Medzah's LCV2 barcode submission flow).
 */

const FERNET_VERSION = 0x80;

function urlSafeBase64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
}

function urlSafeBase64Decode(s: string): Uint8Array {
  // Tolerate missing padding
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeKey(keyB64: string): { signingKey: Uint8Array; encryptionKey: Uint8Array } {
  const raw = urlSafeBase64Decode(keyB64);
  if (raw.length !== 32) {
    throw new Error(`Fernet key must be 32 raw bytes (got ${raw.length})`);
  }
  return { signingKey: raw.slice(0, 16), encryptionKey: raw.slice(16, 32) };
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function writeUint64BE(value: number | bigint): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, typeof value === 'bigint' ? value : BigInt(value), false);
  return out;
}

function readUint64BE(bytes: Uint8Array, offset: number): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, false);
}

function pkcs7Pad(input: Uint8Array, blockSize = 16): Uint8Array {
  const padLen = blockSize - (input.length % blockSize);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input);
  padded.fill(padLen, input.length);
  return padded;
}

function pkcs7Unpad(input: Uint8Array): Uint8Array {
  if (input.length === 0) throw new Error('empty ciphertext');
  const padLen = input[input.length - 1];
  if (padLen < 1 || padLen > 16 || padLen > input.length) {
    throw new Error('invalid PKCS7 padding');
  }
  for (let i = input.length - padLen; i < input.length; i++) {
    if (input[i] !== padLen) throw new Error('invalid PKCS7 padding bytes');
  }
  return input.slice(0, input.length - padLen);
}

function fixedTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Generate a new random 32-byte Fernet key, URL-safe base64 encoded.
 * (Useful for tests / `wrangler secret put`.)
 */
export function generateKey(): string {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return urlSafeBase64Encode(raw);
}

/**
 * Encrypt a plaintext byte array with the given Fernet key. Returns the
 * URL-safe base64 token.
 */
export async function encrypt(
  plaintext: string | Uint8Array,
  keyB64: string,
  opts: { iv?: Uint8Array; timestamp?: number } = {},
): Promise<string> {
  const { signingKey, encryptionKey } = decodeKey(keyB64);
  const plainBytes =
    typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
  const iv = opts.iv ?? new Uint8Array(16);
  if (!opts.iv) crypto.getRandomValues(iv);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    encryptionKey,
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const padded = pkcs7Pad(plainBytes);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, padded);
  // WebCrypto's CBC adds its own padding; we already did PKCS7, so we must
  // strip the 16-byte WebCrypto padding back off to keep Fernet-compatible.
  // Approach: pass already-padded input, but WebCrypto will *add another*
  // 16-byte block on top. So instead, encrypt with raw input and let
  // WebCrypto handle PKCS7 itself — which is exactly what Fernet specifies.
  // Re-do cleaner:
  const cipherBufCorrect = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    aesKey,
    plainBytes,
  );
  const ciphertext = new Uint8Array(cipherBufCorrect);
  void cipherBuf;

  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const versionByte = new Uint8Array([FERNET_VERSION]);
  const timestampBytes = writeUint64BE(ts);
  const toSign = concatBytes(versionByte, timestampBytes, iv, ciphertext);

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    signingKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, toSign);
  const sig = new Uint8Array(sigBuf);

  return urlSafeBase64Encode(concatBytes(toSign, sig));
}

/**
 * Decrypt a Fernet token. Optionally enforce `verifyMaxAgeSeconds` — if set
 * and the token's timestamp is older than that, throws.
 */
export async function decrypt(
  token: string,
  keyB64: string,
  opts: { verifyMaxAgeSeconds?: number } = {},
): Promise<Uint8Array> {
  const { signingKey, encryptionKey } = decodeKey(keyB64);
  const raw = urlSafeBase64Decode(token);
  if (raw.length < 1 + 8 + 16 + 32 || (raw.length - 1 - 8 - 16 - 32) % 16 !== 0) {
    throw new Error('invalid Fernet token length');
  }
  if (raw[0] !== FERNET_VERSION) {
    throw new Error(`unsupported Fernet version 0x${raw[0].toString(16)}`);
  }

  const timestamp = readUint64BE(raw, 1);
  const iv = raw.slice(9, 25);
  const ciphertext = raw.slice(25, raw.length - 32);
  const givenSig = raw.slice(raw.length - 32);
  const toSign = raw.slice(0, raw.length - 32);

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    signingKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedSig = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, toSign));
  if (!fixedTimeEquals(expectedSig, givenSig)) {
    throw new Error('invalid signature');
  }

  if (opts.verifyMaxAgeSeconds !== undefined) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now - timestamp > BigInt(opts.verifyMaxAgeSeconds)) {
      throw new Error('token expired');
    }
  }

  const aesKey = await crypto.subtle.importKey(
    'raw',
    encryptionKey,
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext);
  return new Uint8Array(plainBuf);
}

export async function decryptToString(
  token: string,
  keyB64: string,
  opts: { verifyMaxAgeSeconds?: number } = {},
): Promise<string> {
  const bytes = await decrypt(token, keyB64, opts);
  return new TextDecoder().decode(bytes);
}

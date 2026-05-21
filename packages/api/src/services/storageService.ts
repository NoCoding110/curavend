/**
 * R2 storage service for file uploads/downloads.
 */
import { AwsClient } from 'aws4fetch';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

/**
 * Upload a file to R2.
 */
export async function uploadFile(
  r2: R2Bucket,
  key: string,
  file: ArrayBuffer | ReadableStream,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<void> {
  await r2.put(key, file, {
    httpMetadata: {
      contentType,
    },
    customMetadata: metadata,
  });
}

/**
 * Download a file from R2.
 * Returns null if the key does not exist.
 */
export async function downloadFile(
  r2: R2Bucket,
  key: string,
): Promise<R2ObjectBody | null> {
  return r2.get(key);
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key);
}

/**
 * Check whether a key exists in R2 without downloading the body.
 */
export async function fileExists(r2: R2Bucket, key: string): Promise<boolean> {
  const head = await r2.head(key);
  return head !== null;
}

/**
 * Generate a Worker-proxied URL for downloading a private file.
 * R2 does not natively support pre-signed URLs from Workers,
 * so we route through our own /api/uploads/:key endpoint instead.
 */
export function getProxiedUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/api/uploads/${encodeURIComponent(key)}`;
}

/**
 * Build a unique storage key with a timestamp prefix to prevent overwrites.
 */
export function buildStorageKey(
  folder: string,
  filename: string,
): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${folder}/${timestamp}-${sanitized}`;
}

/**
 * List objects in R2 under a given prefix.
 */
export async function listFiles(
  r2: R2Bucket,
  prefix: string,
  limit = 100,
): Promise<R2Objects> {
  return r2.list({ prefix, limit });
}

/**
 * Alias for fileExists — matches the route surface in `utility.ts`.
 */
export async function blobExists(r2: R2Bucket, key: string): Promise<boolean> {
  return fileExists(r2, key);
}

/**
 * Decode a base64 string, validate it, and upload to R2.
 * Validates size + MIME (same rules as multipart uploads).
 */
export async function uploadBase64(
  r2: R2Bucket,
  base64Data: string,
  fileName: string,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<{ key: string; size: number }> {
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw new Error(`MIME type ${contentType} is not allowed`);
  }
  // Strip data-URL prefix if present
  const cleaned = base64Data.replace(/^data:[^;]+;base64,/, '');
  let bytes: Uint8Array;
  try {
    const binary = atob(cleaned);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    throw new Error('Invalid base64 payload');
  }
  if (bytes.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File exceeds max size of ${MAX_FILE_SIZE} bytes`);
  }
  const key = buildStorageKey('uploads/base64', fileName);
  // R2.put accepts ArrayBuffer; build one from the typed array
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await uploadFile(r2, key, buffer, contentType, metadata);
  return { key, size: bytes.byteLength };
}

/**
 * Generate an S3-compatible presigned URL for an R2 object using
 * aws4fetch's sigv4 signing. Requires R2_ACCOUNT_ID + R2_ACCESS_KEY_ID +
 * R2_SECRET_ACCESS_KEY secrets.
 */
export async function getPresignedUrl(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  expiresInSeconds: number;
  mode: 'GET' | 'PUT';
}): Promise<string> {
  const aws = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const endpoint = `https://${opts.accountId}.r2.cloudflarestorage.com/${opts.bucket}/${encodeURI(opts.key)}`;
  const url = new URL(endpoint);
  url.searchParams.set('X-Amz-Expires', String(opts.expiresInSeconds));
  const signed = await aws.sign(
    new Request(url.toString(), { method: opts.mode }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

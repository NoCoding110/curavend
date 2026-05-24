import { Hono } from 'hono';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  buildStorageKey,
} from '../services/storageService';
import { getDb } from '../lib/db';
import { fileAccessLog } from '@curavend/db';
import {
  resolveFileScope,
  canUserAccessFile,
  describeScope,
} from '../lib/fileScope';

const uploadRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_CONTENT_TYPES = new Set([
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

// ─── POST /uploads ──────────────────────────────────────────────────────────

uploadRoutes.post('/', async (c) => {
  const contentType = c.req.header('Content-Type') ?? '';

  if (!contentType.includes('multipart/form-data')) {
    throw new ValidationError('Expected multipart/form-data');
  }

  const formData = await c.req.formData();
  const raw = formData.get('file');

  // Workers FormData returns `string | File | null`. `instanceof File` is the
  // canonical way to discriminate; cast `File` through `any` because under
  // @cloudflare/workers-types it's an ambient type that TS doesn't always
  // know is a value-side constructor.
  // `raw` is typed `FormDataEntryValue | null` (string | File | null). Use a
  // duck-type instead of `instanceof File` because the global File constructor
  // value isn't always visible under @cloudflare/workers-types.
  if (
    !raw ||
    typeof raw === 'string' ||
    typeof (raw as any).arrayBuffer !== 'function' ||
    typeof (raw as any).size !== 'number'
  ) {
    throw new ValidationError('No file provided. Use field name "file".');
  }
  const file = raw as File;

  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
    );
  }

  const fileContentType = file.type || 'application/octet-stream';
  if (!ALLOWED_CONTENT_TYPES.has(fileContentType)) {
    throw new ValidationError(
      `File type "${fileContentType}" is not allowed. Allowed types: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`,
    );
  }

  // Optional folder from form data, default to "uploads"
  const folder = (formData.get('folder') as string) || 'uploads';
  const key = buildStorageKey(folder, file.name);
  const buffer = await file.arrayBuffer();

  const authUser = c.get('user');

  await uploadFile(c.env.R2, key, buffer, fileContentType, {
    uploadedBy: authUser.id,
    originalName: file.name,
  });

  return c.json(
    {
      key,
      filename: file.name,
      contentType: fileContentType,
      size: file.size,
      url: `/api/uploads/${encodeURIComponent(key)}`,
    },
    201,
  );
});

// ─── GET /uploads/:key ──────────────────────────────────────────────────────
//
// Scope-checked + audited file download.
//
// Each request:
//   1. Resolves the file_key to its owning entity (order / contract / etc.)
//   2. Verifies the authenticated user can access that entity (via fileScope)
//   3. Logs the access in `file_access_log` (HIPAA §164.312(b))
//   4. Streams from R2
//
// Files that don't resolve to any known entity (orphans) are admin-only.

uploadRoutes.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  if (!key) {
    throw new ValidationError('File key is required');
  }

  const user = c.get('user');
  const db = getDb(c.env.DB);

  // 1. Resolve scope (which order/contract/etc. owns this file)
  const scope = await resolveFileScope(db, key);

  // 2. Authorization check
  if (!canUserAccessFile(user, scope)) {
    throw new ForbiddenError(
      `You do not have access to this file (${describeScope(scope)})`,
    );
  }

  // 3. Fetch object — note we do this BEFORE logging because if the file
  // is missing, we want to return 404 without an audit row claiming a 200.
  const object = await downloadFile(c.env.R2, key);

  // 4. Audit log (best-effort; never blocks the response)
  const ipAddress =
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    null;
  const userAgent = c.req.header('User-Agent') ?? null;

  // Use Cloudflare's c.executionCtx?.waitUntil if present so the log row
  // doesn't add request latency; fall back to inline await if not available.
  const logPromise = db.insert(fileAccessLog).values({
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    fileKey: key,
    fileKind: scope.kind,
    hospitalId: scope.hospitalId,
    vendorId: scope.vendorId,
    orderId: scope.orderId,
    contractId: scope.contractId,
    invoiceId: scope.invoiceId,
    ipAddress,
    userAgent,
    bytesServed: object?.size ?? 0,
    httpStatus: object ? 200 : 404,
  });

  if ((c as any).executionCtx?.waitUntil) {
    (c as any).executionCtx.waitUntil(logPromise);
  } else {
    await logPromise.catch((err) => {
      console.error('[uploads] failed to write file_access_log:', err);
    });
  }

  if (!object) {
    throw new NotFoundError('File not found');
  }

  const headers = new Headers();
  headers.set(
    'Content-Type',
    object.httpMetadata?.contentType ?? 'application/octet-stream',
  );
  headers.set('Content-Length', object.size.toString());

  // PHI / sensitive content: avoid public CDN caching by default. Switch to
  // private so the response is cached only by the requesting client.
  headers.set('Cache-Control', 'private, max-age=300');

  // Set filename from custom metadata if available
  const originalName = object.customMetadata?.originalName;
  if (originalName) {
    headers.set(
      'Content-Disposition',
      `inline; filename="${originalName}"`,
    );
  }

  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
});

// ─── DELETE /uploads/:key ───────────────────────────────────────────────────

uploadRoutes.delete('/:key{.+}', async (c) => {
  const user = c.get('user');

  // Only platform admins may delete files — prevents cross-tenant file deletion
  if (user.userType !== 'ADMIN') {
    throw new ForbiddenError('Only administrators can delete files');
  }

  const key = c.req.param('key');

  if (!key) {
    throw new ValidationError('File key is required');
  }

  await deleteFile(c.env.R2, key);

  return c.json({ message: 'File deleted successfully' });
});

export default uploadRoutes;

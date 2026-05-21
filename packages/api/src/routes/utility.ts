/**
 * utility.ts — Medzah-parity utility endpoints for PDF generation, file
 * manipulation, base64 uploads, blob inspection, and presigned R2 URLs.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { ValidationError, NotFoundError, AppError } from '../lib/errors';
import {
  blobExists,
  uploadBase64,
  uploadFile,
  buildStorageKey,
  getPresignedUrl,
} from '../services/storageService';
import {
  renderHtmlToPdf,
  renderHtmlToPdfWithFallback,
  imageToPdf,
  mergePdfs,
  compressPdf,
} from '../services/pdfService';

const utilityRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function proxiedUrl(req: Request, key: string): string {
  const u = new URL(req.url);
  return `${u.origin}/api/uploads/${encodeURIComponent(key)}`;
}

// ─── GET /utility/blob-exists ──────────────────────────────────────────────

utilityRoutes.get('/blob-exists', async (c) => {
  const key = c.req.query('key');
  if (!key) throw new ValidationError('Missing query param: key');
  const exists = await blobExists(c.env.R2, key);
  return c.json({ exists, key });
});

// ─── POST /utility/upload-base64 ───────────────────────────────────────────

const uploadBase64Schema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  base64Data: z.string().min(1),
});

utilityRoutes.post('/upload-base64', async (c) => {
  const body = await c.req.json();
  const parsed = uploadBase64Schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const user = c.get('user');
  try {
    const { key, size } = await uploadBase64(
      c.env.R2,
      parsed.data.base64Data,
      parsed.data.fileName,
      parsed.data.contentType,
      { uploadedBy: user.id ?? 'unknown', originalName: parsed.data.fileName },
    );
    return c.json({
      key,
      size,
      filename: parsed.data.fileName,
      contentType: parsed.data.contentType,
      url: proxiedUrl(c.req.raw, key),
    });
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }
});

// ─── POST /utility/convert-html-to-pdf ─────────────────────────────────────

const htmlToPdfSchema = z.object({
  html: z.string().min(1),
  fileName: z.string().min(1),
  format: z.enum(['Letter', 'A4', 'Legal']).optional(),
  landscape: z.boolean().optional(),
});

utilityRoutes.post('/convert-html-to-pdf', async (c) => {
  const body = await c.req.json();
  const parsed = htmlToPdfSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const { bytes, usedFallback } = await renderHtmlToPdfWithFallback(
    c.env.BROWSER,
    parsed.data.html,
    parsed.data.fileName,
    { format: parsed.data.format, landscape: parsed.data.landscape },
  );
  const key = buildStorageKey('utility/html-to-pdf', `${parsed.data.fileName}.pdf`);
  await uploadFile(c.env.R2, key, bytes.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'utility-html-to-pdf',
    usedFallback: usedFallback ? '1' : '0',
  });
  return c.json({
    key,
    fileName: `${parsed.data.fileName}.pdf`,
    url: proxiedUrl(c.req.raw, key),
    bytes: bytes.byteLength,
    usedFallback,
  });
});

// ─── POST /utility/convert-image-to-pdf ────────────────────────────────────

const imageToPdfSchema = z.object({
  base64Image: z.string().min(1),
  mime: z.enum(['image/png', 'image/jpeg']),
  fileName: z.string().min(1),
});

utilityRoutes.post('/convert-image-to-pdf', async (c) => {
  const body = await c.req.json();
  const parsed = imageToPdfSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  let bytes: Uint8Array;
  try {
    bytes = await imageToPdf(parsed.data.base64Image, parsed.data.mime);
  } catch (err) {
    throw new ValidationError(`Invalid image: ${(err as Error).message}`);
  }
  const key = buildStorageKey('utility/image-to-pdf', `${parsed.data.fileName}.pdf`);
  await uploadFile(c.env.R2, key, bytes.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'utility-image-to-pdf',
  });
  return c.json({
    key,
    fileName: `${parsed.data.fileName}.pdf`,
    url: proxiedUrl(c.req.raw, key),
    bytes: bytes.byteLength,
  });
});

// ─── POST /utility/merge-pdfs ──────────────────────────────────────────────

const mergeSchema = z.object({
  keys: z.array(z.string().min(1)).min(2),
  outputFileName: z.string().min(1),
});

utilityRoutes.post('/merge-pdfs', async (c) => {
  const body = await c.req.json();
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const buffers: Uint8Array[] = [];
  for (const key of parsed.data.keys) {
    const obj = await c.env.R2.get(key);
    if (!obj) throw new NotFoundError(`Blob ${key} not found`);
    buffers.push(new Uint8Array(await obj.arrayBuffer()));
  }
  const merged = await mergePdfs(buffers);
  const outputKey = buildStorageKey('utility/merged', parsed.data.outputFileName);
  await uploadFile(c.env.R2, outputKey, merged.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'utility-merged',
    sourceCount: String(parsed.data.keys.length),
  });
  return c.json({
    key: outputKey,
    fileName: parsed.data.outputFileName,
    url: proxiedUrl(c.req.raw, outputKey),
    bytes: merged.byteLength,
    mergedCount: parsed.data.keys.length,
  });
});

// ─── POST /utility/compress-pdf ────────────────────────────────────────────

const compressSchema = z.object({
  key: z.string().min(1),
  outputFileName: z.string().min(1),
});

utilityRoutes.post('/compress-pdf', async (c) => {
  const body = await c.req.json();
  const parsed = compressSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const obj = await c.env.R2.get(parsed.data.key);
  if (!obj) throw new NotFoundError(`Blob ${parsed.data.key} not found`);
  const inputBytes = new Uint8Array(await obj.arrayBuffer());
  const outputBytes = await compressPdf(inputBytes);
  const outputKey = buildStorageKey('utility/compressed', parsed.data.outputFileName);
  await uploadFile(c.env.R2, outputKey, outputBytes.buffer as ArrayBuffer, 'application/pdf', {
    kind: 'utility-compressed',
    inputBytes: String(inputBytes.byteLength),
    outputBytes: String(outputBytes.byteLength),
  });
  return c.json({
    key: outputKey,
    fileName: parsed.data.outputFileName,
    url: proxiedUrl(c.req.raw, outputKey),
    inputBytes: inputBytes.byteLength,
    outputBytes: outputBytes.byteLength,
    savingsPct: Math.max(0, Math.round((1 - outputBytes.byteLength / inputBytes.byteLength) * 100)),
  });
});

// ─── GET /utility/presigned-url ────────────────────────────────────────────

utilityRoutes.get('/presigned-url', async (c) => {
  const key = c.req.query('key');
  const modeParam = c.req.query('mode') ?? 'GET';
  const expiresIn = Number(c.req.query('expiresIn') ?? 300);
  if (!key) throw new ValidationError('Missing query param: key');
  if (modeParam !== 'GET' && modeParam !== 'PUT') {
    throw new ValidationError('mode must be GET or PUT');
  }
  if (!c.env.R2_ACCOUNT_ID || !c.env.R2_ACCESS_KEY_ID || !c.env.R2_SECRET_ACCESS_KEY) {
    throw new AppError(
      503,
      'R2 S3 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY secrets.',
      'R2_S3_NOT_CONFIGURED',
    );
  }
  const signed = await getPresignedUrl({
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucket: c.env.R2_BUCKET_NAME ?? 'curavend-uploads',
    key,
    expiresInSeconds: Math.min(86_400, Math.max(60, expiresIn)),
    mode: modeParam,
  });
  return c.json({ url: signed, key, mode: modeParam, expiresIn });
});

export default utilityRoutes;

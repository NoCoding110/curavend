/**
 * Consolidated order packet — merges all of an order's R2 attachments into
 * a single PDF and streams it to the client.
 *
 * Sources merged (in this order):
 *   1. Original order attachment (orders.original_order_attachment)
 *   2. Encounter attachment       (orders.encounter_attachment)
 *   3. orders.attachments         (JSON array)
 *   4. Delivery proof              (orders.delivery_sign_attachment)
 *
 * PDF inputs are page-copied; image inputs (PNG/JPG) get embedded on a new
 * Letter-size page. Unknown content types are skipped with a warning.
 *
 * Caching: merged bytes are stored in KV under
 *   `order_packet:{orderId}:{updatedAt}` with 5-minute TTL so repeated
 * downloads short-circuit reassembly.
 *
 * Audit: every successful download writes a `file_access_log` row with
 *   file_kind = 'ORDER_PACKET' (Phase B integration).
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { orders, fileAccessLog } from '@curavend/db';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { getDb } from '../lib/db';
import { downloadFile } from '../services/storageService';
import { AppError, NotFoundError, ForbiddenError } from '../lib/errors';
import { assertOrderAccess } from './orders';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

app.onError((err, c) => {
  const e = err as any;
  if (e && typeof e.statusCode === 'number' && typeof e.code === 'string') {
    return c.json({ error: e.message, code: e.code }, e.statusCode as any);
  }
  console.error('[order-pdf] Unhandled error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

const KV_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'order_packet:';

interface AttachmentRef {
  key: string;
  source: string;
}

function collectAttachmentKeys(order: any): AttachmentRef[] {
  const refs: AttachmentRef[] = [];

  if (order.originalOrderAttachment) {
    refs.push({ key: order.originalOrderAttachment, source: 'original_order' });
  }
  if (order.encounterAttachment) {
    refs.push({ key: order.encounterAttachment, source: 'encounter' });
  }
  if (order.attachments) {
    try {
      const arr = JSON.parse(order.attachments);
      if (Array.isArray(arr)) {
        arr.forEach((k: string, i: number) => {
          if (typeof k === 'string' && k) {
            refs.push({ key: k, source: `attachment[${i}]` });
          }
        });
      }
    } catch (err) {
      console.warn('[orderPdf] failed to parse orders.attachments JSON:', err);
    }
  }
  if (order.deliverySignAttachment) {
    refs.push({ key: order.deliverySignAttachment, source: 'delivery_proof' });
  }

  // De-duplicate by key, preserving first-seen order
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

function detectKind(contentType: string | undefined, key: string): 'pdf' | 'png' | 'jpg' | 'unknown' {
  const ct = (contentType ?? '').toLowerCase();
  const lower = key.toLowerCase();
  if (ct.includes('pdf') || lower.endsWith('.pdf')) return 'pdf';
  if (ct.includes('png') || lower.endsWith('.png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  return 'unknown';
}

async function buildPacket(
  r2: R2Bucket,
  attachmentRefs: AttachmentRef[],
): Promise<{ bytes: Uint8Array; assembled: number; skipped: AttachmentRef[] }> {
  const out = await PDFDocument.create();
  const skipped: AttachmentRef[] = [];
  let assembled = 0;

  for (const ref of attachmentRefs) {
    const obj = await downloadFile(r2, ref.key);
    if (!obj) {
      console.warn(`[orderPdf] missing R2 object: ${ref.key}`);
      skipped.push(ref);
      continue;
    }

    const buf = await obj.arrayBuffer();
    const kind = detectKind(obj.httpMetadata?.contentType, ref.key);

    try {
      if (kind === 'pdf') {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach((p) => out.addPage(p));
        assembled += copied.length;
      } else if (kind === 'png' || kind === 'jpg') {
        const img = kind === 'png'
          ? await out.embedPng(buf)
          : await out.embedJpg(buf);

        // Letter-size page (612 × 792 pt) — fit image into the page bounds
        const page = out.addPage([612, 792]);
        const { width: pw, height: ph } = page.getSize();
        const ratio = Math.min((pw - 40) / img.width, (ph - 40) / img.height, 1);
        const w = img.width * ratio;
        const h = img.height * ratio;
        page.drawImage(img, {
          x: (pw - w) / 2,
          y: (ph - h) / 2,
          width: w,
          height: h,
        });
        assembled += 1;
      } else {
        console.warn(`[orderPdf] skipping unknown content type for ${ref.key}`);
        skipped.push(ref);
      }
    } catch (err) {
      console.error(`[orderPdf] failed to add ${ref.key}:`, err);
      skipped.push(ref);
    }
  }

  const bytes = await out.save();
  return { bytes, assembled, skipped };
}

// ─── GET /orders/:id/packet.pdf ─────────────────────────────────────────────

app.get('/:id/packet.pdf', async (c) => {
  const user = c.get('user');
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const orderRow = await db.select().from(orders).where(eq(orders.id, id)).limit(1).then((r) => r[0]);
  if (!orderRow) throw new NotFoundError('Order not found');
  assertOrderAccess(user, orderRow);

  const refs = collectAttachmentKeys(orderRow);
  if (refs.length === 0) {
    throw new NotFoundError('No attachments to assemble for this order');
  }

  // KV cache key includes updatedAt so a new attachment busts the cache
  const cacheKey = `${CACHE_PREFIX}${id}:${orderRow.updatedAt ?? orderRow.createdAt}`;

  let bytes: ArrayBuffer | null = null;
  try {
    const cached = await c.env.KV.get(cacheKey, 'arrayBuffer');
    if (cached) bytes = cached;
  } catch (err) {
    console.warn('[orderPdf] KV cache read failed:', err);
  }

  if (!bytes) {
    const { bytes: built, assembled } = await buildPacket(c.env.R2, refs);
    if (assembled === 0) {
      throw new NotFoundError('No attachable files found (all skipped or missing)');
    }
    bytes = built.buffer.slice(built.byteOffset, built.byteOffset + built.byteLength) as ArrayBuffer;

    // Best-effort cache write
    try {
      await c.env.KV.put(cacheKey, bytes, { expirationTtl: KV_TTL });
    } catch (err) {
      console.warn('[orderPdf] KV cache write failed:', err);
    }
  }

  // Audit log via fileAccessLog (Phase B integration)
  const ipAddress =
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    null;
  const userAgent = c.req.header('User-Agent') ?? null;

  const logPromise = db.insert(fileAccessLog).values({
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    fileKey: cacheKey,
    fileKind: 'ORDER_PACKET',
    hospitalId: orderRow.hospitalId,
    vendorId: orderRow.vendorId,
    orderId: orderRow.id,
    ipAddress,
    userAgent,
    bytesServed: bytes.byteLength,
    httpStatus: 200,
  });

  if ((c as any).executionCtx?.waitUntil) {
    (c as any).executionCtx.waitUntil(logPromise);
  } else {
    await logPromise.catch((err) => {
      console.error('[orderPdf] audit log write failed:', err);
    });
  }

  const filename = `order-${orderRow.identifier ?? orderRow.id.slice(0, 8)}-packet.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
});

export default app;

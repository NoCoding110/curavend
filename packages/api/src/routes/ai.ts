import { Hono } from 'hono';
import { getDb } from '../lib/db';
import { orders, orderItems, orderHistory } from '@curavend/db';
import { ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';
import { AiService } from '../services/aiService';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

/**
 * POST /ai/parse-order
 *
 * Accepts a base64-encoded PDF or image of a medical order fax.
 * Uses Claude to extract patient and HCPC data, then creates an order.
 *
 * Body: { fileData: base64string, mediaType: string, hospitalId: string }
 */
app.post('/parse-order', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.fileData) throw new ValidationError('fileData is required');
  if (!body.hospitalId) throw new ValidationError('hospitalId is required');

  const validMediaTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  const mediaType = body.mediaType || 'application/pdf';
  if (!validMediaTypes.includes(mediaType)) {
    throw new ValidationError(`Invalid media type. Must be one of: ${validMediaTypes.join(', ')}`);
  }

  const aiService = new AiService(c.env.AI);

  const extracted = await aiService.extractOrderFromDocument(
    body.fileData,
    mediaType as any,
  );

  // Create the order from extracted data
  const db = getDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(orders).values({
    id,
    identifier: `ORD-${Date.now().toString(36).toUpperCase()}`,
    status: 'PENDING',
    orderSubStatus: 'NEW_ORDER',
    hospitalId: body.hospitalId,
    vendorId: body.vendorId || null,
    providerId: user.providerId || null,
    superVendorId: user.superVendorId || null,
    patientName: extracted.patientName || '',
    patientLastName: extracted.patientLastName || null,
    patientGender: extracted.patientGender || null,
    patientBirthDate: extracted.patientBirthDate || null,
    patientEmail: extracted.patientEmail || null,
    diagnosis: extracted.diagnosis || null,
    icd10: extracted.icd10 || null,
    extremity: extracted.extremity || null,
    department: extracted.department || null,
    insurance: extracted.insurance || null,
    insuranceId: extracted.insuranceId || null,
    authProvider: extracted.authProvider || null,
    refProvider: extracted.refProvider || null,
    priority: extracted.priority || 'routine',
    comment: extracted.comment || null,
    changedByUserId: user.id,
    orderSubStatusHistory: JSON.stringify([
      { status: 'NEW_ORDER', timestamp: now },
    ]),
    signDateTime: now,
    createdAt: now,
    updatedAt: now,
  });

  // Insert extracted order items
  if (extracted.orderItems?.length) {
    for (const item of extracted.orderItems) {
      await db.insert(orderItems).values({
        id: crypto.randomUUID(),
        orderId: id,
        code: item.code,
        description: item.description,
        quantity: item.quantity || 1,
        createdAt: now,
      });
    }
  }

  // Create initial history entry
  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId: id,
    description: 'Order created from AI-parsed document',
    changedByUserId: user.id,
    createdAt: now,
  });

  // Return the extracted data + created order ID for review
  return c.json({
    orderId: id,
    extracted,
    message: 'Order created from document. Please review and update if needed.',
  }, 201);
});

/**
 * POST /ai/extract-only
 *
 * Like parse-order but only returns extracted data without creating an order.
 * Useful for previewing before confirming.
 *
 * Body: { fileData: base64string, mediaType: string }
 */
const VALID_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

app.post('/extract-only', async (c) => {
  const body = await c.req.json();

  if (!body.fileData) throw new ValidationError('fileData is required');

  const mediaType = body.mediaType || 'image/png';
  if (!VALID_MEDIA_TYPES.includes(mediaType)) {
    throw new ValidationError(`Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(', ')}`);
  }

  const aiService = new AiService(c.env.AI);

  const extracted = await aiService.extractOrderFromDocument(
    body.fileData,
    mediaType as any,
  );

  return c.json({ extracted });
});

export default app;

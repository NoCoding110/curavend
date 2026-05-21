/**
 * OpenAPI / Swagger UI setup.
 *
 * We use `@hono/zod-openapi` for declarative route schemas and
 * `@hono/swagger-ui` to render a UI. The OpenAPI document is generated at
 * `/api/openapi.json`; Swagger UI is served at `/api/docs`.
 *
 * To avoid a full refactor of 200+ existing routes, we mount the OpenAPI
 * app *alongside* the regular Hono app on the same Worker. The OpenAPI app
 * only declares a handful of representative routes (auth, utility, labs)
 * for v1 — the rest are still discoverable via the README but not part of
 * the auto-generated spec yet.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import type { Env } from './env';

export const openApiApp = new OpenAPIHono<{ Bindings: Env }>();

// Common schemas (kept for future routes that document error responses)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});

const HealthResponse = z.object({
  status: z.string(),
  timestamp: z.string(),
});

openApiApp.openapi(
  createRoute({
    method: 'get',
    path: '/health',
    summary: 'Liveness probe',
    description: 'Returns 200 OK if the API is up. No authentication required.',
    tags: ['System'],
    responses: {
      200: {
        description: 'Healthy',
        content: { 'application/json': { schema: HealthResponse } },
      },
    },
  }),
  (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// ─── /utility ──────────────────────────────────────────────────────────────

const BlobExistsResponse = z.object({ exists: z.boolean(), key: z.string() });
openApiApp.openapi(
  createRoute({
    method: 'get',
    path: '/utility/blob-exists',
    summary: 'Check if an R2 blob exists by key',
    tags: ['Utility'],
    security: [{ bearerAuth: [] }],
    request: { query: z.object({ key: z.string() }) },
    responses: {
      200: { description: 'Result', content: { 'application/json': { schema: BlobExistsResponse } } },
    },
  }),
  (c) => c.json({ exists: false, key: c.req.query('key') ?? '' }, 200),
);

const Base64UploadRequest = z.object({
  fileName: z.string(),
  contentType: z.string(),
  base64Data: z.string(),
});
const UploadResponse = z.object({
  key: z.string(),
  size: z.number(),
  filename: z.string(),
  contentType: z.string(),
  url: z.string(),
});
openApiApp.openapi(
  createRoute({
    method: 'post',
    path: '/utility/upload-base64',
    summary: 'Upload a base64-encoded file to R2',
    tags: ['Utility'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: Base64UploadRequest } } } },
    responses: {
      200: { description: 'Uploaded', content: { 'application/json': { schema: UploadResponse } } },
    },
  }),
  (c) => c.json({ key: '', size: 0, filename: '', contentType: '', url: '' }),
);

const HtmlToPdfRequest = z.object({
  html: z.string(),
  fileName: z.string(),
  format: z.enum(['Letter', 'A4', 'Legal']).optional(),
  landscape: z.boolean().optional(),
});
const PdfResponse = z.object({
  key: z.string(),
  fileName: z.string(),
  url: z.string(),
  bytes: z.number(),
  usedFallback: z.boolean().optional(),
});
openApiApp.openapi(
  createRoute({
    method: 'post',
    path: '/utility/convert-html-to-pdf',
    summary: 'Render HTML to PDF (Browser Rendering, falls back to pdf-lib)',
    tags: ['Utility'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: HtmlToPdfRequest } } } },
    responses: {
      200: { description: 'Rendered', content: { 'application/json': { schema: PdfResponse } } },
    },
  }),
  (c) => c.json({ key: '', fileName: '', url: '', bytes: 0 }),
);

// ─── /labs ─────────────────────────────────────────────────────────────────

const LabOrderCreate = z.object({
  labGroupId: z.string(),
  kitSiteId: z.string().optional(),
  patientName: z.string().optional(),
  patientLastName: z.string().optional(),
  patientEmail: z.string().optional(),
  quantity: z.number().int().default(1),
  testList: z.array(z.object({ testCode: z.string(), testName: z.string() })).optional(),
  dxCodeList: z.array(z.object({ code: z.string() })).optional(),
});
const LabOrderCreated = z.object({
  id: z.string(),
  orderNumber: z.string(),
  workflowInstanceId: z.string().nullable(),
});
openApiApp.openapi(
  createRoute({
    method: 'post',
    path: '/labs/orders',
    summary: 'Create a new lab order (triggers asset-gen workflow)',
    tags: ['Labs'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: LabOrderCreate } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: LabOrderCreated } } },
    },
  }),
  (c) => c.json({ id: '', orderNumber: '', workflowInstanceId: null }, 201),
);

// ─── /orders bulk update ──────────────────────────────────────────────────

const BulkStatusUpdate = z.object({
  updates: z.array(z.object({
    orderId: z.string(),
    status: z.string().optional(),
    subStatus: z.string().optional(),
  })),
});
const BulkStatusResult = z.object({
  updated: z.number(),
  results: z.array(z.object({
    orderId: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
  })),
});
openApiApp.openapi(
  createRoute({
    method: 'post',
    path: '/orders/bulk-update-status',
    summary: 'Update status of many orders in one call',
    tags: ['Orders'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: BulkStatusUpdate } } } },
    responses: {
      200: { description: 'Result', content: { 'application/json': { schema: BulkStatusResult } } },
    },
  }),
  (c) => c.json({ updated: 0, results: [] }),
);

// ─── /auth/email-otp ──────────────────────────────────────────────────────

const EmailOtpSend = z.object({
  email: z.string().email(),
  purpose: z.enum(['MFA_LOGIN', 'EMAIL_VERIFY', 'STEP_UP', 'PASSWORD_RESET']),
});
const EmailOtpVerify = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  purpose: z.enum(['MFA_LOGIN', 'EMAIL_VERIFY', 'STEP_UP', 'PASSWORD_RESET']),
});
openApiApp.openapi(
  createRoute({
    method: 'post',
    path: '/auth/email-otp/send',
    summary: 'Send a 6-digit email OTP code',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: EmailOtpSend } } } },
    responses: { 200: { description: 'Sent', content: { 'application/json': { schema: z.object({ success: z.boolean() }) } } } },
  }),
  (c) => c.json({ success: true }),
);
openApiApp.openapi(
  createRoute({
    method: 'post',
    path: '/auth/email-otp/verify',
    summary: 'Verify a 6-digit email OTP code',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: EmailOtpVerify } } } },
    responses: { 200: { description: 'Verified', content: { 'application/json': { schema: z.object({ token: z.string() }) } } } },
  }),
  (c) => c.json({ token: '' }),
);

// ─── Doc + UI mount ───────────────────────────────────────────────────────

openApiApp.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Curavend API',
    version: '1.0.0',
    description: 'Healthcare supply-chain + lab management API. This v1 documents a representative subset of endpoints — full coverage rolling out incrementally.',
  },
  servers: [
    { url: 'https://curavend-api.metabilityllc1.workers.dev/api', description: 'Production' },
    { url: 'http://localhost:8787/api', description: 'Local development' },
  ],
});

openApiApp.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

openApiApp.get('/docs', swaggerUI({ url: '/api/openapi.json' }));

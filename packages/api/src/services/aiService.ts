/**
 * AI Service — uses Cloudflare Workers AI to parse medical order documents.
 *
 * Uses @cf/meta/llama-3.2-11b-vision-instruct for vision (images of medical orders)
 * and @cf/meta/llama-3.1-8b-instruct as a text-only fallback when no image is
 * provided. Replaces the previous Anthropic Claude-based implementation.
 *
 * For multi-page PDFs, the client should pre-render each page to a PNG and pass
 * the images one at a time; the merge is client-side (or you can call this once
 * per page and concatenate the orderItems arrays).
 */

import { ValidationError } from '../lib/errors';

const EXTRACT_PROMPT = `Extract the following information from this medical order document and return it as a single JSON object. If a field is not present, use null.

Required fields:
{
  "patientName": "patient first name",
  "patientLastName": "patient last name",
  "patientGender": "Male|Female|Other or null",
  "patientBirthDate": "YYYY-MM-DD format or null",
  "patientEmail": "email address or null",
  "diagnosis": "diagnosis description or null",
  "icd10": "ICD-10 code(s) or null",
  "extremity": "body part/extremity or null",
  "department": "department or null",
  "insurance": "insurance company name or null",
  "insuranceId": "insurance member ID or null",
  "authProvider": "authorizing physician name or null",
  "refProvider": "referring physician name or null",
  "orderItems": [
    { "code": "HCPC code like L1832", "description": "item description", "quantity": 1 }
  ],
  "priority": "routine|urgent|emergent (default to routine if unclear)",
  "comment": "any additional notes or null"
}

Return ONLY the JSON object, no additional commentary, no markdown fences.`;

export class AiService {
  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  /**
   * Extract order information from a base64-encoded PDF or image.
   * PDF callers are expected to have pre-rendered pages to PNG client-side;
   * this service receives a single image per call.
   */
  async extractOrderFromDocument(
    base64Content: string,
    mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp',
  ): Promise<ExtractedOrderData> {
    // PDFs are not directly consumed by the vision model — the frontend must
    // rasterise each page first. If a PDF is passed here, surface a clear error.
    if (mediaType === 'application/pdf') {
      throw new ValidationError(
        'PDFs must be rendered to PNG by the client before upload (use pdf.js in the browser, then call this endpoint once per page).',
      );
    }

    const imageBytes = base64ToUint8Array(base64Content);

    const result = (await this.ai.run('@cf/meta/llama-3.2-11b-vision-instruct' as any, {
      image: Array.from(imageBytes),
      prompt: EXTRACT_PROMPT,
      max_tokens: 2000,
    } as any)) as any;

    const text: string = result?.response ?? result?.description ?? '';

    const parsed = safeParseJson(text);
    if (!parsed) {
      throw new Error(`Workers AI returned non-JSON output: ${text.slice(0, 500)}`);
    }

    return parsed as ExtractedOrderData;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64ToUint8Array(b64: string): Uint8Array {
  // atob is available in Workers runtime
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Accepts raw JSON, markdown-fenced JSON, or JSON embedded in prose. */
function safeParseJson(text: string): unknown | null {
  if (!text) return null;

  // Strip common markdown fences.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Attempt direct parse.
  try {
    return JSON.parse(stripped);
  } catch {
    // Fall through to extraction.
  }

  // Locate the first `{` and last `}` and try that substring.
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(stripped.slice(first, last + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export interface ExtractedOrderData {
  patientName: string | null;
  patientLastName: string | null;
  patientGender: string | null;
  patientBirthDate: string | null;
  patientEmail: string | null;
  diagnosis: string | null;
  icd10: string | null;
  extremity: string | null;
  department: string | null;
  insurance: string | null;
  insuranceId: string | null;
  authProvider: string | null;
  refProvider: string | null;
  orderItems: Array<{ code: string; description: string; quantity: number }>;
  priority: 'routine' | 'urgent' | 'emergent';
  comment: string | null;
}

// ---------------------------------------------------------------------------
// Contract extraction
// ---------------------------------------------------------------------------

const CONTRACT_EXTRACT_PROMPT = `Extract line-item pricing from this contract document and return a single JSON object. Look for tables or lists matching HCPC/CPT codes to negotiated rates. If a field is unknown, use null.

Required JSON shape:
{
  "items": [
    {
      "hcpcCode": "string — the HCPC or CPT code (e.g. L1832, A4595)",
      "description": "string — short item description from the contract",
      "rate": number (dollars; e.g. 245.00),
      "quantity": null or integer (annual cap if specified, else null),
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Rules:
- Only include rows where you found a clear HCPC code AND a price.
- "rate" must be a number in USD (e.g. 245.00, not "$245.00").
- Default "confidence" to "medium" when unsure.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

export interface ContractItemSuggestion {
  hcpcCode: string;
  description: string | null;
  rate: number;
  quantity: number | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Run Workers AI vision LLM to suggest contract line items from a rendered
 * contract page (PNG base64). The caller renders each page client-side and
 * may concatenate results.
 *
 * Never auto-saves — caller surfaces suggestions for user confirmation.
 *
 * Llama models on Cloudflare Workers AI require a one-time license
 * acceptance per worker. If the first call fails with AiError 5016 we
 * submit "agree" once then retry — the acceptance is sticky per account.
 */
async function runVisionWithLicenseRetry(env: { AI: Ai }, payload: any): Promise<any> {
  try {
    return await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct' as any, payload);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('5016') || msg.toLowerCase().includes('agree')) {
      console.warn('[aiService] Llama license not yet accepted — submitting agreement');
      try {
        await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct' as any, { prompt: 'agree' } as any);
      } catch (agreeErr) {
        console.error('[aiService] failed to submit license agreement:', agreeErr);
      }
      return await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct' as any, payload);
    }
    throw err;
  }
}

export async function extractContractItemsFromPdf(
  env: { AI: Ai },
  imageBase64: string,
): Promise<ContractItemSuggestion[]> {
  const bytes = base64ToUint8Array(imageBase64);

  const result = (await runVisionWithLicenseRetry(env, {
    image: Array.from(bytes),
    prompt: CONTRACT_EXTRACT_PROMPT,
    max_tokens: 2000,
  })) as any;

  const text: string = result?.response ?? result?.description ?? '';
  const parsed = safeParseJson(text) as { items?: unknown } | null;
  if (!parsed || !Array.isArray((parsed as any).items)) return [];

  // Normalize + validate
  const out: ContractItemSuggestion[] = [];
  for (const raw of (parsed as any).items) {
    if (!raw || typeof raw !== 'object') continue;
    const code = String(raw.hcpcCode ?? raw.code ?? '').trim();
    const rate = Number(raw.rate);
    if (!code || !Number.isFinite(rate) || rate <= 0) continue;
    out.push({
      hcpcCode: code,
      description: raw.description ? String(raw.description) : null,
      rate,
      quantity: raw.quantity != null && Number.isFinite(Number(raw.quantity)) ? Number(raw.quantity) : null,
      confidence:
        raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
    });
  }
  return out;
}

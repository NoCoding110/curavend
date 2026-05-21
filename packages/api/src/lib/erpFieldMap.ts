/**
 * erpFieldMap.ts — transform a Curavend order into a vendor's ERP shape via
 * a JSON field-path config. Pure functions; no external dependencies.
 *
 * Two path forms supported:
 *
 *   Source paths (read from order context):
 *     "order.identifier"         → ctx.order.identifier
 *     "vendor.erpAccountNumber"  → ctx.vendor.erpAccountNumber
 *     "items[].vendorSku"        → ctx.items.map(i => i.vendorSku)
 *     "patient.address.street"   → ctx.patient?.address?.street
 *     literal:"FIXED_VAL"        → the literal string "FIXED_VAL" (no lookup)
 *
 *   Destination paths (written into the output):
 *     "salesOrder.customerNumber"          → out.salesOrder.customerNumber = …
 *     "salesOrder.lines[].sku"             → out.salesOrder.lines = [{sku: …}, …]
 *     "salesOrder.lines[].qty"             → merges into the same lines array
 *
 * Array-mapping rule: if BOTH source and destination contain `[].`, every
 *   source element is mapped to one destination element. Source path before
 *   `[].` selects the array; remainder of the source path is read off each
 *   element. Destination remainder writes into the corresponding element.
 *
 * Example field map:
 *   {
 *     "salesOrder.customerNumber": "vendor.erpAccountNumber",
 *     "salesOrder.poNumber":       "order.purchaseOrderNumber",
 *     "salesOrder.facilityName":   "hospital.name",
 *     "salesOrder.shipToZip":      "facility.zip",
 *     "salesOrder.notes":          "literal:Created by Curavend",
 *     "salesOrder.lines[].sku":    "items[].vendorSku",
 *     "salesOrder.lines[].qty":    "items[].packQuantity",
 *     "salesOrder.lines[].hcpc":   "items[].hcpcCode",
 *   }
 */

export interface ErpTransformContext {
  order: any;
  vendor: any;
  hospital: any;
  facility: any;
  patient: any;
  items: any[];
  meta?: Record<string, unknown>;
}

const LITERAL_PREFIX = 'literal:';

/** Read a dot-path off an object (no `[]` support — use applyFieldMap for that). */
function readPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  if (path.startsWith(LITERAL_PREFIX)) return path.slice(LITERAL_PREFIX.length);

  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Set a dot-path on a destination object, creating intermediate keys. */
function writePath(out: any, path: string, value: any): void {
  if (!path) return;
  const parts = path.split('.');
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Apply a field-map to a transform context. Returns the assembled output.
 *
 * Throws if a destination path uses `[]` but the corresponding source path
 * does not (or vice versa) — array-mapping must be symmetric.
 */
export function applyFieldMap(
  fieldMap: Record<string, string>,
  ctx: ErpTransformContext,
): Record<string, unknown> {
  const out: Record<string, any> = {};

  for (const [destPath, sourcePath] of Object.entries(fieldMap)) {
    const destHasArray = destPath.includes('[].');
    const srcHasArray = sourcePath.includes('[].');

    if (destHasArray !== srcHasArray) {
      throw new Error(
        `Field-map mismatch: source "${sourcePath}" and destination "${destPath}" must both use [] or neither`,
      );
    }

    if (!destHasArray) {
      // Scalar copy
      writePath(out, destPath, readPath(ctx, sourcePath));
      continue;
    }

    // Array mapping: source = "items[].vendorSku" → destination = "salesOrder.lines[].sku"
    const [srcArrayPath, srcSuffix] = sourcePath.split('[].');
    const [destArrayPath, destSuffix] = destPath.split('[].');

    const arr = readPath(ctx, srcArrayPath);
    if (!Array.isArray(arr)) {
      // No source array → write empty array (vendor must accept this)
      writePath(out, destArrayPath, []);
      continue;
    }

    // Build / extend the destination array
    let existing: any[] = readPath(out, destArrayPath);
    if (!Array.isArray(existing)) {
      existing = [];
      writePath(out, destArrayPath, existing);
    }

    arr.forEach((src, i) => {
      const value = srcSuffix ? readPath(src, srcSuffix) : src;
      if (!existing[i] || typeof existing[i] !== 'object') existing[i] = {};
      if (destSuffix) writePath(existing[i], destSuffix, value);
      else existing[i] = value;
    });
  }

  return out;
}

/** Truncate a string to N bytes — keeps audit log rows compact. */
export function truncateForLog(text: string, maxBytes = 4096): string {
  if (!text) return '';
  if (text.length <= maxBytes) return text;
  return text.slice(0, maxBytes - 1) + '…';
}

/** Compute HMAC-SHA256 hex signature using the Web Crypto API. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

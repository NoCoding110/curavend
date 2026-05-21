/**
 * Carrier registry — tracking URL templates per shipping provider.
 *
 * Each entry holds a URL template with `{tracking}` placeholder that
 * `trackingUrl(code, number)` substitutes. Per-vendor overrides come from
 * `vendors.trackingUrlTemplate`.
 */

export interface Carrier {
  code: string;
  name: string;
  trackingUrlTemplate: string;
}

export const CARRIERS: Record<string, Carrier> = {
  USPS: {
    code: 'USPS',
    name: 'USPS',
    trackingUrlTemplate: 'https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}',
  },
  UPS: {
    code: 'UPS',
    name: 'UPS',
    trackingUrlTemplate: 'https://www.ups.com/track?tracknum={tracking}',
  },
  FEDEX: {
    code: 'FEDEX',
    name: 'FedEx',
    trackingUrlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={tracking}',
  },
  DHL: {
    code: 'DHL',
    name: 'DHL',
    trackingUrlTemplate: 'https://www.dhl.com/us-en/home/tracking.html?tracking-id={tracking}',
  },
  ONTRAC: {
    code: 'ONTRAC',
    name: 'OnTrac',
    trackingUrlTemplate: 'https://www.ontrac.com/tracking?number={tracking}',
  },
  OTHER: {
    code: 'OTHER',
    name: 'Other',
    trackingUrlTemplate: '',
  },
  NONE: {
    code: 'NONE',
    name: 'No carrier',
    trackingUrlTemplate: '',
  },
};

/** Returns the public tracking URL for a (carrier, trackingNumber) pair, or null. */
export function trackingUrl(
  carrierCode: string | null | undefined,
  trackingNumber: string | null | undefined,
  vendorOverrideTemplate?: string | null,
): string | null {
  if (!trackingNumber) return null;
  const template = vendorOverrideTemplate?.trim() || CARRIERS[carrierCode ?? '']?.trackingUrlTemplate;
  if (!template) return null;
  return template.replace('{tracking}', encodeURIComponent(trackingNumber));
}

export function isValidCarrierCode(code: string | null | undefined): boolean {
  return !!code && Object.prototype.hasOwnProperty.call(CARRIERS, code);
}

export function listCarriers(): Array<{ code: string; name: string }> {
  return Object.values(CARRIERS)
    .filter((c) => c.code !== 'NONE')
    .map((c) => ({ code: c.code, name: c.name }));
}

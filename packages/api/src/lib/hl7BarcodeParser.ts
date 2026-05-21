/**
 * HL7 v2.x PDF417 barcode parser.
 *
 * LabCorp at-home kits embed an HL7 v2.x pipe-delimited segment in a PDF417
 * barcode. The format Medzah parses uses a `P|` segment marker (vs the
 * standard `PID|`). This parser is fault-tolerant: on any malformed input
 * it returns `null` rather than throwing.
 *
 * Common fields (Medzah's mapping for the `P|` segment):
 *   field 13 = patient street
 *   field 14 = city
 *   field 15 = state
 *   field 16 = zip
 *   field 17 = phone
 *   field 22 = guarantor street (used to extract address line 2)
 *
 * For standard `PID|` segments (HL7 v2.5 PID segment), we also support:
 *   field 11 = patient address (^-delimited components: street, _, city, state, zip)
 */

export interface ParsedPatientFromBarcode {
  segmentType: 'P' | 'PID' | 'OTHER';
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  name?: string;
  dob?: string; // YYYYMMDD
  gender?: string;
  raw: Record<string, string>;
}

/**
 * Parse a barcode string OR raw bytes. Returns null on bad input.
 */
export function parseHl7Barcode(input: string | Uint8Array): ParsedPatientFromBarcode | null {
  let text: string;
  try {
    text = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);
  } catch {
    return null;
  }
  if (!text) return null;

  // HL7 messages are CR-separated; tolerate \r\n too
  const segments = text.split(/\r\n|\r|\n/).filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  // Find the patient segment — prefer P|, fall back to PID|
  let segment = segments.find((s) => s.startsWith('P|') || s.startsWith('P^'));
  let segmentType: ParsedPatientFromBarcode['segmentType'] = 'P';
  if (!segment) {
    segment = segments.find((s) => s.startsWith('PID|'));
    if (segment) segmentType = 'PID';
  }
  if (!segment) {
    // Last resort: just take the first segment and treat as OTHER
    segment = segments[0];
    segmentType = 'OTHER';
  }

  const fields = segment.split('|');
  const raw: Record<string, string> = {};
  for (let i = 0; i < fields.length; i++) raw[String(i)] = fields[i];

  if (segmentType === 'P' || segmentType === 'OTHER') {
    // Medzah P| mapping: fields 13–17 are address/phone, field 22 is guarantor street
    const street = fields[13]?.trim() || undefined;
    const city = fields[14]?.trim() || undefined;
    const state = fields[15]?.trim() || undefined;
    const zip = fields[16]?.trim() || undefined;
    const phone = fields[17]?.trim() || undefined;
    const guarantorStreet = fields[22]?.trim() || '';
    // If guarantor street starts with patient street, the remainder is line 2
    let street2: string | undefined;
    if (street && guarantorStreet && guarantorStreet.startsWith(street)) {
      const tail = guarantorStreet.slice(street.length).trim();
      if (tail) street2 = tail;
    }
    return {
      segmentType: 'P',
      street,
      street2,
      city,
      state,
      zip,
      phone,
      raw,
    };
  }

  // PID| segment — standard HL7
  const pidAddress = fields[11] ?? '';
  const parts = pidAddress.split('^').map((p) => p.trim());
  // Standard PID-11 layout: street ^ otherDesignation ^ city ^ state ^ zip
  const street = parts[0] || undefined;
  const street2 = parts[1] || undefined;
  const city = parts[2] || undefined;
  const state = parts[3] || undefined;
  const zip = parts[4] || undefined;
  const phone = fields[13]?.split('^')[0]?.trim() || undefined;
  const nameField = fields[5] ?? '';
  const nameParts = nameField.split('^').map((p) => p.trim());
  const name = nameParts.length
    ? [nameParts[1], nameParts[0]].filter(Boolean).join(' ')
    : undefined;
  const dob = fields[7]?.trim() || undefined;
  const gender = fields[8]?.trim() || undefined;

  return {
    segmentType: 'PID',
    street,
    street2,
    city,
    state,
    zip,
    phone,
    name,
    dob,
    gender,
    raw,
  };
}

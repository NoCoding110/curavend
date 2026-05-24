/**
 * DWO (Detailed Written Order) HTML template.
 *
 * Renders a Medicare-compliant Detailed Written Order from an order's data.
 * Required DWO elements per CMS:
 *   1. Beneficiary name
 *   2. Detailed description of items (with HCPC + quantity + frequency)
 *   3. Treating practitioner name + NPI
 *   4. Date of order
 *   5. Practitioner's signature (e-sig or wet-sig)
 *   6. Reason for need (clinical indication)
 *   7. Length of need (months, 99 = lifetime)
 *
 * Output: a complete HTML document suitable for renderHtmlToPdf().
 */

interface DwoOrderItem {
  code: string | null;
  description: string | null;
  quantity: number | null;
}

interface DwoData {
  orderIdentifier: string;
  orderDate: string;        // ISO

  // Patient
  patientName: string;
  patientDob: string | null;
  patientAddress: string | null;
  patientPhone: string | null;

  // Clinician
  prescriberName: string | null;
  prescriberNpi: string | null;
  prescriberPhone: string | null;
  prescriberSignedDate: string | null;
  prescriberSignatureLine: string | null;  // text rendered on the signature line

  // E-signature (image embedded as base64 data URL)
  signatureDataUrl?: string | null;
  signatureSignedByName?: string | null;
  signatureSignedByNpi?: string | null;

  // Order
  items: DwoOrderItem[];
  diagnosis: string | null;
  icd10: string | null;
  lengthOfNeedMonths: number | null;
  careSetting: string | null;
  clinicalIndication: string | null;

  // Hospital + payor
  hospitalName: string | null;
  payorName: string | null;
  payorMemberId: string | null;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '________________';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function renderDwoHtml(d: DwoData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Detailed Written Order — ${escapeHtml(d.orderIdentifier)}</title>
<style>
  @page { size: Letter; margin: 0.75in; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #222;
    line-height: 1.45;
  }
  header { border-bottom: 2px solid #1BAEE5; padding-bottom: 12px; margin-bottom: 16px; }
  header h1 { font-size: 18pt; margin: 0; }
  header .subtitle { color: #555; font-size: 10pt; margin-top: 4px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 10pt; color: #555; }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  section h2 {
    font-size: 12pt; background: #f4f4f4; padding: 6px 10px; margin: 0 0 8px 0;
    border-left: 4px solid #1BAEE5;
  }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 4px 8px; vertical-align: top; }
  table.kv td.label { width: 30%; color: #555; font-weight: 600; }
  table.items { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  table.items th, table.items td {
    border: 1px solid #ccc; padding: 6px 8px; text-align: left;
  }
  table.items th { background: #f4f4f4; }
  .signature-block { margin-top: 32px; }
  .signature-line {
    display: inline-block; border-bottom: 1px solid #222; min-width: 320px;
    padding-bottom: 2px; min-height: 22px;
  }
  .sig-italic { font-style: italic; color: #444; }
  .footer-note {
    margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd;
    font-size: 9pt; color: #666;
  }
</style>
</head>
<body>

<header>
  <h1>DETAILED WRITTEN ORDER (DWO)</h1>
  <div class="subtitle">CMS-compliant Standard Written Order for Durable Medical Equipment</div>
</header>

<div class="meta-row">
  <div>Order #: <strong>${escapeHtml(d.orderIdentifier)}</strong></div>
  <div>Order date: <strong>${fmtDate(d.orderDate)}</strong></div>
  <div>Issuing facility: <strong>${escapeHtml(d.hospitalName)}</strong></div>
</div>

<section>
  <h2>1. Beneficiary (Patient) Information</h2>
  <table class="kv">
    <tr><td class="label">Name</td><td>${escapeHtml(d.patientName)}</td></tr>
    <tr><td class="label">Date of birth</td><td>${fmtDate(d.patientDob)}</td></tr>
    <tr><td class="label">Address</td><td>${escapeHtml(d.patientAddress)}</td></tr>
    <tr><td class="label">Phone</td><td>${escapeHtml(d.patientPhone)}</td></tr>
    <tr><td class="label">Insurance</td><td>${escapeHtml(d.payorName)}${d.payorMemberId ? ' — Member ID ' + escapeHtml(d.payorMemberId) : ''}</td></tr>
  </table>
</section>

<section>
  <h2>2. Items Ordered</h2>
  <table class="items">
    <thead>
      <tr><th style="width:90px">HCPC</th><th>Description</th><th style="width:90px">Quantity</th></tr>
    </thead>
    <tbody>
      ${d.items.length === 0
        ? '<tr><td colspan="3"><em>No items on order</em></td></tr>'
        : d.items
            .map(
              (it) => `<tr>
              <td>${escapeHtml(it.code)}</td>
              <td>${escapeHtml(it.description)}</td>
              <td>${it.quantity ?? ''}</td>
            </tr>`,
            )
            .join('')}
    </tbody>
  </table>
</section>

<section>
  <h2>3. Clinical Information</h2>
  <table class="kv">
    <tr><td class="label">Primary diagnosis</td><td>${escapeHtml(d.diagnosis)}</td></tr>
    <tr><td class="label">ICD-10</td><td>${escapeHtml(d.icd10)}</td></tr>
    <tr><td class="label">Clinical indication</td><td>${escapeHtml(d.clinicalIndication)}</td></tr>
    <tr><td class="label">Care setting</td><td>${escapeHtml(d.careSetting)}</td></tr>
    <tr><td class="label">Length of need</td><td>${
      d.lengthOfNeedMonths == null
        ? '________________'
        : d.lengthOfNeedMonths >= 99
        ? 'Lifetime (99 months)'
        : d.lengthOfNeedMonths + ' months'
    }</td></tr>
  </table>
</section>

<section>
  <h2>4. Prescribing Practitioner</h2>
  <table class="kv">
    <tr><td class="label">Name</td><td>${escapeHtml(d.prescriberName)}</td></tr>
    <tr><td class="label">NPI</td><td>${escapeHtml(d.prescriberNpi)}</td></tr>
    <tr><td class="label">Phone</td><td>${escapeHtml(d.prescriberPhone)}</td></tr>
  </table>
</section>

<section class="signature-block">
  <h2>5. Practitioner Signature</h2>
  <p>I certify that the items listed above are medically necessary for this patient.</p>
  ${
    d.signatureDataUrl
      ? `<div style="margin-top: 12px; padding: 8px; border: 1px solid #e1e4e8; border-radius: 4px; max-width: 360px;">
           <img src="${escapeHtml(d.signatureDataUrl)}" alt="Signature" style="max-height:80px; max-width:340px; display:block;" />
         </div>
         <p style="margin-top: 8px;">
           <strong>${escapeHtml(d.signatureSignedByName ?? d.prescriberSignatureLine ?? '')}</strong>
           ${d.signatureSignedByNpi ? `  ·  NPI ${escapeHtml(d.signatureSignedByNpi)}` : ''}
         </p>
         <p>Date signed: <strong>${fmtDate(d.prescriberSignedDate)}</strong></p>`
      : `<p style="margin-top: 24px;">
           Signature: <span class="signature-line">${
             d.prescriberSignatureLine
               ? '<span class="sig-italic">' + escapeHtml(d.prescriberSignatureLine) + '</span>'
               : ''
           }</span>
         </p>
         <p>Date signed: <span class="signature-line">${fmtDate(d.prescriberSignedDate)}</span></p>`
  }
</section>

<div class="footer-note">
  Generated by Curavend on ${new Date().toLocaleDateString('en-US')}.
  This document satisfies CMS Standard Written Order (SWO) and Detailed Written Order (DWO) requirements
  per 42 CFR §410.38 when signed by the treating practitioner.
</div>

</body>
</html>`;
}

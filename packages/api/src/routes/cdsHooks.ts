/**
 * CDS Hooks — Clinical Decision Support endpoints.
 * Spec: https://cds-hooks.org/
 *
 * These endpoints MUST be public (no auth) per the CDS Hooks spec.
 *
 * Two hooks are exposed:
 *   - `order-select`  → fires when a clinician selects a draft order in Epic.
 *                       Surfaces DME catalog matches + Medicare fee.
 *   - `order-sign`    → fires when a clinician signs a set of orders.
 *                       Surfaces the prepared Curavend DWO/claim-bundle path
 *                       and offers a one-click "Create DWO in Curavend" link.
 *
 * Works with or without Epic configuration; Epic config enables richer context.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env }>();

const SERVICE_ID_SELECT = 'curavend-dme';
const SERVICE_ID_SIGN = 'curavend-order-sign';

/** Match HCPCS (letter + 4 digits) — e.g. E0470, K0823. */
const HCPCS_RE = /^[A-Z]\d{4}/;

// ─── GET /cds-services ────────────────────────────────────────────────────────
// CDS Hooks discovery endpoint — lists available services.
app.get('/cds-services', (c) => {
  return c.json({
    services: [
      {
        hook: 'order-select',
        title: 'Curavend DME Matching',
        description:
          'Suggests DME products and fee schedule rates when a clinician selects a service request or order.',
        id: SERVICE_ID_SELECT,
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
          serviceRequest:
            'ServiceRequest/{{context.draftOrders.entry[0].resource.id}}',
        },
      },
      {
        hook: 'order-sign',
        title: 'Curavend DWO Capture',
        description:
          'When a clinician signs DME orders, surface a one-click link to generate the Detailed Written Order (DWO) and claim bundle in Curavend.',
        id: SERVICE_ID_SIGN,
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
    ],
  });
});

/**
 * Extract HCPCS codes from the draftOrders entry list. Looks at both
 * `resource.code.coding[]` and `resource.orderDetail[].coding[]`.
 */
function extractHcpcs(draftOrders: any[]): string[] {
  const codes: string[] = [];
  for (const entry of draftOrders) {
    const resource = entry.resource ?? {};
    for (const detail of resource.orderDetail ?? []) {
      for (const coding of detail.coding ?? []) {
        if (coding.code && HCPCS_RE.test(coding.code)) codes.push(coding.code);
      }
    }
    for (const coding of resource.code?.coding ?? []) {
      if (coding.code && HCPCS_RE.test(coding.code)) codes.push(coding.code);
    }
  }
  return codes;
}

// ─── POST /cds-services/curavend-dme  (order-select) ─────────────────────────
app.post(`/cds-services/${SERVICE_ID_SELECT}`, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ cards: [] });
  }

  const cards: any[] = [];
  const context = body.context ?? {};
  const draftOrders = context.draftOrders?.entry ?? [];
  const hcpcCodes = extractHcpcs(draftOrders);

  // ── Look up matching items in Curavend catalog ──────────────────────────
  if (hcpcCodes.length > 0) {
    try {
      const uniqueCodes = [...new Set(hcpcCodes)].slice(0, 5); // cap at 5

      for (const code of uniqueCodes) {
        // Check inventory + fee in one shot
        const itemRow = await c.env.DB.prepare(
          `SELECT ii.description, ii.manufacturer_name, mfsi.non_rural_rate
           FROM inventory_items ii
           LEFT JOIN medicare_fee_schedule_items mfsi ON mfsi.hcpc_code = ii.hcpc_code
           WHERE ii.hcpc_code = ?
           LIMIT 1`,
        )
          .bind(code)
          .first<{
            description: string;
            manufacturer_name: string;
            non_rural_rate: number | null;
          }>();

        if (itemRow) {
          const rateText =
            itemRow.non_rural_rate != null
              ? ` | Medicare rate: $${itemRow.non_rural_rate.toFixed(2)}`
              : '';
          cards.push({
            summary: `DME Match: ${code}${itemRow.description ? ' — ' + itemRow.description : ''}`,
            indicator: 'info',
            detail: `**Curavend** has this item in inventory${itemRow.manufacturer_name ? ` (${itemRow.manufacturer_name})` : ''}${rateText}. You can create an order directly in Curavend.`,
            source: {
              label: 'Curavend DME Platform',
              url: 'https://curavend-web.pages.dev',
            },
            links: [
              {
                label: 'Create Order in Curavend',
                url: `https://curavend-web.pages.dev/create-order?hcpc=${code}`,
                type: 'absolute',
              },
            ],
          });
        } else {
          // Code not in inventory — still surface fee schedule info if available
          const feeRow = await c.env.DB.prepare(
            `SELECT description, non_rural_rate FROM medicare_fee_schedule_items WHERE hcpc_code = ? LIMIT 1`,
          )
            .bind(code)
            .first<{ description: string; non_rural_rate: number | null }>();

          if (feeRow?.non_rural_rate != null) {
            cards.push({
              summary: `Medicare Fee: ${code} — $${feeRow.non_rural_rate.toFixed(2)}`,
              indicator: 'info',
              detail: feeRow.description
                ? `National Medicare non-rural rate for **${code}** (${feeRow.description}): $${feeRow.non_rural_rate.toFixed(2)}`
                : `National Medicare non-rural rate for **${code}**: $${feeRow.non_rural_rate.toFixed(2)}`,
              source: { label: 'Curavend Fee Schedule' },
            });
          }
        }
      }
    } catch (err) {
      console.error('[cds-hooks] DB lookup error:', err);
      // Never fail the hook — return empty cards on error
    }
  }

  // ── Fallback card when no HCPC codes were found ─────────────────────────
  if (cards.length === 0) {
    cards.push({
      summary: 'Curavend DME Platform',
      indicator: 'info',
      detail:
        'No specific DME codes detected in this order. Visit Curavend to browse DME inventory and place orders.',
      source: {
        label: 'Curavend DME Platform',
        url: 'https://curavend-web.pages.dev',
      },
      links: [
        {
          label: 'Browse Curavend Inventory',
          url: 'https://curavend-web.pages.dev/inventory',
          type: 'absolute',
        },
      ],
    });
  }

  return c.json({ cards });
});

// ─── POST /cds-services/curavend-order-sign  (order-sign) ────────────────────
/**
 * order-sign fires when the clinician signs a set of orders in Epic. The hook
 * runs BEFORE the EHR finalizes — it can render cards but cannot block (we
 * never return suggestions that mutate the order). It's the right moment to
 * surface "you just signed a DME order — generate the DWO + claim bundle in
 * Curavend now."
 *
 * If patient + ≥1 DME-coded order are present, we return a single card:
 *   - summary: "{n} DME order(s) signed — generate DWO in Curavend"
 *   - link: deep-link into Curavend create-order with all HCPC codes pre-filled,
 *           along with the FHIR Patient/Encounter ids so Curavend can prefill
 *           demographics + encounter context just like Phase 1's EHR Launch.
 * If no DME codes were signed, we return an empty cards[] (per spec, the
 * EHR will simply not display anything — we don't want to spam clinicians).
 */
app.post(`/cds-services/${SERVICE_ID_SIGN}`, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ cards: [] });
  }

  const cards: any[] = [];
  const context = body.context ?? {};
  const patientId: string | undefined = context.patientId;
  const encounterId: string | undefined = context.encounterId;
  const userRaw: string | undefined = context.userId; // e.g. "Practitioner/abc"
  const fhirUser: string | undefined = userRaw?.includes('/')
    ? userRaw
    : undefined;
  const draftOrders = context.draftOrders?.entry ?? [];
  const hcpcCodes = [...new Set(extractHcpcs(draftOrders))];

  if (hcpcCodes.length === 0) {
    // No DME — stay silent.
    return c.json({ cards });
  }

  // Build the create-order deep-link. We mirror the FHIR Launch bounce
  // contract: pass patientId / encounterId / fhirUser in the query string so
  // the SPA can call /api/fhir/prefill and populate the wizard.
  const url = new URL('https://curavend-web.pages.dev/create-dme-order');
  url.searchParams.set('source', 'cds-hooks');
  if (patientId) url.searchParams.set('patientId', patientId);
  if (encounterId) url.searchParams.set('encounterId', encounterId);
  if (fhirUser) url.searchParams.set('fhirUser', fhirUser);
  url.searchParams.set('hcpcs', hcpcCodes.join(','));

  // Try to enrich the card body with the matched item descriptions so the
  // clinician sees what's about to be ordered. Cap at 3 to keep the card short.
  let detailLines: string[] = [];
  try {
    for (const code of hcpcCodes.slice(0, 3)) {
      const row = await c.env.DB.prepare(
        `SELECT ii.description, mfsi.non_rural_rate
         FROM inventory_items ii
         LEFT JOIN medicare_fee_schedule_items mfsi ON mfsi.hcpc_code = ii.hcpc_code
         WHERE ii.hcpc_code = ? LIMIT 1`,
      )
        .bind(code)
        .first<{ description: string; non_rural_rate: number | null }>();

      if (row?.description) {
        const rate =
          row.non_rural_rate != null
            ? ` — $${row.non_rural_rate.toFixed(2)}`
            : '';
        detailLines.push(`- **${code}** ${row.description}${rate}`);
      } else {
        detailLines.push(`- **${code}**`);
      }
    }
  } catch (err) {
    console.error('[cds-hooks/order-sign] enrichment error:', err);
    detailLines = hcpcCodes.slice(0, 3).map((c) => `- **${c}**`);
  }
  const extraCount = hcpcCodes.length - detailLines.length;
  if (extraCount > 0) detailLines.push(`- _…and ${extraCount} more_`);

  const detailMd = [
    `${hcpcCodes.length} DME order${hcpcCodes.length === 1 ? '' : 's'} just signed. Generate the **Detailed Written Order (DWO)** and claim-ready bundle in Curavend — it'll write back to the chart as a DocumentReference automatically.`,
    '',
    ...detailLines,
  ].join('\n');

  cards.push({
    uuid: crypto.randomUUID(),
    summary: `${hcpcCodes.length} DME order${hcpcCodes.length === 1 ? '' : 's'} signed — generate DWO in Curavend`,
    indicator: 'info',
    detail: detailMd,
    source: {
      label: 'Curavend DME Platform',
      url: 'https://curavend-web.pages.dev',
    },
    links: [
      {
        label: 'Generate DWO + Claim Bundle in Curavend',
        url: url.toString(),
        type: 'absolute',
      },
    ],
  });

  return c.json({ cards });
});

export default app;

/**
 * CDS Hooks — Clinical Decision Support endpoints.
 * Spec: https://cds-hooks.org/
 *
 * These endpoints MUST be public (no auth) per the CDS Hooks spec.
 * Returns helpful DME product suggestions when a clinician selects an order in Epic.
 * Works with or without Epic configuration; Epic config enables richer context.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env }>();

const SERVICE_ID = 'curavend-dme';

// ─── GET /cds-services ────────────────────────────────────────────────────────
// CDS Hooks discovery endpoint — lists available services.
app.get('/cds-services', (c) => {
  return c.json({
    services: [
      {
        hook: 'order-select',
        title: 'Curavend DME Matching',
        description: 'Suggests DME products and fee schedule rates when a clinician selects a service request or order.',
        id: SERVICE_ID,
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
          serviceRequest: 'ServiceRequest/{{context.draftOrders.entry[0].resource.id}}',
        },
      },
    ],
  });
});

// ─── POST /cds-services/curavend-dme ─────────────────────────────────────────
// Main CDS hook — receives hook context from Epic and returns suggestion cards.
app.post(`/cds-services/${SERVICE_ID}`, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ cards: [] });
  }

  const cards: any[] = [];
  const hook: string = body.hook ?? '';
  const context = body.context ?? {};
  const prefetch = body.prefetch ?? {};

  // ── Extract HCPC / CPT codes from draft orders ──────────────────────────
  const hcpcCodes: string[] = [];
  const draftOrders = context.draftOrders?.entry ?? [];

  for (const entry of draftOrders) {
    const resource = entry.resource ?? {};
    // ServiceRequest.orderDetail.coding
    for (const detail of resource.orderDetail ?? []) {
      for (const coding of detail.coding ?? []) {
        if (coding.code && /^[A-Z]\d{4}/.test(coding.code)) {
          hcpcCodes.push(coding.code);
        }
      }
    }
    // ServiceRequest.code.coding
    for (const coding of resource.code?.coding ?? []) {
      if (coding.code && /^[A-Z]\d{4}/.test(coding.code)) {
        hcpcCodes.push(coding.code);
      }
    }
  }

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
          .first<{ description: string; manufacturer_name: string; non_rural_rate: number | null }>();

        if (itemRow) {
          const rateText = itemRow.non_rural_rate != null
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
      detail: 'No specific DME codes detected in this order. Visit Curavend to browse DME inventory and place orders.',
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

export default app;

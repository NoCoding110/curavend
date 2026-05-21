import { Hono } from 'hono';
import { getDb } from '../lib/db';
import { ValidationError, ForbiddenError } from '../lib/errors';
import {
  routeOrderItems,
  type RoutingItemInput,
} from '../lib/vendorRouting';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

/**
 * POST /routing/suggestions
 *
 * Body:
 *   {
 *     hospitalId?: string,  // optional for hospital users (auto-scoped)
 *     facilityId: string,
 *     items: [
 *       { itemKey, hcpcCode?, inventoryItemId?, quantity, isCustomFit?, priority? }
 *     ]
 *   }
 *
 * Returns a `RoutingResult` — see `lib/vendorRouting.ts`.
 */
app.post('/suggestions', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  // Hospital users are always scoped to their own hospital; others must
  // pass hospitalId explicitly.
  const hospitalId: string =
    user.userType === 'HOSPITAL' && user.hospitalId
      ? user.hospitalId
      : body.hospitalId;

  if (!hospitalId) throw new ValidationError('hospitalId is required');
  if (!body.facilityId) throw new ValidationError('facilityId is required');
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('At least one item is required');
  }

  // Authorization: hospital users can only route their own; vendor users
  // are not expected to call this (but if they do, permit reads for orders
  // they own — left open for now).
  if (user.userType === 'HOSPITAL' && user.hospitalId !== hospitalId) {
    throw new ForbiddenError('Access denied');
  }

  const items: RoutingItemInput[] = body.items.map((raw: any, idx: number) => ({
    itemKey: String(raw.itemKey ?? raw.id ?? `item-${idx}`),
    hcpcCode: raw.hcpcCode ?? undefined,
    inventoryItemId: raw.inventoryItemId ?? undefined,
    quantity: Number(raw.quantity ?? 1),
    isCustomFit: !!raw.isCustomFit,
    priority: raw.priority ?? undefined,
  }));

  // Phase B: clamp topN to [1, 5], default 3
  const topN = Math.max(
    1,
    Math.min(5, Number.parseInt(String(body.topN ?? 3), 10) || 3),
  );

  try {
    const result = await routeOrderItems(db, {
      hospitalId,
      facilityId: body.facilityId,
      items,
      topN,
    });
    return c.json(result);
  } catch (err: any) {
    // Facility-not-found bubbles up as a domain error
    throw new ValidationError(err?.message || 'Routing failed');
  }
});

export default app;

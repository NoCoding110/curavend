/**
 * auditJournalService — write inbound order payloads to R2 + journal rows
 * to D1 (`order_ingest_journal`). Lets ops replay a failed ingest from the
 * stored raw payload. Inspired by Medzah's `IngestJournalService` (which
 * writes to Azure Blob).
 *
 * Idempotency model:
 *   - Caller passes an `Idempotency-Key` (HTTP header). We hash
 *     `labGroupId + key` so two different labs can use the same key string.
 *   - First insert succeeds (UNIQUE constraint on `idempotency_key`).
 *     Subsequent inserts collide → we re-fetch the original row and return
 *     its `labOrderId` so the caller gets the same outcome.
 */
import { eq, desc } from 'drizzle-orm';
import { orderIngestJournal } from '@curavend/db';
import type { IngestJournalEvent } from '@curavend/db';
import { getDb } from '../lib/db';
import { uploadFile, downloadFile, buildStorageKey } from './storageService';
import type { Env } from '../lib/env';

export interface JournalWriteArgs {
  orderRef: string;
  idempotencyKey?: string | null;
  labGroupId?: string | null;
  payload: unknown;
  sourceIp?: string | null;
}

export interface JournalEntry {
  id: string;
  orderRef: string;
  payloadBlobKey: string;
  event: IngestJournalEvent;
  labOrderId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * Compute a deterministic dedup key. The raw Idempotency-Key may collide
 * across labs, so we namespace by labGroupId when present.
 */
export function namespaceIdempotencyKey(
  key: string | null | undefined,
  labGroupId: string | null | undefined,
): string | null {
  if (!key) return null;
  return labGroupId ? `${labGroupId}::${key}` : `_global::${key}`;
}

/**
 * Persist payload to R2 + insert a RECEIVED journal row.
 * If an idempotency_key collision occurs, returns the existing row (no new write).
 */
export async function writeReceived(
  env: Env,
  args: JournalWriteArgs,
): Promise<{ journalId: string; isDuplicate: boolean; existingLabOrderId: string | null }> {
  const db = getDb(env.DB);
  const namespacedKey = namespaceIdempotencyKey(args.idempotencyKey, args.labGroupId);

  // Fast path: detect duplicate up front (avoids R2 write when we already have it)
  if (namespacedKey) {
    const existing = await db
      .select()
      .from(orderIngestJournal)
      .where(eq(orderIngestJournal.idempotencyKey, namespacedKey))
      .limit(1);
    if (existing.length > 0) {
      return {
        journalId: existing[0].id,
        isDuplicate: true,
        existingLabOrderId: existing[0].labOrderId,
      };
    }
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(args.payload));
  const payloadBlobKey = buildStorageKey(
    `ingest-journal/${new Date().toISOString().slice(0, 10)}/${args.orderRef}`,
    `received-${Date.now()}.json`,
  );
  await uploadFile(env.R2, payloadBlobKey, payloadBytes.buffer as ArrayBuffer, 'application/json', {
    kind: 'ingest-received',
    orderRef: args.orderRef,
  });

  const journalId = crypto.randomUUID();
  try {
    await db.insert(orderIngestJournal).values({
      id: journalId,
      orderRef: args.orderRef,
      idempotencyKey: namespacedKey,
      payloadBlobKey,
      event: 'RECEIVED',
      sourceIp: args.sourceIp ?? null,
    });
    return { journalId, isDuplicate: false, existingLabOrderId: null };
  } catch (err) {
    // Race: another request inserted between our pre-check and insert.
    // Re-fetch and return the winner.
    if (namespacedKey) {
      const existing = await db
        .select()
        .from(orderIngestJournal)
        .where(eq(orderIngestJournal.idempotencyKey, namespacedKey))
        .limit(1);
      if (existing.length > 0) {
        return {
          journalId: existing[0].id,
          isDuplicate: true,
          existingLabOrderId: existing[0].labOrderId,
        };
      }
    }
    throw err;
  }
}

/**
 * Append a follow-up journal event (PROCESSED, FAILED, REPLAYED) and link
 * the lab order id back to the original RECEIVED row.
 */
export async function appendEvent(
  env: Env,
  args: {
    parentJournalId: string;
    orderRef: string;
    event: IngestJournalEvent;
    labOrderId?: string | null;
    errorMessage?: string | null;
    payload?: unknown;
  },
): Promise<{ journalId: string }> {
  const db = getDb(env.DB);
  let payloadBlobKey: string;
  if (args.payload !== undefined) {
    const bytes = new TextEncoder().encode(JSON.stringify(args.payload));
    payloadBlobKey = buildStorageKey(
      `ingest-journal/${new Date().toISOString().slice(0, 10)}/${args.orderRef}`,
      `${args.event.toLowerCase()}-${Date.now()}.json`,
    );
    await uploadFile(env.R2, payloadBlobKey, bytes.buffer as ArrayBuffer, 'application/json', {
      kind: `ingest-${args.event.toLowerCase()}`,
      orderRef: args.orderRef,
      parentJournalId: args.parentJournalId,
    });
  } else {
    payloadBlobKey = `ingest-journal/event-only/${args.parentJournalId}-${args.event}`;
  }

  // Link the lab order id to the parent RECEIVED row so /replay can find it later
  if (args.labOrderId) {
    await db
      .update(orderIngestJournal)
      .set({ labOrderId: args.labOrderId })
      .where(eq(orderIngestJournal.id, args.parentJournalId));
  }

  const journalId = crypto.randomUUID();
  await db.insert(orderIngestJournal).values({
    id: journalId,
    orderRef: args.orderRef,
    labOrderId: args.labOrderId ?? null,
    payloadBlobKey,
    event: args.event,
    errorMessage: args.errorMessage ?? null,
  });
  return { journalId };
}

/**
 * Load a journal row + its R2 payload. Used by the replay endpoint.
 */
export async function loadJournalEntry(
  env: Env,
  journalId: string,
): Promise<{ entry: JournalEntry; payload: unknown } | null> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(orderIngestJournal)
    .where(eq(orderIngestJournal.id, journalId))
    .limit(1);
  if (!rows.length) return null;
  const r = rows[0];
  const obj = await downloadFile(env.R2, r.payloadBlobKey);
  if (!obj) return null;
  const text = await obj.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  return {
    entry: {
      id: r.id,
      orderRef: r.orderRef,
      payloadBlobKey: r.payloadBlobKey,
      event: r.event as IngestJournalEvent,
      labOrderId: r.labOrderId,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
    },
    payload,
  };
}

/**
 * List recent journal entries for an orderRef (newest first).
 */
export async function listForOrderRef(
  env: Env,
  orderRef: string,
  limit = 20,
): Promise<JournalEntry[]> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(orderIngestJournal)
    .where(eq(orderIngestJournal.orderRef, orderRef))
    .orderBy(desc(orderIngestJournal.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    orderRef: r.orderRef,
    payloadBlobKey: r.payloadBlobKey,
    event: r.event as IngestJournalEvent,
    labOrderId: r.labOrderId,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
  }));
}

/**
 * kitLetterSyncService — pull the kit letter catalog from an external CMS
 * (Medzah uses `https://documents.ditekapp.com/api/athome/letters`) and
 * upsert into the local `kit_letters` table.
 *
 * Behaviour:
 *   - Fetches via guarded fetch so local dev can short-circuit it.
 *   - Dedupes the incoming rows by `(parentKitId, letterId)` keeping the
 *     newest `sourceUpdatedAt`.
 *   - For each unique (parentKitId, letterId): if no DB row exists, insert
 *     with version=1. If a row exists with same `sourceUpdatedAt`, skip.
 *     If newer, insert as version = prev_max_version + 1 (versioned history).
 *   - Letter PDFs (base64) are uploaded to R2 and the `pdfBlobKey` stored.
 *   - `dryRun: true` performs all fetches + diff math but skips DB writes.
 */
import { eq, and, max } from 'drizzle-orm';
import { kitLetters } from '@curavend/db';
import { getDb } from '../lib/db';
import { uploadFile, buildStorageKey } from './storageService';
import { guardedFetch } from '../lib/externalCallGate';
import { assertPublicHttpUrl } from '../lib/safeFetch';
import type { Env } from '../lib/env';

export interface KitLetterSyncReport {
  imported: number;
  updated: number;
  skipped: number;
  gated: boolean;
  errors: string[];
  totalSourceRows: number;
}

interface SourceLetter {
  parentKitId?: string | null;
  letterId: string;
  name?: string;
  sourceUpdatedAt?: string;
  pdfBase64?: string;
  dynamicData?: Record<string, unknown>;
}

function isSourceLetter(o: unknown): o is SourceLetter {
  return !!o && typeof o === 'object' && typeof (o as any).letterId === 'string';
}

function dedupeSource(rows: SourceLetter[]): SourceLetter[] {
  const map = new Map<string, SourceLetter>();
  for (const row of rows) {
    const key = `${row.parentKitId ?? ''}::${row.letterId}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    const a = prev.sourceUpdatedAt ?? '';
    const b = row.sourceUpdatedAt ?? '';
    if (b > a) map.set(key, row);
  }
  return Array.from(map.values());
}

export async function syncKitLetters(
  env: Env,
  opts: { dryRun?: boolean } = {},
): Promise<KitLetterSyncReport> {
  const report: KitLetterSyncReport = {
    imported: 0,
    updated: 0,
    skipped: 0,
    gated: false,
    errors: [],
    totalSourceRows: 0,
  };
  const url = env.KIT_LETTERS_URL;
  if (!url) {
    report.errors.push('KIT_LETTERS_URL not configured');
    return report;
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (env.KIT_LETTERS_API_KEY) headers['X-API-Key'] = env.KIT_LETTERS_API_KEY;

  let fetched: unknown;
  try {
    assertPublicHttpUrl(url);
    const { response, gated } = await guardedFetch(env, url, { method: 'GET', headers });
    report.gated = gated;
    if (gated) return report;
    if (!response.ok) {
      report.errors.push(`source returned ${response.status}`);
      return report;
    }
    fetched = await response.json();
  } catch (err: any) {
    report.errors.push(`fetch failed: ${err?.message ?? String(err)}`);
    return report;
  }

  const sourceArray = Array.isArray(fetched)
    ? fetched
    : Array.isArray((fetched as any)?.letters)
    ? (fetched as any).letters
    : [];
  const candidates = sourceArray.filter(isSourceLetter);
  report.totalSourceRows = candidates.length;
  if (candidates.length === 0) return report;

  const deduped = dedupeSource(candidates);
  const db = getDb(env.DB);

  for (const src of deduped) {
    try {
      // Look up the highest existing version for this (parent, letter)
      const existingMaxRows = await db
        .select({ maxVersion: max(kitLetters.version), pdfBlobKey: kitLetters.pdfBlobKey, sourceUpdatedAt: kitLetters.sourceUpdatedAt })
        .from(kitLetters)
        .where(
          and(
            src.parentKitId
              ? eq(kitLetters.parentKitId, src.parentKitId)
              : eq(kitLetters.parentKitId, ''), // workaround: NULL != NULL; we treat null parent as the empty string key in source mapping
            eq(kitLetters.letterId, src.letterId),
          ),
        );
      const existingMaxVersion = (existingMaxRows[0]?.maxVersion as number | null) ?? 0;

      // Re-query to check if this exact `sourceUpdatedAt` already exists for skip behaviour
      let alreadyHave = false;
      if (existingMaxVersion > 0) {
        const sameRows = await db
          .select()
          .from(kitLetters)
          .where(
            and(
              src.parentKitId
                ? eq(kitLetters.parentKitId, src.parentKitId)
                : eq(kitLetters.parentKitId, ''),
              eq(kitLetters.letterId, src.letterId),
              eq(kitLetters.sourceUpdatedAt, src.sourceUpdatedAt ?? ''),
            ),
          )
          .limit(1);
        alreadyHave = sameRows.length > 0;
      }
      if (alreadyHave) {
        report.skipped++;
        continue;
      }

      // Upload PDF if present
      let pdfBlobKey: string | null = null;
      if (src.pdfBase64 && !opts.dryRun) {
        const bytes = Uint8Array.from(atob(src.pdfBase64), (c) => c.charCodeAt(0));
        pdfBlobKey = buildStorageKey(
          `kit-letters/${src.parentKitId ?? 'no-parent'}/${src.letterId}`,
          `v${existingMaxVersion + 1}.pdf`,
        );
        await uploadFile(env.R2, pdfBlobKey, bytes.buffer as ArrayBuffer, 'application/pdf', {
          kind: 'kit-letter',
          letterId: src.letterId,
          parentKitId: src.parentKitId ?? '',
          version: String(existingMaxVersion + 1),
        });
      }

      if (!opts.dryRun) {
        await db.insert(kitLetters).values({
          id: crypto.randomUUID(),
          parentKitId: src.parentKitId ?? null,
          letterId: src.letterId,
          version: existingMaxVersion + 1,
          name: src.name ?? null,
          pdfBlobKey,
          sourceUpdatedAt: src.sourceUpdatedAt ?? null,
          dynamicData: src.dynamicData ? JSON.stringify(src.dynamicData) : null,
          enabled: 1,
        });
      }
      if (existingMaxVersion === 0) report.imported++;
      else report.updated++;
    } catch (err: any) {
      report.errors.push(`letterId=${src.letterId}: ${err?.message ?? err}`);
    }
  }

  return report;
}

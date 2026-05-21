/**
 * Monthly OIG LEIE (List of Excluded Individuals/Entities) refresh.
 * Downloads the public CSV from HHS/OIG and upserts into oig_exclusion_list.
 *
 * Public URL (no auth): https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv
 * Run schedule: 0 6 1 * *  (01:00 on the 1st of each month)
 */

import { getDb } from '../lib/db';
import type { Env } from '../lib/env';

// HHS OIG public LEIE CSV URL
const LEIE_CSV_URL = 'https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv';

export async function handleOigRefresh(env: Env): Promise<void> {
  console.log('[oig-refresh] Starting LEIE refresh from OIG...');

  let csvText: string;
  try {
    const res = await fetch(LEIE_CSV_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      console.error(`[oig-refresh] OIG fetch failed: ${res.status} ${res.statusText}`);
      return;
    }
    csvText = await res.text();
  } catch (err) {
    console.error('[oig-refresh] Network error fetching LEIE CSV:', err);
    return;
  }

  const lines = csvText.split('\n');
  if (lines.length < 2) {
    console.warn('[oig-refresh] Empty LEIE CSV received — aborting');
    return;
  }

  // CSV headers (case-sensitive from OIG file):
  // LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WAIVERSTATE
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  const db = getDb(env.DB);
  const now = new Date().toISOString();

  // Truncate and reload on each refresh (LEIE is a full replacement file)
  await env.DB.exec('DELETE FROM oig_exclusion_list');

  let inserted = 0;
  const BATCH = 50;
  let batch: string[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = batch.flat();
    await env.DB.prepare(
      `INSERT INTO oig_exclusion_list
        (id, npi, ein, last_name, first_name, business_name, general, specialty, upin, dob, address, city, state, zip, excltype, excldate, reindate, waiverdate, waiverstate, created_at)
       VALUES ${placeholders}`,
    )
      .bind(...values)
      .run();
    inserted += batch.length;
    batch = [];
  };

  const col = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    if (idx < 0) return '';
    const v = (row[idx] ?? '').trim().replace(/^"|"$/g, '');
    return v || '';
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = line.split(',');

    batch.push([
      crypto.randomUUID(),
      col(row, 'NPI') || null,
      col(row, 'EIN') || null,
      col(row, 'LASTNAME') || null,
      col(row, 'FIRSTNAME') || null,
      col(row, 'BUSNAME') || null,
      col(row, 'GENERAL') || null,
      col(row, 'SPECIALTY') || null,
      col(row, 'UPIN') || null,
      col(row, 'DOB') || null,
      col(row, 'ADDRESS') || null,
      col(row, 'CITY') || null,
      col(row, 'STATE') || null,
      col(row, 'ZIP') || null,
      col(row, 'EXCLTYPE') || null,
      col(row, 'EXCLDATE') || null,
      col(row, 'REINDATE') || null,
      col(row, 'WAIVERDATE') || null,
      col(row, 'WAIVERSTATE') || null,
      now,
    ] as any);

    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log(`[oig-refresh] Done. Inserted ${inserted} OIG exclusion records.`);
}

/**
 * Screen an entity against the OIG exclusion list.
 * Returns the matching row if excluded, null if clear.
 */
export async function screenOig(
  env: Env,
  opts: {
    npi?: string | null;
    ein?: string | null;
    lastName?: string | null;
    businessName?: string | null;
  },
): Promise<Record<string, any> | null> {
  const conditions: string[] = [];
  const params: string[] = [];

  if (opts.npi) {
    conditions.push('npi = ?');
    params.push(opts.npi);
  }
  if (opts.ein) {
    conditions.push('ein = ?');
    params.push(opts.ein);
  }
  if (opts.lastName) {
    conditions.push("lower(last_name) = lower(?)");
    params.push(opts.lastName);
  }
  if (opts.businessName) {
    conditions.push("lower(business_name) = lower(?)");
    params.push(opts.businessName);
  }

  if (!conditions.length) return null;

  const result = await env.DB.prepare(
    `SELECT * FROM oig_exclusion_list WHERE (${conditions.join(' OR ')}) AND (reindate IS NULL OR reindate = '') LIMIT 1`,
  )
    .bind(...params)
    .first();

  return result ?? null;
}

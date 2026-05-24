import type { Database } from '../lib/db';
import { sql } from 'drizzle-orm';

/**
 * Auto-incrementing sequence service using D1.
 *
 * Replaces the DynamoDB atomic counter / tracker tables from the AWS version.
 * Uses INSERT OR REPLACE with an atomic increment to guarantee uniqueness.
 *
 * Sequence names:
 *   - vendor_user_id
 *   - hospital_user_id
 *   - invoice_number
 *   - purchase_order_number
 *   - support_ticket_number
 */

/**
 * Ensure the sequences table exists. Should be called once during migration
 * or bootstrap, but is safe to call repeatedly.
 */
export async function ensureSequenceTable(db: Database): Promise<void> {
  await (db as any).run(sql`
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      current_value INTEGER NOT NULL DEFAULT 0
    )
  `);
}

/**
 * Atomically increment and return the next value for the named sequence.
 *
 * Uses INSERT ... ON CONFLICT to handle first-use and subsequent increments
 * in a single statement, which is atomic in SQLite / D1.
 */
export async function getNextValue(
  db: Database,
  sequenceName: string,
): Promise<number> {
  // Upsert: insert with value=1, or increment existing value by 1
  await (db as any).run(sql`
    INSERT INTO sequences (name, current_value) VALUES (${sequenceName}, 1)
    ON CONFLICT(name) DO UPDATE SET current_value = current_value + 1
  `);

  // Read back the current value
  const result = (await (db as any).get(sql`
    SELECT current_value FROM sequences WHERE name = ${sequenceName}
  `)) as { current_value: number } | undefined;

  if (!result?.current_value) {
    throw new Error(`Failed to retrieve sequence value for ${sequenceName}`);
  }

  return result.current_value;
}

/**
 * Peek at the current value without incrementing.
 */
export async function getCurrentValue(
  db: Database,
  sequenceName: string,
): Promise<number> {
  const result = (await (db as any).get(sql`
    SELECT current_value FROM sequences WHERE name = ${sequenceName}
  `)) as { current_value: number } | undefined;

  return result?.current_value ?? 0;
}

/**
 * Reset a sequence to a specific value. Use with caution.
 */
export async function resetSequence(
  db: Database,
  sequenceName: string,
  value: number,
): Promise<void> {
  await (db as any).run(sql`
    INSERT INTO sequences (name, current_value) VALUES (${sequenceName}, ${value})
    ON CONFLICT(name) DO UPDATE SET current_value = ${value}
  `);
}

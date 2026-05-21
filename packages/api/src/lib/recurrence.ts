/**
 * Recurrence schedule math.
 *
 * Pure functions for advancing a recurrence plan to its next occurrence
 * date, honoring frequency unit/value, anchor day, skip dates, and bounds.
 */
import type { RecurrenceFrequencyUnit } from '@curavend/db';

export interface RecurrencePlanLike {
  frequencyUnit: RecurrenceFrequencyUnit | string;
  frequencyValue: number;
  anchorDay: number | null;
  startDate: string;
  endDate: string | null;
  totalOccurrences: number | null;
  skipDates: string | null; // JSON array
  occurrencesSpawned: number;
}

/** YYYY-MM-DD → Date in UTC */
function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date → YYYY-MM-DD in UTC */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function addMonths(d: Date, months: number, anchorDay: number | null): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  if (anchorDay != null) {
    // Clamp anchor day to last-day-of-month if needed (e.g., Feb 31 -> Feb 28/29)
    const target = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0));
    const maxDay = target.getUTCDate();
    r.setUTCDate(Math.min(anchorDay, maxDay));
  }
  return r;
}

function getSkipDates(plan: RecurrencePlanLike): Set<string> {
  if (!plan.skipDates) return new Set();
  try {
    const arr = JSON.parse(plan.skipDates);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Given a plan and the current `nextOccurrenceDate`, compute the *next* date
 * after stepping one cadence forward. Respects skip dates (keeps stepping
 * until a non-skipped date is found). Returns null if past endDate or
 * totalOccurrences cap.
 */
export function computeNextOccurrenceDate(
  plan: RecurrencePlanLike,
  fromDate: string,
): string | null {
  const skipDates = getSkipDates(plan);
  const endDate = plan.endDate ? parseDate(plan.endDate) : null;

  let next = parseDate(fromDate);
  // Step exactly one cadence
  switch (plan.frequencyUnit) {
    case 'DAYS':
      next = addDays(next, plan.frequencyValue);
      break;
    case 'WEEKS':
      next = addDays(next, plan.frequencyValue * 7);
      break;
    case 'MONTHS':
      next = addMonths(next, plan.frequencyValue, plan.anchorDay);
      break;
    case 'QUARTERS':
      next = addMonths(next, plan.frequencyValue * 3, plan.anchorDay);
      break;
    case 'CUSTOM':
      // For CUSTOM cron expressions, day-step is the safe fallback v1.
      // A future enhancement will parse customCronExpression.
      next = addDays(next, plan.frequencyValue || 1);
      break;
    default:
      next = addDays(next, plan.frequencyValue || 1);
  }

  // Walk forward past any skip dates
  let safety = 0;
  while (skipDates.has(formatDate(next)) && safety < 365) {
    next = addDays(next, 1);
    safety++;
  }

  // Bound check
  if (endDate && next > endDate) return null;
  return formatDate(next);
}

/**
 * Project the next N upcoming occurrences (forward-looking, without DB writes).
 * Used by `GET /recurrence/:id/occurrences` and the email "upcoming" reminder.
 */
export function computeUpcomingOccurrences(
  plan: RecurrencePlanLike,
  startFrom: string,
  limit: number = 3,
): string[] {
  const out: string[] = [];
  let cursor = startFrom;
  while (out.length < limit) {
    if (
      plan.totalOccurrences != null &&
      plan.occurrencesSpawned + out.length + 1 > plan.totalOccurrences
    ) {
      break;
    }
    const next = computeNextOccurrenceDate(plan, cursor);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/**
 * Convenience: given a plan, compute its initial `nextOccurrenceDate`.
 * If today >= startDate, the first occurrence is today (or the next non-skip).
 * Otherwise it's startDate.
 */
export function computeInitialOccurrenceDate(
  plan: RecurrencePlanLike,
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  const skipDates = getSkipDates(plan);
  let cursor = plan.startDate > today ? plan.startDate : today;
  let safety = 0;
  while (skipDates.has(cursor) && safety < 365) {
    const nextDate = addDays(parseDate(cursor), 1);
    cursor = formatDate(nextDate);
    safety++;
  }
  const endDate = plan.endDate ? parseDate(plan.endDate) : null;
  if (endDate && parseDate(cursor) > endDate) return null;
  return cursor;
}

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import { DATE_FORMAT, DATE_TIME_FORMAT, API_DATE_FORMAT } from '../constants/global';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

/**
 * Format an ISO date string to display format (MM/DD/YYYY).
 * Returns an empty string when the input is falsy or invalid.
 */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  const d = dayjs(date);
  return d.isValid() ? d.format(DATE_FORMAT) : '';
}

/**
 * Format an ISO date string to display format with time (MM/DD/YYYY hh:mm A).
 * Returns an empty string when the input is falsy or invalid.
 */
export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '';
  const d = dayjs(date);
  return d.isValid() ? d.format(DATE_TIME_FORMAT) : '';
}

/**
 * Convert a Date (or ISO string) to the API date format (YYYY-MM-DD).
 */
export function toApiDate(date: Date | string): string {
  return dayjs(date).format(API_DATE_FORMAT);
}

/**
 * Check whether a date string represents a date expiring within the given
 * number of days from today.
 */
export function isExpiringSoon(date: string | null | undefined, withinDays: number): boolean {
  if (!date) return false;
  const target = dayjs(date);
  if (!target.isValid()) return false;
  const now = dayjs();
  return target.isAfter(now) && target.diff(now, 'day') <= withinDays;
}

/**
 * Return the relative time string (e.g. "2 hours ago").
 */
export function timeAgo(date: string | null | undefined): string {
  if (!date) return '';
  const d = dayjs(date);
  if (!d.isValid()) return '';
  const now = dayjs();
  const diffMinutes = now.diff(d, 'minute');
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = now.diff(d, 'hour');
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = now.diff(d, 'day');
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.format(DATE_FORMAT);
}

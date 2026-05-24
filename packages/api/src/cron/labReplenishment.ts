/**
 * Daily lab replenishment + expiration cron wrappers. Wired into the
 * existing `0 8 * * *` schedule.
 */
import type { Env } from '../lib/env';
import { handleLabAutoReplenishment, handleLabExpiration } from '../services/labReplenishmentService';

export { handleLabAutoReplenishment, handleLabExpiration };

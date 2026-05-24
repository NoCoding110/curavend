import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Vendor onboarding state machine.
 *
 * INVITED → DOCS_PENDING → DOCS_RECEIVED → CREDENTIALED → APPROVED → ACTIVE
 *                                                                  ↓
 *                                                              SUSPENDED (recoverable)
 *
 * One row per (vendorId, hospitalId). `hospitalId` is null for
 * platform-level onboarding (vendor joins curavend itself); set for
 * hospital-specific onboarding (vendor approved by THIS hospital).
 *
 * `docsRequired` and `docsReceived` are JSON arrays of doc names:
 * 'W9' | 'COI' | 'OIG_ATTESTATION' | 'DMEPOS' | 'MSA' | 'BAA'.
 */
export const ONBOARDING_STATES = [
  'INVITED', 'DOCS_PENDING', 'DOCS_RECEIVED', 'CREDENTIALED',
  'APPROVED', 'ACTIVE', 'SUSPENDED',
] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export const ONBOARDING_DOC_TYPES = [
  'W9', 'COI', 'OIG_ATTESTATION', 'DMEPOS', 'MSA', 'BAA', 'ACCREDITATION',
] as const;
export type OnboardingDocType = (typeof ONBOARDING_DOC_TYPES)[number];

export const vendorOnboardingStates = sqliteTable(
  'vendor_onboarding_states',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    vendorId: text('vendor_id').notNull(),
    hospitalId: text('hospital_id'),
    state: text('state').notNull().default('INVITED'),
    invitedByUserId: text('invited_by_user_id'),
    invitedAt: text('invited_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    docsRequired: text('docs_required'),
    docsReceived: text('docs_received'),
    credentialedAt: text('credentialed_at'),
    approvedAt: text('approved_at'),
    activatedAt: text('activated_at'),
    suspendedAt: text('suspended_at'),
    suspendedReason: text('suspended_reason'),
    notes: text('notes'),
    lastAdvancedByUserId: text('last_advanced_by_user_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('vendor_onboarding_states_vendor_uk').on(t.vendorId, t.hospitalId),
    index('vendor_onboarding_states_state_idx').on(t.state),
  ],
);

export const vendorOnboardingHistory = sqliteTable(
  'vendor_onboarding_history',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    onboardingId: text('onboarding_id').notNull(),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    byUserId: text('by_user_id'),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('vendor_onboarding_history_onboarding_idx').on(t.onboardingId)],
);

// ──────────────────────────────────────────────
// Subscription & billing types
// ──────────────────────────────────────────────

export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'CANCELED' | 'PAST_DUE';

export type PaymentStatus = 'SUCCEEDED' | 'FAILED' | 'PENDING';

/** A feature flag / capability gated behind a plan. */
export interface Feature {
  id: string;
  name: string;
  description: string | null;
  key: string;
  createdAt: string;
  updatedAt: string;
}

/** Join record linking a plan to its included features. */
export interface PlanFeature {
  id: string;
  planId: string;
  featureId: string;
  /** Optional limit (e.g. max orders per month). Null means unlimited. */
  limit: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Subscription plan definition. */
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  isActive: boolean;
  features: PlanFeature[];
  createdAt: string;
  updatedAt: string;
}

/** Active subscription tying a user/org to a plan. */
export interface Subscription {
  id: string;
  planId: string;
  planName: string | null;
  userId: string | null;
  providerId: string | null;
  hospitalId: string | null;
  vendorId: string | null;
  superVendorId: string | null;
  status: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndDate: string | null;
  cancelledAt: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Record of a single payment attempt. */
export interface PaymentHistory {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

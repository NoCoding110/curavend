// ──────────────────────────────────────────────
// User-related types
// ──────────────────────────────────────────────

export type UserType = 'ADMIN' | 'HOSPITAL' | 'VENDOR';

export type UserRole =
  | 'ACCOUNT_MANAGER'
  | 'FACILITY_ACCOUNT_MANAGER'
  | 'FACILITY_USER'
  | 'VENDOR_ACCOUNT_MANAGER'
  | 'VENDOR_USER'
  | 'PROVIDER_EXECUTIVE_ADMIN'
  | 'PROVIDER_USER'
  | 'ACCOUNT_MANAGER_USER'
  | 'SUPER_VENDOR';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export type UserStep = 'ACCOUNT_CREATED' | 'WELCOME_EMAIL';

export type OigStatus = 'CLEARED' | 'EXCLUDED';

export type ApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

/** Contact card stored as JSON in provider/superVendor otherContacts. */
export interface ContactCard {
  name: string;
  email: string;
  contact: string;
  title: string;
}

/** Notification settings stored as JSON on hospitals, vendors, superVendors. */
export interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  orderUpdates: boolean;
  invoiceUpdates: boolean;
  chatMessages: boolean;
  supportTickets: boolean;
}

/** Core user record shared across all user types. */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  title: string | null;
  contact: string | null;
  streetAddress: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  userType: UserType;
  role: UserRole;
  userStatus: UserStatus;
  accountManagerId: string | null;
  step: UserStep;
  oigStatus: OigStatus | null;
  approvalStatus: ApprovalStatus;
  hasAgreedToPHIAccess: boolean;
  mustChangePassword: boolean;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  providerId: string | null;
  hospitalId: string | null;
  vendorId: string | null;
  superVendorId: string | null;
  subscriptionPlanId: string | null;
  currentLoggedInAt: string | null;
  lastLoggedInAt: string | null;
  timedOut: boolean;
  lastFunctionAccessed: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Provider (health-system / parent organization). */
export interface Provider {
  id: string;
  name: string;
  ein: string | null;
  physicalStreetAddress: string | null;
  physicalCity: string | null;
  physicalState: string | null;
  physicalZip: string | null;
  mailingStreetAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  billingStreetAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  primaryAccountName: string | null;
  primaryAccountEmail: string | null;
  primaryAccountContact: string | null;
  primaryAccountTitle: string | null;
  accountsPayable: string | null;
  supplyChain: string | null;
  otherContact: string | null;
  otherContacts: ContactCard[] | null;
  track: string[] | null;
  subscriptionPlanId: string | null;
  billingCycle: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Hospital / facility belonging to a provider. */
export interface Hospital {
  id: string;
  email: string | null;
  userId: number | null;
  name: string | null;
  contact: string | null;
  contactPerson: string | null;
  contactPersonTitle: string | null;
  streetAddress: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  providerId: string | null;
  subscriptionPlanId: string | null;
  fhirBaseURL: string | null;
  scope: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  lastRefreshedAt: string | null;
  modifiedOrders: number;
  inProcessOrders: number;
  cancelledOrders: number;
  completedOrders: number;
  unreadOrderCount: number;
  notificationSettings: NotificationSettings | null;
  createdAt: string;
  updatedAt: string;
}

/** Vendor organization. */
export interface Vendor {
  id: string;
  email: string | null;
  vendorUserId: number | null;
  ein: string | null;
  name: string | null;
  contact: string | null;
  contactPerson: string | null;
  contactPersonMiddleName: string | null;
  contactPersonLastName: string | null;
  contactPersonTitle: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  taxId: string | null;
  billingEmail: string | null;
  billingName: string | null;
  billingContact: string | null;
  billingStreetAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  mailingStreetAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  logo: string | null;
  accreditingBody: string | null;
  accreditationExpiryDate: string | null;
  stateLevelLicense: string | null;
  stateLevelLicenseNumber: string | null;
  stateLevelLicenseExpiryDate: string | null;
  liabilityInsuranceProvider: string | null;
  liabilityInsurancePolicyNumber: string | null;
  liabilityInsuranceExpiryDate: string | null;
  blanketPurchaseOrderNumber: string | null;
  erpAccountNumber: string | null;
  superVendorId: string | null;
  subscriptionPlanId: string | null;
  track: string[] | null;
  modifiedOrders: number;
  inProcessOrders: number;
  cancelledOrders: number;
  completedOrders: number;
  unreadOrderCount: number;
  notificationSettings: NotificationSettings | null;
  createdAt: string;
  updatedAt: string;
}

/** Super-vendor (parent vendor organization). */
export interface SuperVendor {
  id: string;
  name: string;
  ein: string | null;
  physicalStreetAddress: string | null;
  physicalCity: string | null;
  physicalState: string | null;
  physicalZip: string | null;
  mailingStreetAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  billingStreetAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  primaryAccountName: string | null;
  primaryAccountEmail: string | null;
  primaryAccountContact: string | null;
  primaryAccountTitle: string | null;
  accountsPayable: string | null;
  supplyChain: string | null;
  otherContact: string | null;
  otherContacts: ContactCard[] | null;
  subscriptionPlanId: string | null;
  billingCycle: string | null;
  notificationSettings: NotificationSettings | null;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Global constants, enum maps, label/color lookups
// ──────────────────────────────────────────────

// ──── User Roles ────

export const USER_TYPES = {
  ADMIN: 'ADMIN',
  HOSPITAL: 'HOSPITAL',
  VENDOR: 'VENDOR',
} as const;

export const USER_ROLES = {
  ACCOUNT_MANAGER: 'ACCOUNT_MANAGER',
  FACILITY_ACCOUNT_MANAGER: 'FACILITY_ACCOUNT_MANAGER',
  FACILITY_USER: 'FACILITY_USER',
  VENDOR_ACCOUNT_MANAGER: 'VENDOR_ACCOUNT_MANAGER',
  VENDOR_USER: 'VENDOR_USER',
  PROVIDER_EXECUTIVE_ADMIN: 'PROVIDER_EXECUTIVE_ADMIN',
  PROVIDER_USER: 'PROVIDER_USER',
  ACCOUNT_MANAGER_USER: 'ACCOUNT_MANAGER_USER',
  SUPER_VENDOR: 'SUPER_VENDOR',
} as const;

export const USER_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const USER_STEPS = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  WELCOME_EMAIL: 'WELCOME_EMAIL',
} as const;

export const OIG_STATUSES = {
  CLEARED: 'CLEARED',
  EXCLUDED: 'EXCLUDED',
} as const;

export const APPROVAL_STATUSES = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
} as const;

// ──── Orders ────

export const ORDER_STATUSES = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export const ORDER_SUB_STATUSES = {
  NEW_ORDER: 'NEW_ORDER',
  VENDOR_ASSIGNED: 'VENDOR_ASSIGNED',
  VENDOR_CONFIRMED_RECEIPT: 'VENDOR_CONFIRMED_RECEIPT',
  VENDOR_DECLINED: 'VENDOR_DECLINED',
  FACILITY_CANCELLED: 'FACILITY_CANCELLED',
  ORDER_REQUESTED_FOR_MODIFY: 'ORDER_REQUESTED_FOR_MODIFY',
  PATIENT_VISITED_AND_ASSESSED: 'PATIENT_VISITED_AND_ASSESSED',
  DELIVERED: 'DELIVERED',
  PROOF_UPLOADED: 'PROOF_UPLOADED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
} as const;

// ──── Invoices ────

export const INVOICE_STATUSES = {
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  SPEND_CONFIRMED: 'SPEND_CONFIRMED',
  INVOICE_GENERATED: 'INVOICE_GENERATED',
  INVOICE_SENT: 'INVOICE_SENT',
  INVOICE_PAID: 'INVOICE_PAID',
} as const;

export const PURCHASE_ORDER_STATUSES = {
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  EXPORTED: 'EXPORTED',
} as const;

// ──── Support ────

export const TICKET_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export const TICKET_SUBJECTS = {
  ACCOUNT: 'ACCOUNT',
  PRICING: 'PRICING',
  ORDER: 'ORDER',
  CONTRACT: 'CONTRACT',
  INVOICE: 'INVOICE',
  OTHER: 'OTHER',
} as const;

// ──── Notifications ────

export const REDIRECT_TO_OPTIONS = {
  ORDER: 'ORDER',
  INVOICE: 'INVOICE',
  FACILITY_USER: 'FACILITY_USER',
  VENDOR_USER: 'VENDOR_USER',
  ROOM: 'ROOM',
  SUPPORT_TICKET: 'SUPPORT_TICKET',
  NO_REDIRECT: 'NO_REDIRECT',
} as const;

// ──── Inventory ────

export const INVENTORY_CHANGE_TYPES = {
  INCREMENT: 'INCREMENT',
  DECREMENT: 'DECREMENT',
  PAR_ADJUSTMENT: 'PAR_ADJUSTMENT',
  INITIAL_SETUP: 'INITIAL_SETUP',
  CYCLE_COUNT_ADJUSTMENT: 'CYCLE_COUNT_ADJUSTMENT',
} as const;

export const INVENTORY_FIELDS = {
  DISPENSED: 'DISPENSED',
  ON_HAND: 'ON_HAND',
  PAR_LEVEL: 'PAR_LEVEL',
  REORDER_TRIGGER_THRESHOLD: 'REORDER_TRIGGER_THRESHOLD',
} as const;

export const TRACKS = {
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  INVOICE: 'INVOICE',
} as const;

// ──── Subscriptions ────

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  CANCELED: 'CANCELED',
  PAST_DUE: 'PAST_DUE',
} as const;

export const PAYMENT_STATUSES = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  PENDING: 'PENDING',
} as const;

// ──────────────────────────────────────────────
// Color maps (Ant Design tag colors)
// ──────────────────────────────────────────────

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'gold',
  IN_PROGRESS: 'blue',
  CANCELLED: 'red',
  COMPLETED: 'green',
};

export const ORDER_SUB_STATUS_COLORS: Record<string, string> = {
  NEW_ORDER: 'blue',
  VENDOR_ASSIGNED: 'cyan',
  VENDOR_CONFIRMED_RECEIPT: 'geekblue',
  VENDOR_DECLINED: 'red',
  FACILITY_CANCELLED: 'red',
  ORDER_REQUESTED_FOR_MODIFY: 'orange',
  PATIENT_VISITED_AND_ASSESSED: 'purple',
  DELIVERED: 'lime',
  PROOF_UPLOADED: 'green',
  ORDER_COMPLETED: 'green',
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  ORDER_COMPLETED: 'blue',
  SPEND_CONFIRMED: 'cyan',
  INVOICE_GENERATED: 'geekblue',
  INVOICE_SENT: 'purple',
  INVOICE_PAID: 'green',
};

export const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: 'blue',
  CLOSED: 'default',
};

export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  APPROVED: 'green',
  PENDING: 'gold',
  REJECTED: 'red',
};

export const USER_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
};

export const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  CANCELED: 'red',
  PAST_DUE: 'orange',
};

// ──────────────────────────────────────────────
// Label maps (human-readable display strings)
// ──────────────────────────────────────────────

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export const ORDER_SUB_STATUS_LABELS: Record<string, string> = {
  NEW_ORDER: 'New Order',
  VENDOR_ASSIGNED: 'Vendor Assigned',
  VENDOR_CONFIRMED_RECEIPT: 'Vendor Confirmed Receipt',
  VENDOR_DECLINED: 'Vendor Declined',
  FACILITY_CANCELLED: 'Facility Cancelled',
  ORDER_REQUESTED_FOR_MODIFY: 'Modification Requested',
  PATIENT_VISITED_AND_ASSESSED: 'Patient Visited & Assessed',
  DELIVERED: 'Delivered',
  PROOF_UPLOADED: 'Proof Uploaded',
  ORDER_COMPLETED: 'Order Completed',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  ORDER_COMPLETED: 'Unbilled',
  SPEND_CONFIRMED: 'Spend Confirmed',
  INVOICE_GENERATED: 'Invoice Generated',
  INVOICE_SENT: 'Open',
  INVOICE_PAID: 'Paid',
};

export const ROLE_LABELS: Record<string, string> = {
  ACCOUNT_MANAGER: 'Account Manager',
  FACILITY_ACCOUNT_MANAGER: 'Facility Admin',
  FACILITY_USER: 'Facility User',
  VENDOR_ACCOUNT_MANAGER: 'Vendor Admin',
  VENDOR_USER: 'Vendor User',
  PROVIDER_EXECUTIVE_ADMIN: 'Provider Admin',
  PROVIDER_USER: 'Provider User',
  ACCOUNT_MANAGER_USER: 'Admin User',
  SUPER_VENDOR: 'Super Vendor',
};

export const TICKET_SUBJECT_LABELS: Record<string, string> = {
  ACCOUNT: 'Account',
  PRICING: 'Pricing',
  ORDER: 'Order',
  CONTRACT: 'Contract',
  INVOICE: 'Invoice',
  OTHER: 'Other',
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  ORDER_COMPLETED: 'Pending Export',
  EXPORTED: 'Exported',
};

// ──────────────────────────────────────────────
// Regex patterns
// ──────────────────────────────────────────────

export const REGEX = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  NAME: /^[a-zA-Z\s]+$/,
  NUMBER: /^[0-9]+$/,
  ALL_NUMBER: /^-?[0-9]*\.?[0-9]+$/,
  URL: /^https?:\/\/.+/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/,
};

// ──────────────────────────────────────────────
// Date formats
// ──────────────────────────────────────────────

export const DATE_FORMAT = 'MM/DD/YYYY';
export const DATE_TIME_FORMAT = 'MM/DD/YYYY hh:mm A';
export const API_DATE_FORMAT = 'YYYY-MM-DD';

// ──────────────────────────────────────────────
// Gender options
// ──────────────────────────────────────────────

export const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
] as const;

// ──────────────────────────────────────────────
// Notification messages (used by Lambda + frontend)
// ──────────────────────────────────────────────

export const NOTIFICATION_MESSAGES = {
  ORDER_CREATED: 'New order has been created',
  VENDOR_ASSIGNED: 'A vendor has been assigned to order',
  VENDOR_CONFIRMED: 'Vendor has confirmed receipt of order',
  VENDOR_DECLINED: 'Vendor has declined order',
  ORDER_CANCELLED: 'Order has been cancelled',
  ORDER_MODIFIED: 'Order modification has been requested',
  ORDER_COMPLETED: 'Order has been completed',
  INVOICE_GENERATED: 'Invoice has been generated',
  INVOICE_SENT: 'Invoice has been sent',
  INVOICE_PAID: 'Invoice has been marked as paid',
  NEW_MESSAGE: 'New message received',
  TICKET_CREATED: 'New support ticket has been created',
  TICKET_REPLIED: 'Support ticket has been replied to',
  TICKET_CLOSED: 'Support ticket has been closed',
  CONTRACT_EXPIRING: 'Contract is expiring soon',
  FEE_SCHEDULE_EXPIRING: 'Fee schedule is expiring soon',
  DELAYED_ORDER: 'Order has been pending vendor confirmation for over 24 hours',
} as const;

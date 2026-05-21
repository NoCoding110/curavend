import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/,
      'Password must include uppercase, lowercase, number, and special character',
    ),
  name: z.string().min(1, 'Name is required'),
  title: z.string().nullish(),
  contact: z.string().nullish(),
  streetAddress: z.string().nullish(),
  state: z.string().nullish(),
  city: z.string().nullish(),
  zip: z.string().nullish(),
  userType: z.enum(['ADMIN', 'HOSPITAL', 'VENDOR']),
  role: z.enum([
    'ACCOUNT_MANAGER',
    'FACILITY_ACCOUNT_MANAGER',
    'FACILITY_USER',
    'VENDOR_ACCOUNT_MANAGER',
    'VENDOR_USER',
    'PROVIDER_EXECUTIVE_ADMIN',
    'PROVIDER_USER',
    'ACCOUNT_MANAGER_USER',
    'SUPER_VENDOR',
  ]),
  accountManagerId: z.string().nullish(),
  providerId: z.string().nullish(),
  hospitalId: z.string().nullish(),
  vendorId: z.string().nullish(),
  superVendorId: z.string().nullish(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().nullish(),
  contact: z.string().nullish(),
  streetAddress: z.string().nullish(),
  state: z.string().nullish(),
  city: z.string().nullish(),
  zip: z.string().nullish(),
  userStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  role: z
    .enum([
      'ACCOUNT_MANAGER',
      'FACILITY_ACCOUNT_MANAGER',
      'FACILITY_USER',
      'VENDOR_ACCOUNT_MANAGER',
      'VENDOR_USER',
      'PROVIDER_EXECUTIVE_ADMIN',
      'PROVIDER_USER',
      'ACCOUNT_MANAGER_USER',
      'SUPER_VENDOR',
    ])
    .optional(),
  approvalStatus: z.enum(['APPROVED', 'PENDING', 'REJECTED']).optional(),
  oigStatus: z.enum(['CLEARED', 'EXCLUDED']).nullish(),
  accountManagerId: z.string().nullish(),
  providerId: z.string().nullish(),
  hospitalId: z.string().nullish(),
  vendorId: z.string().nullish(),
  superVendorId: z.string().nullish(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

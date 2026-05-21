import { z } from 'zod';

const orderItemSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  productCode: z.string().nullish(),
  hcpcsCode: z.string().nullish(),
  quantity: z.number().int().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  description: z.string().nullish(),
  notes: z.string().nullish(),
});

const patientInfoSchema = z.object({
  firstName: z.string().min(1, 'Patient first name is required'),
  lastName: z.string().min(1, 'Patient last name is required'),
  middleName: z.string().nullish(),
  dateOfBirth: z.string().nullish(),
  gender: z.string().nullish(),
  mrn: z.string().nullish(),
  ssn: z.string().nullish(),
  streetAddress: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  zip: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  insuranceProvider: z.string().nullish(),
  insurancePolicyNumber: z.string().nullish(),
  insuranceGroupNumber: z.string().nullish(),
});

export const createOrderSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital is required'),
  vendorId: z.string().nullish(),
  patientInfo: patientInfoSchema,
  priority: z.enum(['routine', 'urgent', 'asap', 'stat']).default('routine'),
  requiredByDate: z.string().nullish(),
  notes: z.string().nullish(),
  agreementSendMethod: z.enum(['EMAIL', 'PRINT', 'BOTH', 'NONE']).nullish(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
});

export const updateOrderSchema = z.object({
  vendorId: z.string().nullish(),
  patientInfo: patientInfoSchema.partial().nullish(),
  priority: z.enum(['routine', 'urgent', 'asap', 'stat']).optional(),
  requiredByDate: z.string().nullish(),
  notes: z.string().nullish(),
  internalNotes: z.string().nullish(),
  agreementSendMethod: z.enum(['EMAIL', 'PRINT', 'BOTH', 'NONE']).nullish(),
  items: z.array(orderItemSchema).optional(),
});

export const assignVendorSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  vendorId: z.string().min(1, 'Vendor ID is required'),
  notes: z.string().nullish(),
});

export const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  subStatus: z.enum([
    'NEW_ORDER',
    'VENDOR_ASSIGNED',
    'VENDOR_CONFIRMED_RECEIPT',
    'VENDOR_DECLINED',
    'FACILITY_CANCELLED',
    'ORDER_REQUESTED_FOR_MODIFY',
    'PATIENT_VISITED_AND_ASSESSED',
    'DELIVERED',
    'PROOF_UPLOADED',
    'ORDER_COMPLETED',
  ]),
  notes: z.string().nullish(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type AssignVendorInput = z.infer<typeof assignVendorSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

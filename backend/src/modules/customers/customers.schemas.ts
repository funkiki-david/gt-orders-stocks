import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const createCustomerSchema = z.object({
  companyName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  billingAddress: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  paymentTerms: z.string().min(1).max(100).default("Net 30"),
});

export const updateCustomerSchema = createCustomerSchema.partial();

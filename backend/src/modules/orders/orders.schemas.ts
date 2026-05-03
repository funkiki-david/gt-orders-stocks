import { z } from "zod";

export const salesOrderLineSchema = z.object({
  skuId: z.string().uuid(),
  quantityOrdered: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "SHIPPED", "COMPLETED", "CANCELLED"]).optional(),
  customerId: z.string().uuid().optional(),
  skuId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(["updatedAt", "orderDate", "totalAmount", "soNumber", "customerName"]).default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  orderDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(salesOrderLineSchema).min(1),
});

export const updateOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  orderDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(salesOrderLineSchema).min(1).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(255).optional(),
});

export const addOrderLineSchema = salesOrderLineSchema;

export const updateOrderLineSchema = salesOrderLineSchema.partial().refine(
  (value) => value.skuId !== undefined || value.quantityOrdered !== undefined || value.unitPrice !== undefined,
  {
    message: "At least one line field must be provided",
  },
);
